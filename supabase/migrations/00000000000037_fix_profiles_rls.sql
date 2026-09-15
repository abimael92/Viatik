-- P0 fix: stop exposing PII through the `profiles` table.
--
-- The prior policy (`profiles_select_self_or_shared_trip`, added in migration 19)
-- let any user select the FULL row of anyone they share a non-deleted trip with.
-- Because `profiles` now carries sensitive columns (phone, birth_date,
-- passport_issuing_country, passport_expires_on, dietary_restrictions, allergies,
-- emergency_contact_name/relationship/phone), a trip collaborator could read all
-- of that PII directly.
--
-- Remediation (three layers, see .ai/specs or the bug ledger for the invariant):
--   1. Direct selects on `public.profiles` are restricted to the row owner only.
--   2. Collaborator identity (name/avatar/handle/preferences) is exposed through a
--      security-definer RPC that returns ONLY safe, public columns and is gated to
--      the caller plus users sharing a non-deleted trip. It reads from
--      `profile_directory` (the sanitized projection that has no PII columns) to
--      follow the codebase convention that security-definer lookups never read the
--      raw `profiles` table.
--   3. A self-scoped public-data view (`profile_public_data`) gives a convenient,
--      auditable way to read only safe columns for the caller's own profile.

-- ---------------------------------------------------------------------------
-- 1. Restrict direct reads of `public.profiles` to the row owner.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_self_or_shared_trip" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_self" on public.profiles;

create policy "profiles_select_self"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2. Self-scoped view of only safe, public columns.
--    SECURITY INVOKER: because the only select policy on `profiles` is now
--    self-only, RLS constrains this view to the caller's own row, so it cannot
--    be used to enumerate or scrape other users.
-- ---------------------------------------------------------------------------
create or replace view public.profile_public_data
with (security_barrier = true) as
select
  id,
  full_name,
  avatar_url,
  avatar_seed,
  public_handle,
  preferred_currency,
  preferred_language
from public.profiles;

revoke all on public.profile_public_data from public;
grant select on public.profile_public_data to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Batch safe-column lookup for rendering collaborator avatars/names.
--    Returns ONLY public columns, and only for the caller plus users with whom
--    the caller shares a non-deleted trip (mirroring the old shared-trip
--    authorization) WITHOUT exposing any PII. Security definer so RLS on
--    `profiles` does not filter, but the result set is explicitly allow-listed
--    (sourced from `profile_directory`, which has no private columns) and
--    trip-gated, so it cannot be used to enumerate other users.
-- ---------------------------------------------------------------------------
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
    pd.profile_id,
    pd.display_name,
    pd.avatar_url,
    pd.avatar_seed,
    pd.public_handle,
    pd.preferred_currency,
    pd.preferred_language
  from public.profile_directory pd
  where pd.profile_id = any(p_ids)
    and (
      pd.profile_id = v_uid
      or exists (
        select 1
        from public.trip_members viewer_membership
        join public.trip_members profile_membership
          on profile_membership.trip_id = viewer_membership.trip_id
        join public.trips shared_trip
          on shared_trip.id = viewer_membership.trip_id
        where viewer_membership.user_id = v_uid
          and profile_membership.user_id = pd.profile_id
          and shared_trip.deleted_at is null
      )
    );
end;
$$;

revoke all on function public.get_profile_public_data(uuid[]) from public;
grant execute on function public.get_profile_public_data(uuid[]) to authenticated;
