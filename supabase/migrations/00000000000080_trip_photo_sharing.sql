drop policy if exists "trip_media_insert_editors" on public.trip_media;
drop policy if exists "trip_media_update_editors" on public.trip_media;
drop policy if exists "trip_media_delete_editors" on public.trip_media;

create policy "trip_media_insert_member_photo"
  on public.trip_media for insert to authenticated
  with check (
    kind = 'photo'
    and public.is_trip_member(trip_id)
    and created_by = auth.uid()
  );

create policy "trip_media_update_own_photo"
  on public.trip_media for update to authenticated
  using (
    kind = 'photo'
    and created_by = auth.uid()
    and public.is_trip_member(trip_id)
  )
  with check (
    kind = 'photo'
    and created_by = auth.uid()
    and public.is_trip_member(trip_id)
  );

create policy "trip_media_delete_own_photo"
  on public.trip_media for delete to authenticated
  using (
    kind = 'photo'
    and created_by = auth.uid()
    and public.is_trip_member(trip_id)
  );

-- Preserve the legacy editor delete capability for audio while allowing an
-- audio contributor to remove their own clip, including when they are a viewer.
create policy "trip_media_delete_audio_owner_or_editor"
  on public.trip_media for delete to authenticated
  using (
    kind = 'audio'
    and (created_by = auth.uid() or public.is_trip_editor(trip_id))
    and public.is_trip_member(trip_id)
  );

drop policy if exists "trip_media_objects_insert" on storage.objects;
drop policy if exists "trip_media_objects_update" on storage.objects;
drop policy if exists "trip_media_objects_delete" on storage.objects;

create policy "trip_media_objects_insert_member_photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-media'
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic')
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );

create policy "trip_media_objects_update_own_photo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trip-media'
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic')
    and owner_id = auth.uid()::text
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'trip-media'
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic')
    and owner_id = auth.uid()::text
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );

create policy "trip_media_objects_delete_own_photo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-media'
    and array_length(storage.foldername(name), 1) = 1
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'heic')
    and owner_id = auth.uid()::text
    and public.is_trip_member(((storage.foldername(name))[1])::uuid)
  );

-- The voice-note feature retains its editor delete behavior for audio objects.
create policy "trip_media_objects_delete_audio_editors"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-media'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = 'audio'
    and lower(storage.extension(name)) in ('webm', 'm4a', 'ogg', 'mp3')
    and public.is_trip_editor(((storage.foldername(name))[1])::uuid)
  );
