-- Security follow-up for trip photos and voice-note media. Keep this helper
-- scoped to media/storage so the behavior of public.is_trip_member is unchanged.
create or replace function public.is_active_trip_media_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips t
    join public.trip_members tm on tm.trip_id = t.id
    where t.id = p_trip_id
      and t.deleted_at is null
      and tm.user_id = auth.uid()
      and tm.removed_at is null
      and tm.deleted_at is null
  );
$$;
revoke all on function public.is_active_trip_media_member(uuid) from public;
grant execute on function public.is_active_trip_media_member(uuid) to authenticated;

-- Replace, rather than supplement, the broad SELECT policies so PostgreSQL's
-- permissive-policy OR semantics cannot preserve stale membership access.
drop policy if exists "trip_media_select_members" on public.trip_media;
create policy "trip_media_select_members"
  on public.trip_media for select to authenticated
  using (public.is_active_trip_media_member(trip_id));

drop policy if exists "trip_media_insert_member_photo" on public.trip_media;
create policy "trip_media_insert_member_photo"
  on public.trip_media for insert to authenticated
  with check (
    kind = 'photo'
    and public.is_active_trip_media_member(trip_id)
    and created_by = auth.uid()
  );

drop policy if exists "trip_media_update_own_photo" on public.trip_media;
create policy "trip_media_update_own_photo"
  on public.trip_media for update to authenticated
  using (kind = 'photo' and created_by = auth.uid() and public.is_active_trip_media_member(trip_id))
  with check (kind = 'photo' and created_by = auth.uid() and public.is_active_trip_media_member(trip_id));

drop policy if exists "trip_media_delete_own_photo" on public.trip_media;
create policy "trip_media_delete_own_photo"
  on public.trip_media for delete to authenticated
  using (kind = 'photo' and created_by = auth.uid() and public.is_active_trip_media_member(trip_id));

drop policy if exists "trip_media_objects_select" on storage.objects;
create policy "trip_media_objects_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-media'
    and (
      name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|heic)$'
      or name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/audio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webm|m4a|ogg|mp3)$'
    )
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  );

-- Photos can only be inserted at the exact path derived from their metadata
-- UUIDs and only by the Storage owner who is uploading the object.
drop policy if exists "trip_media_objects_insert_member_photo" on storage.objects;
create policy "trip_media_objects_insert_member_photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-media'
    and owner_id = auth.uid()::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|heic)$'
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_media_objects_update_own_photo" on storage.objects;
create policy "trip_media_objects_update_own_photo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-media'
    and owner_id = auth.uid()::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|heic)$'
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'trip-media'
    and owner_id = auth.uid()::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|heic)$'
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_media_objects_delete_own_photo" on storage.objects;
create policy "trip_media_objects_delete_own_photo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-media'
    and owner_id = auth.uid()::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp|heic)$'
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  );

-- Audio policies are recreated with the same author/editor rights established
-- by migrations 74 and 80, but use the active membership check as well.
drop policy if exists "trip_media_insert_member_audio" on public.trip_media;
create policy "trip_media_insert_member_audio"
  on public.trip_media for insert to authenticated
  with check (
    kind = 'audio'
    and public.is_active_trip_media_member(trip_id)
    and created_by = auth.uid()
  );

drop policy if exists "trip_media_update_own_audio" on public.trip_media;
create policy "trip_media_update_own_audio"
  on public.trip_media for update to authenticated
  using (kind = 'audio' and created_by = auth.uid() and public.is_active_trip_media_member(trip_id))
  with check (kind = 'audio' and created_by = auth.uid() and public.is_active_trip_media_member(trip_id));

drop policy if exists "trip_media_delete_audio_owner_or_editor" on public.trip_media;
create policy "trip_media_delete_audio_owner_or_editor"
  on public.trip_media for delete to authenticated
  using (
    kind = 'audio'
    and (created_by = auth.uid() or public.is_trip_editor(trip_id))
    and public.is_active_trip_media_member(trip_id)
  );

