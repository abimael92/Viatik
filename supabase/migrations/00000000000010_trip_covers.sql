insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-covers', 'trip-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "trip_covers_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'trip-covers');

create policy "trip_covers_insert_self"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trip-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "trip_covers_update_self"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'trip-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "trip_covers_delete_self"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trip-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
