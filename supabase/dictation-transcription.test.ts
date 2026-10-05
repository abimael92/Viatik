import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000076_dictation_transcription.sql"), "utf8");

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf("$$", start);
  return migration.slice(bodyStart, migration.indexOf("$$;", bodyStart + 2));
}

describe("dictation transcription migration", () => {
  it("is additive and creates a Level B, owner-readable dictation_jobs table", () => {
    expect(migration).not.toMatch(/\bdrop\s+(table|column|policy|trigger|function|constraint)\b/i);
    expect(migration).toContain("create table public.dictation_jobs");
    expect(migration).toContain("version bigint not null default 1");
    expect(migration).toContain("created_at timestamptz not null default now()");
    expect(migration).toContain("updated_at timestamptz not null default now()");
    expect(functionBody("touch_dictation_job")).toContain("new.version = old.version + 1");
    expect(migration).toContain("alter table public.dictation_jobs enable row level security");
    expect(migration).toContain("revoke all on public.dictation_jobs from public, anon, authenticated");
    expect(migration).toContain("grant select on public.dictation_jobs to authenticated");
    expect(migration).toContain("for select to authenticated using (owner_id = auth.uid())");
    expect(migration).not.toMatch(/create policy[^;]+on public\.dictation_jobs\s+for (insert|update|delete)/i);
  });

  it("keeps private audio in an owner-only bucket", () => {
    expect(migration).toContain("values ('private-audio', 'private-audio', false, 10485760, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'])");
    for (const action of ["select", "insert", "delete"]) {
      expect(migration).toMatch(new RegExp(`"private_audio_objects_${action}_owner" on storage\\.objects for ${action}`));
    }
    expect(migration.match(/bucket_id = 'private-audio' and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g)).toHaveLength(3);
    expect(migration).not.toMatch(/private_audio_objects_update/);
    expect(migration).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("creates a job only for the caller's uploaded clip on a trip they belong to", () => {
    const create = functionBody("create_dictation_job");
    expect(create).toContain("public.is_trip_member(p_trip_id)");
    expect(create).toContain("'^' || v_uid::text || '/' || p_trip_id::text || '/' || p_id::text");
    expect(create).toContain("o.bucket_id = 'private-audio' and o.name = p_storage_path");
    expect(create).toContain("on conflict (id) do nothing");
    expect(create).toContain("j.owner_id = v_uid");
  });

  it("clears the server copy of the text when the device acknowledges it", () => {
    const ack = functionBody("ack_dictation_job");
    expect(ack).toContain("status = 'consumed', text = null");
    expect(ack).toContain("owner_id = auth.uid()");
  });

  it("claims atomically, enforces quotas, and takes the language hint from the author's profile", () => {
    const claim = functionBody("claim_dictation_job");
    expect(claim).toContain("set status = 'processing', attempts = j.attempts + 1");
    expect(claim).toContain("j.attempts < 3");
    expect(claim).toContain("interval '10 minutes'");
    expect(claim).toContain("interval '24 hours'");
    expect(claim).toContain("1800000");
    expect(claim).toContain("3600000");
    expect(claim).toContain("error_code = 'quota'");
    expect(claim).toContain("p.preferred_language");
    expect(claim).not.toMatch(/\bphone\b/i);
  });

  it("writes results only for claimed jobs and spends the budget on permanent failures", () => {
    const complete = functionBody("complete_dictation_job");
    expect(complete).toContain("p_status not in ('done', 'failed')");
    expect(complete).toContain("and status = 'processing'");
    expect(complete).toContain("left(coalesce(p_text, ''), 20000)");
    expect(complete).toContain("greatest(attempts, 3)");
  });

  it("queues the Edge Function after each insert without blocking it", () => {
    const post = functionBody("post_transcribe_audio");
    expect(migration).toContain("create extension if not exists pg_net");
    expect(post).toContain("net.http_post");
    expect(post).toContain("'transcribe_audio_url'");
    expect(post).toContain("'transcribe_audio_secret'");
    expect(post).toContain("'x-viatik-webhook-secret'");
    expect(post).toContain("exception when others");
    expect(migration).toContain("after insert on public.dictation_jobs");
    expect(functionBody("dispatch_dictation_job")).toContain("jsonb_build_object('kind', 'dictation', 'id', new.id)");
  });

  it("schedules a backstop that resends stalled jobs, sweeps audio, and enforces retention", () => {
    const maintenance = functionBody("run_dictation_maintenance");
    expect(migration).toContain("create extension if not exists pg_cron");
    expect(migration).toContain("cron.schedule('dictation-maintenance', '*/5 * * * *', 'select public.run_dictation_maintenance()')");
    expect(maintenance).toContain("interval '2 minutes'");
    expect(maintenance).toContain("interval '7 days'");
    expect(maintenance).toContain("interval '30 days'");
    expect(maintenance).toContain("audio_deleted_at is not null");
    expect(maintenance).toContain("jsonb_build_object('kind', 'sweep')");
  });

  it("publishes dictation_jobs to realtime idempotently", () => {
    expect(migration).toContain("tablename = 'dictation_jobs'");
    expect(migration).toContain("alter publication supabase_realtime add table public.dictation_jobs");
  });

  it("exposes only the two client RPCs to signed-in users", () => {
    expect(migration).toContain("grant execute on function public.create_dictation_job(uuid, uuid, text, text, integer) to authenticated");
    expect(migration).toContain("grant execute on function public.ack_dictation_job(uuid) to authenticated");
    for (const signature of [
      "claim_dictation_job(uuid)",
      "complete_dictation_job(uuid, text, text, text, text, boolean)",
      "mark_dictation_audio_deleted(uuid[])",
      "list_dictation_audio_cleanup(integer)",
    ]) {
      expect(migration).toContain(`revoke all on function public.${signature} from public, anon, authenticated`);
      expect(migration).toContain(`grant execute on function public.${signature} to service_role`);
    }
    for (const signature of ["post_transcribe_audio(jsonb)", "dispatch_dictation_job()", "run_dictation_maintenance()"]) {
      expect(migration).toContain(`revoke all on function public.${signature} from public, anon, authenticated`);
      expect(migration).not.toContain(`grant execute on function public.${signature}`);
    }
    expect(migration.match(/security definer\s+set search_path = public/g)).toHaveLength(9);
  });
});
