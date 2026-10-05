import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/00000000000078_voice_note_transcription.sql"), "utf8");
const dictation = readFileSync(join(process.cwd(), "supabase/migrations/00000000000076_dictation_transcription.sql"), "utf8");

function functionBody(name: string, source = migration): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf("$$", start);
  return source.slice(bodyStart, source.indexOf("$$;", bodyStart + 2));
}

const SERVICE_FUNCTIONS = [
  "claim_dictation_job(uuid)",
  "claim_media_transcription(uuid)",
  "complete_media_transcription(uuid, text, text, text, numeric, text, boolean)",
];

describe("voice note transcription migration", () => {
  it("is additive and creates a Level B, member-readable, server-written media_transcripts table", () => {
    expect(migration).not.toMatch(/\bdrop\s+(table|column|policy|trigger|function|constraint)\b/i);
    expect(migration).toContain("create table public.media_transcripts");
    expect(migration).toContain("media_id uuid primary key references public.trip_media (id) on delete cascade");
    expect(migration).toContain("version bigint not null default 1");
    expect(functionBody("touch_media_transcript")).toContain("new.version = old.version + 1");
    expect(migration).toContain("check (text is null or char_length(text) <= 20000)");
    expect(migration).toContain("alter table public.media_transcripts enable row level security");
    expect(migration).toContain("revoke all on public.media_transcripts from public, anon, authenticated");
    expect(migration).toContain("grant select on public.media_transcripts to authenticated");
    expect(migration).toContain("for select to authenticated using (public.is_trip_member(trip_id))");
    expect(migration).not.toMatch(/create policy[^;]+on public\.media_transcripts\s+for (insert|update|delete|all)/i);
    expect(migration).not.toMatch(/grant (insert|update|delete|all)[^;]+public\.media_transcripts/i);
  });

  it("never adds a transcript column to trip_media or trip_notes, and never writes to them", () => {
    expect(migration).not.toMatch(/alter table public\.(trip_media|trip_notes)/i);
    expect(migration).not.toMatch(/update public\.(trip_media|trip_notes)\b/i);
  });

  it("never deletes voice-note audio", () => {
    expect(migration).not.toMatch(/delete\s+from\s+(storage\.objects|public\.trip_media)/i);
    expect(migration).not.toMatch(/'sweep'/);
  });

  it("queues audio inserts only, without ever blocking the trip_media insert", () => {
    expect(migration).toMatch(
      /create trigger trip_media_queue_transcription\s+after insert on public\.trip_media\s+for each row\s+when \(new\.kind = 'audio' and new\.deleted_at is null\)/,
    );
    const queue = functionBody("queue_media_transcription");
    expect(queue).toContain("on conflict (media_id) do nothing");
    expect(queue).toContain("post_transcribe_audio(jsonb_build_object('kind', 'media', 'id', new.id))");
    expect(queue).toMatch(/exception when others then\s+raise warning/);
  });

  it("claims a live audio row once, within the shared quotas, and returns allow-listed context", () => {
    const claim = functionBody("claim_media_transcription");
    expect(claim).toContain("m.kind = 'audio' and m.deleted_at is null");
    expect(claim).toContain("t.attempts < 3");
    expect(claim).toContain("t.status in ('pending', 'failed')");
    expect(claim).toContain("public.transcription_usage_ms(");
    expect(claim).toContain("> 1800000");
    expect(claim).toContain("> 3600000");
    expect(claim).toContain("'reason', 'quota'");
    expect(claim).toContain("p.preferred_language");
    for (const key of ["mediaId", "storagePath", "contentType", "durationMs", "attempts", "languageHint", "tripName", "destination"]) {
      expect(claim).toContain(`'${key}'`);
    }
    expect(claim).not.toMatch(/\bphone\b|\bemail\b/i);
  });

  it("counts dictation and voice notes against one quota", () => {
    const usage = functionBody("transcription_usage_ms");
    expect(usage).toContain("from public.dictation_jobs d");
    expect(usage).toContain("from public.media_transcripts t");
    expect(functionBody("claim_dictation_job")).toContain("public.transcription_usage_ms(v_job.owner_id, v_job.trip_id, v_job.id)");
  });

  it("re-creates claim_dictation_job identically apart from the quota query", () => {
    const strip = (body: string) =>
      body
        .replace(/select\s+coalesce\(sum\(d\.duration_ms\)[\s\S]+?\);\n/, "")
        .replace(/select u\.user_ms, u\.trip_ms[\s\S]+?u;\n/, "")
        .replace(/\s+/g, " ");
    expect(strip(functionBody("claim_dictation_job"))).toBe(strip(functionBody("claim_dictation_job", dictation)));
  });

  it("completes only a processing row and uses up attempts on permanent failures", () => {
    const complete = functionBody("complete_media_transcription");
    expect(complete).toContain("p_status not in ('done', 'failed')");
    expect(complete).toContain("and status = 'processing'");
    expect(complete).toContain("greatest(attempts, 3)");
    expect(complete).toContain("left(coalesce(p_text, ''), 20000)");
  });

  it("schedules a backstop that resends stalled rows and backfills missing ones", () => {
    const maintenance = functionBody("run_media_transcription_maintenance");
    expect(maintenance).toContain("not exists (select 1 from public.media_transcripts t where t.media_id = m.id)");
    expect(maintenance).toContain("t.attempts < 3");
    expect(maintenance).toContain("m.deleted_at is null");
    expect(migration).toContain(
      "select cron.schedule('media-transcription-maintenance', '*/5 * * * *', 'select public.run_media_transcription_maintenance()')",
    );
  });

  it("publishes media_transcripts to realtime idempotently", () => {
    expect(migration).toMatch(/tablename = 'media_transcripts'\s+\) then\s+alter publication supabase_realtime add table public\.media_transcripts/);
  });

  it("pins search_path on every function and locks execution to the service role", () => {
    const functions = migration.match(/create or replace function public\.\w+\(/g) ?? [];
    const pinned = migration.match(/set search_path = public/g) ?? [];
    expect(pinned).toHaveLength(functions.length);
    for (const signature of SERVICE_FUNCTIONS) {
      expect(migration).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(migration).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(migration).not.toMatch(/grant execute[^;]+to (anon|authenticated|public)/i);
  });
});