drop policy if exists "trip_media_objects_insert_member_audio" on storage.objects;
create policy "trip_media_objects_insert_member_audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/audio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webm|m4a|ogg|mp3)$'
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_media_objects_update_own_audio" on storage.objects;
create policy "trip_media_objects_update_own_audio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/audio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webm|m4a|ogg|mp3)$'
    and owner_id = auth.uid()::text
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'trip-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/audio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webm|m4a|ogg|mp3)$'
    and owner_id = auth.uid()::text
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_media_objects_delete_own_audio" on storage.objects;
create policy "trip_media_objects_delete_own_audio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/audio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webm|m4a|ogg|mp3)$'
    and owner_id = auth.uid()::text
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip_media_objects_delete_audio_editors" on storage.objects;
create policy "trip_media_objects_delete_audio_editors"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/audio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webm|m4a|ogg|mp3)$'
    and public.is_trip_editor(((storage.foldername(name))[1])::uuid)
    and public.is_active_trip_media_member(((storage.foldername(name))[1])::uuid)
  );

-- Validate every new photo and every photo update. The object existence check
-- is skipped for tombstones, which may be recorded before their first upload.
create or replace function public.validate_trip_media_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.trip_id is distinct from old.trip_id
      or new.created_by is distinct from old.created_by
      or new.storage_path is distinct from old.storage_path
      or new.kind is distinct from old.kind
      or new.content_type is distinct from old.content_type
      or new.byte_size is distinct from old.byte_size
    then
      raise exception 'Trip media identity and content metadata are immutable' using errcode = '42501';
    end if;
  end if;

  if new.kind = 'photo' then
    if new.content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic') then
      raise exception 'Unsupported photo content type' using errcode = '23514';
    end if;
    if new.byte_size < 1 or new.byte_size > 10485760 then
      raise exception 'Photo size must be between 1 byte and 10 MiB' using errcode = '23514';
    end if;
    if new.storage_path !~ ('^' || new.trip_id::text || '/' || new.id::text || '[.](jpg|jpeg|png|webp|heic)$') then
      raise exception 'Photo storage path must match its trip and media identifiers' using errcode = '23514';
    end if;
    if (new.content_type = 'image/jpeg' and split_part(new.storage_path, '.', 2) not in ('jpg', 'jpeg'))
      or (new.content_type = 'image/png' and split_part(new.storage_path, '.', 2) <> 'png')
      or (new.content_type = 'image/webp' and split_part(new.storage_path, '.', 2) <> 'webp')
      or (new.content_type = 'image/heic' and split_part(new.storage_path, '.', 2) <> 'heic')
    then
      raise exception 'Photo storage extension does not match its content type' using errcode = '23514';
    end if;
    if new.activity_id is not null and not exists (
      select 1 from public.activities a where a.id = new.activity_id and a.trip_id = new.trip_id
    ) then
      raise exception 'Photo activity must belong to its trip' using errcode = '23514';
    end if;
    if new.deleted_at is null and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'trip-media'
        and o.name = new.storage_path
        and o.owner_id = new.created_by::text
    ) then
      raise exception 'A live photo requires its creator-owned Storage object' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_trip_media_metadata() from public;
drop trigger if exists validate_trip_media_metadata on public.trip_media;
create trigger validate_trip_media_metadata
  before insert or update on public.trip_media
  for each row execute function public.validate_trip_media_metadata();

-- Use migration 17's invitation identity/authorization checks and only extend
-- its existing membership upsert to clear soft-removal state on reacceptance.
create or replace function public.accept_trip_invitation(p_invitation_id uuid)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.trip_invitations;
  membership public.trip_members;
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into invitation from public.trip_invitations where id = p_invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() then raise exception 'Invitation is unavailable'; end if;
  if invitation.invited_user_id is not null then
    if invitation.invited_user_id <> actor then raise exception 'Invitation does not belong to this user'; end if;
  elsif lower(invitation.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Invitation does not belong to this user';
  end if;
  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (invitation.trip_id, actor, invitation.role, invitation.invited_by)
  on conflict (trip_id, user_id) do update set
    role = excluded.role,
    updated_at = now(),
    removed_at = null,
    removed_by = null,
    deleted_at = null,
    deleted_by = null
  returning * into membership;
  update public.trip_invitations set status = 'accepted', invited_user_id = actor where id = p_invitation_id;
  return membership;
end;
$$;
revoke all on function public.accept_trip_invitation(uuid) from public;
grant execute on function public.accept_trip_invitation(uuid) to authenticated;
