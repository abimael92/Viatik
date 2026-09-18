-- Always read the current public avatar fields from profiles. The profile_directory
-- is a projection and may lag briefly after an account avatar update.
create or replace function public.get_profile_public_data(p_ids uuid[])
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  avatar_seed text,
  public_handle text,
  preferred_currency text,
  preferred_language text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_ids is null then
    return;
  end if;
  if cardinality(p_ids) > 200 then
    raise exception 'Too many profile ids' using errcode = '22023';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(btrim(p.full_name), ''), pd.display_name),
    p.avatar_url,
    p.avatar_seed,
    coalesce(p.public_handle, pd.public_handle),
    p.preferred_currency,
    p.preferred_language
  from public.profiles p
  left join public.profile_directory pd on pd.profile_id = p.id
  where p.id = any(p_ids)
    and (
      p.id = v_uid
      or exists (
        select 1
        from public.trip_members viewer_membership
        join public.trip_members profile_membership
          on profile_membership.trip_id = viewer_membership.trip_id
        join public.trips shared_trip
          on shared_trip.id = viewer_membership.trip_id
        where viewer_membership.user_id = v_uid
          and profile_membership.user_id = p.id
          and shared_trip.deleted_at is null
      )
    );
end;
$$;

revoke all on function public.get_profile_public_data(uuid[]) from public;
grant execute on function public.get_profile_public_data(uuid[]) to authenticated;
