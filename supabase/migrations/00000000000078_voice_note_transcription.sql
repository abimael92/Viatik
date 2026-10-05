-- Audio notes Phase 3: crew voice notes transcribed by OpenAI whisper-1
-- (spec: .ai/specs/audio-notes.md). Strictly additive. Requires migrations 74 and 76.
--
-- Flow: an audio row lands in trip_media (sync_cas_upsert after the upload). The insert
-- trigger creates a pending media_transcripts row and POSTs { kind: 'media', id } to the
-- transcribe-audio Edge Function through post_transcribe_audio (migration 76, same Vault
-- secrets). The function claims the row, transcribes the trip-media object, and writes
-- the transcript here. The audio stays in trip-media for playback.
--
-- Transcripts live in their own table, not on trip_media or trip_notes: a server write
-- to those rows would bump updated_at/version and turn the author's offline edits into
-- CAS conflicts.

-- Level B: server-written record with version; any trip member may read it.
create table public.media_transcripts (
  media_id uuid primary key references public.trip_media (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed', 'skipped')),
  text text check (text is null or char_length(text) <= 20000),
  language text check (language is null or language ~ '^[a-z]{2}$'),
  duration_seconds numeric(8, 2) check (duration_seconds is null or duration_seconds between 0 and 3600),
  attempts integer not null default 0 check (attempts between 0 and 10),
  error_code text check (error_code is null or char_length(error_code) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create index media_transcripts_trip_created_idx on public.media_transcripts (trip_id, created_at desc);
create index media_transcripts_owner_created_idx on public.media_transcripts (owner_id, created_at desc);
create index media_transcripts_open_idx on public.media_transcripts (status, updated_at)
  where status in ('pending', 'processing', 'failed');

create or replace function public.touch_media_transcript()
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

create trigger media_transcripts_touch
before update on public.media_transcripts
for each row execute function public.touch_media_transcript();

-- Read-only for clients (D4): no insert, update, or delete grants or policies.
alter table public.media_transcripts enable row level security;
revoke all on public.media_transcripts from public, anon, authenticated;
grant select on public.media_transcripts to authenticated;
create policy "media_transcripts_select_member" on public.media_transcripts
  for select to authenticated using (public.is_trip_member(trip_id));

-- Transcribed audio in the last 24 hours across dictation and voice notes, for the
-- shared quotas. A voice note without a stored duration counts as the 120 s cap.
create or replace function public.transcription_usage_ms(p_owner_id uuid, p_trip_id uuid, p_exclude_id uuid)
returns table (user_ms bigint, trip_ms bigint)
language sql
stable
security definer
set search_path = public
as $$
  with usage as (
    select d.owner_id, d.trip_id, d.duration_ms::bigint as ms
    from public.dictation_jobs d
    where d.id <> p_exclude_id
      and d.created_at > now() - interval '24 hours'
      and d.status in ('processing', 'done', 'consumed')
      and (d.owner_id = p_owner_id or d.trip_id = p_trip_id)
    union all
    select t.owner_id, t.trip_id, coalesce(m.duration_ms, 120000)::bigint
    from public.media_transcripts t
    join public.trip_media m on m.id = t.media_id
    where t.media_id <> p_exclude_id
      and t.created_at > now() - interval '24 hours'
      and t.status in ('processing', 'done')
      and (t.owner_id = p_owner_id or t.trip_id = p_trip_id)
  )
  select
    coalesce(sum(u.ms) filter (where u.owner_id = p_owner_id), 0)::bigint,
    coalesce(sum(u.ms) filter (where u.trip_id = p_trip_id), 0)::bigint
  from usage u;
$$;

-- Same as migration 76, except the quota now also counts voice-note minutes.
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

  select u.user_ms, u.trip_ms into v_user_ms, v_trip_ms
  from public.transcription_usage_ms(v_job.owner_id, v_job.trip_id, v_job.id) u;

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

-- Service RPC. Claims a voice note exactly once, enforces the shared quotas, and returns
-- the allow-listed context: the author's language hint plus trip name and destination as
-- a Whisper vocabulary prompt. Creates the transcript row when the trigger could not, so
-- a plain Database Webhook on trip_media also works.
create or replace function public.claim_media_transcription(p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_media public.trip_media;
  v_transcript public.media_transcripts;
  v_duration_ms bigint;
  v_user_ms bigint;
  v_trip_ms bigint;
  v_language text;
  v_trip_name text;
  v_destination text;
begin
  select * into v_media
  from public.trip_media m
  where m.id = p_media_id and m.kind = 'audio' and m.deleted_at is null;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_audio');
  end if;

  insert into public.media_transcripts (media_id, trip_id, owner_id)
  values (v_media.id, v_media.trip_id, v_media.created_by)
  on conflict (media_id) do nothing;

  update public.media_transcripts t
  set status = 'processing', attempts = t.attempts + 1, error_code = null
  where t.media_id = p_media_id
    and t.attempts < 3
    and (
      t.status in ('pending', 'failed')
      or (t.status = 'processing' and t.updated_at < now() - interval '10 minutes')
    )
  returning * into v_transcript;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_claimable');
  end if;

  v_duration_ms := coalesce(v_media.duration_ms, 120000);
  select u.user_ms, u.trip_ms into v_user_ms, v_trip_ms
  from public.transcription_usage_ms(v_transcript.owner_id, v_transcript.trip_id, v_transcript.media_id) u;

  -- Same budget as dictation: 30 minutes per user and 60 per trip in any 24 hours.
  if v_user_ms + v_duration_ms > 1800000 or v_trip_ms + v_duration_ms > 3600000 then
    update public.media_transcripts set status = 'skipped', error_code = 'quota' where media_id = v_transcript.media_id;
    return jsonb_build_object('claimed', false, 'reason', 'quota');
  end if;

  select lower(btrim(p.preferred_language)) into v_language
  from public.profiles p where p.id = v_transcript.owner_id;
  if v_language is null or v_language !~ '^[a-z]{2}$' then
    v_language := null;
  end if;

  select nullif(btrim(t.name), ''), nullif(btrim(t.destination), '') into v_trip_name, v_destination
  from public.trips t where t.id = v_media.trip_id;

  return jsonb_build_object(
    'claimed', true,
    'job', jsonb_build_object(
      'mediaId', v_media.id,
      'storagePath', v_media.storage_path,
      'contentType', v_media.content_type,
      'durationMs', v_media.duration_ms,
      'attempts', v_transcript.attempts,
      'languageHint', v_language,
      'tripName', left(v_trip_name, 100),
      'destination', left(v_destination, 100)
    )
  );
end;
$$;

-- Service RPC. Writes the outcome of a claimed voice note. Non-retryable failures use up
-- the attempt budget so the backstop does not resend them. Never touches trip-media.
create or replace function public.complete_media_transcription(
  p_media_id uuid,
  p_status text,
  p_text text,
  p_language text,
  p_duration_seconds numeric,
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
    raise exception 'Invalid media transcription status' using errcode = '22023';
  end if;

  update public.media_transcripts
  set status = p_status,
      text = case when p_status = 'done' then left(coalesce(p_text, ''), 20000) end,
      language = case when p_status = 'done' and p_language ~ '^[a-z]{2}$' then p_language end,
      duration_seconds = case
        when p_status = 'done' and p_duration_seconds between 0 and 3600 then round(p_duration_seconds, 2)
      end,
      error_code = case when p_status = 'failed' then left(coalesce(nullif(btrim(p_error_code), ''), 'unknown'), 32) end,
      attempts = case
        when p_status = 'failed' and not coalesce(p_retryable, false) then greatest(attempts, 3)
        else attempts
      end
  where media_id = p_media_id
    and status = 'processing';
  return found;
end;
$$;

-- After an audio row is inserted. Never raises: a failure here must not roll back the
-- trip_media insert (the sync engine would retry the upload). The backstop fills gaps.
create or replace function public.queue_media_transcription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.media_transcripts (media_id, trip_id, owner_id)
    values (new.id, new.trip_id, new.created_by)
    on conflict (media_id) do nothing;
    perform public.post_transcribe_audio(jsonb_build_object('kind', 'media', 'id', new.id));
  exception when others then
    raise warning 'voice note transcription could not be queued (SQLSTATE %)', sqlstate;
  end;
  return new;
end;
$$;

create trigger trip_media_queue_transcription
after insert on public.trip_media
for each row
when (new.kind = 'audio' and new.deleted_at is null)
execute function public.queue_media_transcription();

-- Backstop (every 5 minutes). Webhooks are fire-and-forget.
create or replace function public.run_media_transcription_maintenance()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_media_id uuid;
begin
  -- Audio rows whose trigger could not create a transcript row.
  for v_media_id in
    insert into public.media_transcripts (media_id, trip_id, owner_id)
    select m.id, m.trip_id, m.created_by
    from public.trip_media m
    where m.kind = 'audio'
      and m.deleted_at is null
      and m.created_at > now() - interval '24 hours'
      and m.created_at < now() - interval '2 minutes'
      and not exists (select 1 from public.media_transcripts t where t.media_id = m.id)
    order by m.created_at
    limit 50
    on conflict (media_id) do nothing
    returning media_id
  loop
    perform public.post_transcribe_audio(jsonb_build_object('kind', 'media', 'id', v_media_id));
  end loop;

  for v_media_id in
    select t.media_id
    from public.media_transcripts t
    join public.trip_media m on m.id = t.media_id
    where t.attempts < 3
      and m.deleted_at is null
      and (
        (t.status = 'pending' and t.created_at < now() - interval '2 minutes')
        or (t.status = 'failed' and t.updated_at < now() - interval '2 minutes')
        or (t.status = 'processing' and t.updated_at < now() - interval '10 minutes')
      )
    order by t.created_at
    limit 50
  loop
    perform public.post_transcribe_audio(jsonb_build_object('kind', 'media', 'id', v_media_id));
  end loop;
end;
$$;

select cron.schedule('media-transcription-maintenance', '*/5 * * * *', 'select public.run_media_transcription_maintenance()');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'media_transcripts'
  ) then
    alter publication supabase_realtime add table public.media_transcripts;
  end if;
end $$;

revoke all on function public.touch_media_transcript() from public, anon, authenticated;
revoke all on function public.transcription_usage_ms(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_dictation_job(uuid) from public, anon, authenticated;
revoke all on function public.claim_media_transcription(uuid) from public, anon, authenticated;
revoke all on function public.complete_media_transcription(uuid, text, text, text, numeric, text, boolean) from public, anon, authenticated;
revoke all on function public.queue_media_transcription() from public, anon, authenticated;
revoke all on function public.run_media_transcription_maintenance() from public, anon, authenticated;

grant execute on function public.claim_dictation_job(uuid) to service_role;
grant execute on function public.claim_media_transcription(uuid) to service_role;
grant execute on function public.complete_media_transcription(uuid, text, text, text, numeric, text, boolean) to service_role;
