create or replace function public.is_trip_creator(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trips
    where id = p_trip_id and owner_id = auth.uid()
  );
$$;

revoke all on function public.is_trip_creator(uuid) from public;
grant execute on function public.is_trip_creator(uuid) to authenticated;

drop policy "trip_members_insert_editors_or_self_owner" on public.trip_members;
create policy "trip_members_insert_editors_or_self_owner"
  on public.trip_members for insert
  to authenticated
  with check (
    public.is_trip_editor(trip_id)
    or (
      user_id = auth.uid()
      and role = 'owner'
      and public.is_trip_creator(trip_id)
    )
  );
