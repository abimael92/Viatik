-- Voice notes: audio clips live in trip_media (kind = 'audio') and the
-- trip-media bucket under {trip_id}/audio/. A trip note may point at one clip.
-- sync_cas_upsert is not replaced: its trip_media insert path populates every
-- column from the payload, and kind/duration_ms never change after insert.

-- 1) trip_media kind and duration
alter table public.trip_media
  add column if not exists kind text not null default 'photo',
  add column if not exists duration_ms integer;

alter table public.trip_media drop constraint if exists trip_media_kind_chk;
alter table public.trip_media
  add constraint trip_media_kind_chk check (kind in ('photo', 'audio'));

alter table public.trip_media drop constraint if exists trip_media_duration_chk;
alter table public.trip_media
  add constraint trip_media_duration_chk check (duration_ms is null or duration_ms between 0 and 600000);

alter table public.trip_media drop constraint if exists trip_media_audio_shape_chk;
alter table public.trip_media
  add constraint trip_media_audio_shape_chk check (
    kind <> 'audio'
    or (
      content_type like 'audio/%'
      and activity_id is null
      and storage_path like trip_id::text || '/audio/%'
    )
  );

create index if not exists trip_media_trip_kind_idx on public.trip_media (trip_id, kind);

-- jsonb_populate_record inserts NULL for keys an older client does not send.
create or replace function public.normalize_trip_media_kind()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.kind := coalesce(new.kind, 'photo');
  elsif new.kind is distinct from old.kind then
    raise exception 'Voice clip kind cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_trip_media_kind on public.trip_media;
create trigger normalize_trip_media_kind
  before insert or update on public.trip_media
  for each row execute function public.normalize_trip_media_kind();

-- 2) Any trip member may record; only the author may edit or delete a clip.
drop policy if exists "trip_media_insert_member_audio" on public.trip_media;
create policy "trip_media_insert_member_audio"
  on public.trip_media for insert to authenticated
  with check (
    kind = 'audio'
    and public.is_trip_member(trip_id)
    and created_by = auth.uid()
  );

drop policy if exists "trip_media_update_own_audio" on public.trip_media;
create policy "trip_media_update_own_audio"
  on public.trip_media for update to authenticated
  using (kind = 'audio' and created_by = auth.uid() and public.is_trip_member(trip_id))
  with check (kind = 'audio' and created_by = auth.uid() and public.is_trip_member(trip_id));

-- 3) trip_notes audio reference. A note with audio may have an empty caption.
-- Cascade (not set null) so a hard-deleted clip never leaves an empty note.
alter table public.trip_notes
  add column if not exists audio_media_id uuid references public.trip_media (id) on delete cascade;

create index if not exists trip_notes_audio_media_idx on public.trip_notes (audio_media_id) where audio_media_id is not null;

alter table public.trip_notes drop constraint if exists trip_notes_content_check;
alter table public.trip_notes drop constraint if exists trip_notes_content_chk;
alter table public.trip_notes
  add constraint trip_notes_content_chk check (
    char_length(content) <= 280
    and (
      char_length(trim(content)) between 1 and 280
      or audio_media_id is not null
    )
  );

create or replace function public.validate_trip_note_audio()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.audio_media_id is distinct from old.audio_media_id then
      raise exception 'Voice note audio cannot be changed' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.audio_media_id is not null and not exists (
    select 1
    from public.trip_media m
    where m.id = new.audio_media_id
      and m.trip_id = new.trip_id
      and m.kind = 'audio'
      and m.created_by = new.user_id
  ) then
    raise exception 'Voice note audio must be the author''s clip from the same trip' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_trip_note_audio on public.trip_notes;
create trigger validate_trip_note_audio
  before insert or update of audio_media_id on public.trip_notes
  for each row execute function public.validate_trip_note_audio();

-- 4) Bucket formats. A null list already allows every type.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type order by mime_type)
  from unnest(allowed_mime_types || array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg']) as mime_type
)
where id = 'trip-media' and allowed_mime_types is not null;

-- 5) Storage objects under {trip_id}/audio/. Editor policies from migration 8 still apply.
drop policy if exists "trip_media_objects_insert_member_audio" on storage.objects;
create policy "trip_media_objects_insert_member_audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-media'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = 'audio'
    and lower(storage.extension(name)) in ('webm', 'm4a', 'ogg', 'mp3')
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_media_objects_update_own_audio" on storage.objects;
create policy "trip_media_objects_update_own_audio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-media'
    and (storage.foldername(name))[2] = 'audio'
    and owner_id = auth.uid()::text
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'trip-media'
    and (storage.foldername(name))[2] = 'audio'
    and owner_id = auth.uid()::text
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_media_objects_delete_own_audio" on storage.objects;
create policy "trip_media_objects_delete_own_audio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-media'
    and (storage.foldername(name))[2] = 'audio'
    and owner_id = auth.uid()::text
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );
