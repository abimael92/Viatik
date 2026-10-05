-- Audio notes Phase 3: private journal dictation transcribed by OpenAI whisper-1
-- (spec: .ai/specs/audio-notes.md). Strictly additive.
--
-- Flow: the client uploads to private-audio/{owner}/{trip}/{job}.{ext}, then calls
-- create_dictation_job. The insert trigger POSTs { kind: 'dictation', id } to the
-- transcribe-audio Edge Function, which claims the job, transcribes it, writes the
-- text, and deletes the audio through the Storage API (D3). A pg_cron job re-sends
-- stalled jobs and asks the function to sweep audio it could not delete.
--
-- Setup (once per environment, not stored in this migration):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/transcribe-audio', 'transcribe_audio_url');
--   select vault.create_secret('<random secret>', 'transcribe_audio_secret');
-- The same secret is set on the Edge Function as TRANSCRIBE_WEBHOOK_SECRET.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Level B: owner-scoped server record with version; clients read their own rows only.
create table public.dictation_jobs (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 200),
  content_type text not null check (content_type in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg')),
  duration_ms integer not null check (duration_ms between 1 and 600000),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed', 'skipped', 'consumed')),
  text text check (text is null or char_length(text) <= 20000),
  language text check (language is null or language ~ '^[a-z]{2}$'),
  attempts integer not null default 0 check (attempts between 0 and 10),
  error_code text check (error_code is null or char_length(error_code) <= 32),
  audio_deleted_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create index dictation_jobs_owner_created_idx on public.dictation_jobs (owner_id, created_at desc);
create index dictation_jobs_trip_created_idx on public.dictation_jobs (trip_id, created_at desc);
create index dictation_jobs_open_idx on public.dictation_jobs (status, updated_at)
  where status in ('pending', 'processing', 'failed');
create index dictation_jobs_audio_cleanup_idx on public.dictation_jobs (updated_at)
  where audio_deleted_at is null;

create or replace function public.touch_dictation_job()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;

create trigger dictation_jobs_touch
before update on public.dictation_jobs
for each row execute function public.touch_dictation_job();

alter table public.dictation_jobs enable row level security;
revoke all on public.dictation_jobs from public, anon, authenticated;
grant select on public.dictation_jobs to authenticated;
create policy "dictation_jobs_select_owner" on public.dictation_jobs
  for select to authenticated using (owner_id = auth.uid());

-- Private bucket: only the owner can read, upload, or delete under their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-audio', 'private-audio', false, 10485760, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'])
on conflict (id) do nothing;

create policy "private_audio_objects_select_owner" on storage.objects for select to authenticated using (
  bucket_id = 'private-audio' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "private_audio_objects_insert_owner" on storage.objects for insert to authenticated with check (
  bucket_id = 'private-audio' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "private_audio_objects_delete_owner" on storage.objects for delete to authenticated using (
  bucket_id = 'private-audio' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Client RPC. The job is created only after its audio is in the bucket, so the insert
-- trigger is the "upload finished" signal.
create or replace function public.create_dictation_job(
  p_id uuid,
  p_trip_id uuid,
  p_storage_path text,
  p_content_type text,
  p_duration_ms integer
)
returns public.dictation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.dictation_jobs;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_trip_member(p_trip_id) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;
  if p_storage_path is null
    or p_storage_path !~ ('^' || v_uid::text || '/' || p_trip_id::text || '/' || p_id::text || '\.(webm|m4a|ogg|mp3)$') then
    raise exception 'Invalid dictation audio path' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'private-audio' and o.name = p_storage_path
  ) then
    raise exception 'Dictation audio has not been uploaded' using errcode = 'P0002';
  end if;

  insert into public.dictation_jobs (id, owner_id, trip_id, storage_path, content_type, duration_ms)
  values (p_id, v_uid, p_trip_id, p_storage_path, lower(btrim(p_content_type)), p_duration_ms)
  on conflict (id) do nothing
  returning * into v_job;

  if not found then
    select * into v_job from public.dictation_jobs j where j.id = p_id and j.owner_id = v_uid;
    if not found then
      raise exception 'Dictation job id is already in use' using errcode = '23505';
    end if;
  end if;
  return v_job;
end;
$$;

-- Client RPC. Called once the transcript is in the local journal; the server keeps no text (D1, D3).
create or replace function public.ack_dictation_job(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dictation_jobs
  set status = 'consumed', text = null, consumed_at = now()
  where id = p_id
    and owner_id = auth.uid()
    and status in ('done', 'failed', 'skipped');
  return found;
end;
$$;

-- Service RPC. Claims a job exactly once, enforces the daily quotas, and returns the
-- allow-listed context the Edge Function needs, including the author's language hint.
create or replace function public.claim_dictation_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.dictation_jobs;
  v_user_ms bigint;
  v_trip_ms bigint;
  v_language text;
begin
  update public.dictation_jobs j
  set status = 'processing', attempts = j.attempts + 1, error_code = null
  where j.id = p_job_id
    and j.attempts < 3
    and (
      j.status in ('pending', 'failed')
      or (j.status = 'processing' and j.updated_at < now() - interval '10 minutes')
    )
  returning * into v_job;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_claimable');
  end if;

  select
    coalesce(sum(d.duration_ms) filter (where d.owner_id = v_job.owner_id), 0),
    coalesce(sum(d.duration_ms) filter (where d.trip_id = v_job.trip_id), 0)
  into v_user_ms, v_trip_ms
  from public.dictation_jobs d
  where d.id <> v_job.id
    and d.created_at > now() - interval '24 hours'
    and d.status in ('processing', 'done', 'consumed')
    and (d.owner_id = v_job.owner_id or d.trip_id = v_job.trip_id);

  -- 30 transcribed minutes per user and 60 per trip in any 24 hours.
  if v_user_ms + v_job.duration_ms > 1800000 or v_trip_ms + v_job.duration_ms > 3600000 then
    update public.dictation_jobs set status = 'skipped', error_code = 'quota' where id = v_job.id;
    return jsonb_build_object('claimed', false, 'reason', 'quota', 'storagePath', v_job.storage_path);
  end if;

  select lower(btrim(p.preferred_language)) into v_language
  from public.profiles p where p.id = v_job.owner_id;
  if v_language is null or v_language !~ '^[a-z]{2}$' then
    v_language := null;
  end if;

  return jsonb_build_object(
    'claimed', true,
    'job', jsonb_build_object(
      'id', v_job.id,
      'storagePath', v_job.storage_path,
      'contentType', v_job.content_type,
      'durationMs', v_job.duration_ms,
      'attempts', v_job.attempts,
      'languageHint', v_language
    )
  );
end;
$$;

-- Service RPC. Writes the outcome of a claimed job. Non-retryable failures use up the
-- attempt budget so the backstop does not resend them.
create or replace function public.complete_dictation_job(
  p_job_id uuid,
  p_status text,
  p_text text,
  p_language text,
  p_error_code text,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('done', 'failed') then
    raise exception 'Invalid dictation job status' using errcode = '22023';
  end if;

  update public.dictation_jobs
  set status = p_status,
      text = case when p_status = 'done' then left(coalesce(p_text, ''), 20000) end,
      language = case when p_status = 'done' and p_language ~ '^[a-z]{2}$' then p_language end,
      error_code = case when p_status = 'failed' then left(coalesce(nullif(btrim(p_error_code), ''), 'unknown'), 32) end,
      attempts = case
        when p_status = 'failed' and not coalesce(p_retryable, false) then greatest(attempts, 3)
        else attempts
      end
  where id = p_job_id
    and status = 'processing';
  return found;
end;
$$;

create or replace function public.mark_dictation_audio_deleted(p_job_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.dictation_jobs
  set audio_deleted_at = now()
  where id = any (p_job_ids)
    and audio_deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Service RPC for the sweep: audio that is no longer needed but still in the bucket.
create or replace function public.list_dictation_audio_cleanup(p_limit integer)
returns table (job_id uuid, storage_path text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.storage_path
  from public.dictation_jobs d
  where d.audio_deleted_at is null
    and (d.status in ('done', 'consumed', 'skipped') or (d.status = 'failed' and d.attempts >= 3))
  order by d.updated_at
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;

-- Queues a POST to transcribe-audio after commit. Never raises, so it cannot block writes.
create or replace function public.post_transcribe_audio(p_body jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select ds.decrypted_secret into v_url
  from vault.decrypted_secrets ds where ds.name = 'transcribe_audio_url';
  select ds.decrypted_secret into v_secret
  from vault.decrypted_secrets ds where ds.name = 'transcribe_audio_secret';

  if v_url is null or v_secret is null then
    return false;
  end if;

  perform net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-viatik-webhook-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  return true;
exception when others then
  raise warning 'transcribe-audio request could not be queued (SQLSTATE %)', sqlstate;
  return false;
end;
$$;

create or replace function public.dispatch_dictation_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.post_transcribe_audio(jsonb_build_object('kind', 'dictation', 'id', new.id));
  return new;
end;
$$;

create trigger dictation_jobs_dispatch_transcription
after insert on public.dictation_jobs
for each row execute function public.dispatch_dictation_job();

-- Backstop and retention (every 5 minutes). Webhooks are fire-and-forget.
create or replace function public.run_dictation_maintenance()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  update public.dictation_jobs
  set text = null
  where text is not null
    and created_at < now() - interval '7 days';

  delete from public.dictation_jobs
  where status = 'consumed'
    and consumed_at < now() - interval '30 days'
    and audio_deleted_at is not null;

  for v_job_id in
    select d.id
    from public.dictation_jobs d
    where d.attempts < 3
      and (
        (d.status = 'pending' and d.created_at < now() - interval '2 minutes')
        or (d.status = 'failed' and d.updated_at < now() - interval '2 minutes')
        or (d.status = 'processing' and d.updated_at < now() - interval '10 minutes')
      )
    order by d.created_at
    limit 50
  loop
    perform public.post_transcribe_audio(jsonb_build_object('kind', 'dictation', 'id', v_job_id));
  end loop;

  if exists (
    select 1
    from public.dictation_jobs d
    where d.audio_deleted_at is null
      and d.updated_at < now() - interval '5 minutes'
      and (d.status in ('done', 'consumed', 'skipped') or (d.status = 'failed' and d.attempts >= 3))
  ) then
    perform public.post_transcribe_audio(jsonb_build_object('kind', 'sweep'));
  end if;
end;
$$;

select cron.schedule('dictation-maintenance', '*/5 * * * *', 'select public.run_dictation_maintenance()');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dictation_jobs'
  ) then
    alter publication supabase_realtime add table public.dictation_jobs;
  end if;
end $$;

revoke all on function public.create_dictation_job(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.ack_dictation_job(uuid) from public, anon, authenticated;
revoke all on function public.claim_dictation_job(uuid) from public, anon, authenticated;
revoke all on function public.complete_dictation_job(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.mark_dictation_audio_deleted(uuid[]) from public, anon, authenticated;
revoke all on function public.list_dictation_audio_cleanup(integer) from public, anon, authenticated;
revoke all on function public.post_transcribe_audio(jsonb) from public, anon, authenticated;
revoke all on function public.dispatch_dictation_job() from public, anon, authenticated;
revoke all on function public.run_dictation_maintenance() from public, anon, authenticated;
revoke all on function public.touch_dictation_job() from public, anon, authenticated;

grant execute on function public.create_dictation_job(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.ack_dictation_job(uuid) to authenticated;
grant execute on function public.claim_dictation_job(uuid) to service_role;
grant execute on function public.complete_dictation_job(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.mark_dictation_audio_deleted(uuid[]) to service_role;
grant execute on function public.list_dictation_audio_cleanup(integer) to service_role;
