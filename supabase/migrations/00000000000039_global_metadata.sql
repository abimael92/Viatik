-- =============================================================================
-- Viatik Global Metadata Migration (Tiered Audit Strategy)
-- Additive-only: no column drops, no data deletion.
-- Applies Level A (full business audit) and Level B (lightweight ownership)
-- metadata per the approved Audit Strategy Document.
-- =============================================================================

-- Helper UUID for backfill when actor cannot be determined
-- SYSTEM_OWNER = '0fb843db-9c96-4021-92f8-f143ddd3efe8'
-- BACKFILL_DATE = '2026-09-11T00:00:00Z'

-- =============================================================================
-- LEVEL A — Full business audit
-- =============================================================================

-- 1) trips
alter table public.trips
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid,
  add column if not exists version bigint not null default 1;

update public.trips
set
  created_by = coalesce(created_by, owner_id),
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  status_changed_at = coalesce(status_changed_at,
    case when status = 'planned' then created_at
         when status = 'active' then coalesce(started_at, updated_at)
         when status = 'completed' then coalesce(completed_at, updated_at)
         when status = 'cancelled' then coalesce(updated_at, '2026-09-11T00:00:00Z'::timestamptz)
         else created_at end),
  status_changed_by = coalesce(status_changed_by,
    case when status = 'planned' then owner_id
         when status = 'active' then coalesce(started_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
         when status = 'completed' then coalesce(completed_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
         when status = 'cancelled' then coalesce(cancelled_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
         else owner_id end),
  version = coalesce(version, 1);

alter table public.trips
  alter column created_by set not null,
  alter column updated_by set not null,
  alter column version set not null,
  add constraint if not exists trips_created_by_fkey foreign key (created_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trips_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trips_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trips_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trips_status_changed_by_fkey foreign key (status_changed_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trips_version_positive_chk check (version > 0);

create index if not exists trips_status_changed_at_idx on public.trips (status, status_changed_at);

-- 2) trip_invitations
alter table public.trip_invitations
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid,
  add column if not exists version bigint not null default 1;

update public.trip_invitations
set
  status_changed_at = case
    when status = 'pending' then created_at
    when status = 'accepted' then coalesce(accepted_at, updated_at)
    when status = 'rejected' then coalesce(rejected_at, updated_at)
    when status = 'revoked' then coalesce(revoked_at, updated_at)
    else created_at end,
  status_changed_by = case
    when status = 'pending' then invited_by
    when status in ('accepted', 'rejected', 'revoked') then coalesce(invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
    else invited_by end,
  accepted_at = case when status = 'accepted' then coalesce(accepted_at, updated_at) else null end,
  accepted_by = case when status = 'accepted' then coalesce(accepted_by, invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else null end,
  rejected_at = case when status = 'rejected' then coalesce(rejected_at, updated_at) else null end,
  rejected_by = case when status = 'rejected' then coalesce(rejected_by, invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else null end,
  revoked_at = case when status = 'revoked' then coalesce(revoked_at, updated_at) else null end,
  revoked_by = case when status = 'revoked' then coalesce(revoked_by, invited_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else null end,
  version = coalesce(version, 1);

alter table public.trip_invitations
  alter column status_changed_at set not null,
  alter column status_changed_by set not null,
  add constraint if not exists trip_invitations_status_changed_by_fkey foreign key (status_changed_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_invitations_accepted_by_fkey foreign key (accepted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_invitations_rejected_by_fkey foreign key (rejected_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_invitations_revoked_by_fkey foreign key (revoked_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_invitations_version_positive_chk check (version > 0);

create index if not exists trip_invitations_status_changed_at_idx on public.trip_invitations (status, status_changed_at);

-- 3) connections (Level A — already covered in 00000000000038, but ensure version on legacy)
alter table public.connections
  add column if not exists version bigint not null default 1;

update public.connections
set
  version = coalesce(version, 1)
where version is null;

alter table public.connections
  alter column version set not null,
  add constraint if not exists connections_version_positive_chk check (version > 0);

create index if not exists connections_status_changed_at_idx on public.connections (status, status_changed_at);

-- 4) activities
alter table public.activities
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists version bigint not null default 1;

update public.activities
set
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  version = coalesce(version, 1);

alter table public.activities
  alter column updated_by set not null,
  add constraint if not exists activities_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists activities_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists activities_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists activities_version_positive_chk check (version > 0);

-- 5) expenses
alter table public.expenses
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists version bigint not null default 1;

update public.expenses
set
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  version = coalesce(version, 1);

alter table public.expenses
  alter column updated_by set not null,
  add constraint if not exists expenses_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expenses_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expenses_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expenses_version_positive_chk check (version > 0);

-- 5b) expense_shares
alter table public.expense_shares
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists version bigint not null default 1;

update public.expense_shares
set
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  version = coalesce(version, 1);

alter table public.expense_shares
  alter column updated_by set not null,
  add constraint if not exists expense_shares_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expense_shares_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expense_shares_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expense_shares_version_positive_chk check (version > 0);

-- 5c) expense_settlements
alter table public.expense_settlements
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists version bigint not null default 1;

update public.expense_settlements
set
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  version = coalesce(version, 1);

alter table public.expense_settlements
  alter column updated_by set not null,
  add constraint if not exists expense_settlements_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expense_settlements_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expense_settlements_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists expense_settlements_version_positive_chk check (version > 0);

-- 6) user_wallets
alter table public.user_wallets
  add column if not exists version bigint not null default 1;

update public.user_wallets
set
  version = coalesce(version, 1);

alter table public.user_wallets
  alter column version set not null,
  add constraint if not exists user_wallets_version_positive_chk check (version > 0);

-- 7) contacts
alter table public.contacts
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists version bigint not null default 1;

update public.contacts
set
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  version = coalesce(version, 1);

alter table public.contacts
  alter column updated_by set not null,
  add constraint if not exists contacts_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists contacts_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists contacts_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists contacts_version_positive_chk check (version > 0);

-- 7b) trip_travelers
alter table public.trip_travelers
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists version bigint not null default 1;

update public.trip_travelers
set
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  version = coalesce(version, 1);

alter table public.trip_travelers
  alter column updated_by set not null,
  add constraint if not exists trip_travelers_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_travelers_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_travelers_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_travelers_version_positive_chk check (version > 0);

-- 8) trip_media
alter table public.trip_media
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists version bigint not null default 1;

update public.trip_media
set
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  version = coalesce(version, 1);

alter table public.trip_media
  alter column updated_by set not null,
  add constraint if not exists trip_media_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_media_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_media_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_media_version_positive_chk check (version > 0);

-- 9) trip_share_links
alter table public.trip_share_links
  add column if not exists updated_by uuid,
  add column if not exists deleted_by uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists enabled_at timestamptz,
  add column if not exists enabled_by uuid,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid,
  add column if not exists version bigint not null default 1;

update public.trip_share_links
set
  updated_by = coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid),
  deleted_by = case when deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else deleted_by end,
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  enabled_at = case when active then coalesce(enabled_at, created_at) else null end,
  enabled_by = case when active then coalesce(enabled_by, created_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else null end,
  disabled_at = case when not active then coalesce(disabled_at, updated_at) else null end,
  disabled_by = case when not active then coalesce(disabled_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else null end,
  version = coalesce(version, 1);

alter table public.trip_share_links
  alter column updated_by set not null,
  add constraint if not exists trip_share_links_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_share_links_deleted_by_fkey foreign key (deleted_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_share_links_restored_by_fkey foreign key (restored_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_share_links_enabled_by_fkey foreign key (enabled_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_share_links_disabled_by_fkey foreign key (disabled_by) references public.profiles (id) on delete cascade,
  add constraint if not exists trip_share_links_version_positive_chk check (version > 0);

-- 10) vault_keysets
alter table public.vault_keysets
  add column if not exists version bigint not null default 1;

update public.vault_keysets
set
  version = coalesce(version, 1);

alter table public.vault_keysets
  alter column version set not null,
  add constraint if not exists vault_keysets_version_positive_chk check (version > 0);

-- 11) vault_entries
alter table public.vault_entries
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid,
  add column if not exists version bigint not null default 1;

update public.vault_entries
set
  restored_at = case when deleted_at is null and restored_at is not null then restored_at else null end,
  restored_by = case when deleted_at is null and restored_at is not null then coalesce(restored_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else restored_by end,
  version = coalesce(version, 1);

alter table public.vault_entries
  alter column version set not null,
  add constraint if not exists vault_entries_version_positive_chk check (version > 0);

-- 12) trip_weather_forecasts
alter table public.trip_weather_forecasts
  add column if not exists version bigint not null default 1;

update public.trip_weather_forecasts
set
  version = coalesce(version, 1);

alter table public.trip_weather_forecasts
  alter column version set not null,
  add constraint if not exists trip_weather_forecasts_version_positive_chk check (version > 0);

-- 13) trip_share_links — ensure sync function passes version
-- (No additional column needed; handled by CAS upsert)

-- =============================================================================
-- LEVEL B — Lightweight ownership and concurrency
-- =============================================================================

-- Trip members: role change tracking (already has invited_by, joined_at)
alter table public.trip_members
  add column if not exists role_changed_at timestamptz,
  add column if not exists role_changed_by uuid,
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid,
  add column if not exists version bigint not null default 1;

update public.trip_members
set
  role_changed_at = case
    when role <> 'owner' then updated_at
    else joined_at end,
  role_changed_by = case
    when role <> 'owner' then coalesce(updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
    else invited_by end,
  removed_at = case when role = 'viewer' and deleted_at is not null then deleted_at else null end,
  removed_by = case when role = 'viewer' and deleted_at is not null then coalesce(deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else null end,
  version = coalesce(version, 1);

alter table public.trip_members
  alter column version set not null,
  add constraint if not exists trip_members_version_positive_chk check (version > 0);

create index if not exists trip_members_role_changed_at_idx on public.trip_members (role, role_changed_at);

-- =============================================================================
-- Triggers for server-side lifecycle enforcement
-- =============================================================================

-- Trips
create or replace function public.set_trips_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := case
    when tg_op = 'INSERT' then new.owner_id
    else new.updated_by end;
  if tg_op = 'INSERT' then
    new.version := 1;
    new.status_changed_at := now();
    new.status_changed_by := case when new.status = 'planned' then new.owner_id else new.status_changed_by end;
    new.created_by := new.owner_id;
  else
    new.version := old.version + 1;
    if new.status is distinct from old.status then
      new.status_changed_at := now();
      new.status_changed_by := case
        when new.status in ('active', 'completed', 'cancelled') then new.updated_by
        else new.owner_id end;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_trips_lifecycle_metadata
  before insert or update on public.trips
  for each row execute function public.set_trips_lifecycle_metadata();

-- Activities
create or replace function public.set_activities_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(new.created_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  else
    new.version := old.version + 1;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_activities_lifecycle_metadata
  before insert or update on public.activities
  for each row execute function public.set_activities_lifecycle_metadata();

-- Expenses
create or replace function public.set_expenses_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(new.created_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  else
    new.version := old.version + 1;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_expenses_lifecycle_metadata
  before insert or update on public.expenses
  for each row execute function public.set_expenses_lifecycle_metadata();

-- Expense shares
create or replace function public.set_expense_shares_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_expense_shares_lifecycle_metadata
  before insert or update on public.expense_shares
  for each row execute function public.set_expense_shares_lifecycle_metadata();

-- Expense settlements
create or replace function public.set_expense_settlements_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(new.created_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  else
    new.version := old.version + 1;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_expense_settlements_lifecycle_metadata
  before insert or update on public.expense_settlements
  for each row execute function public.set_expense_settlements_lifecycle_metadata();

-- Contacts
create or replace function public.set_contacts_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_contacts_lifecycle_metadata
  before insert or update on public.contacts
  for each row execute function public.set_contacts_lifecycle_metadata();

-- Trip travelers
create or replace function public.set_trip_travelers_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(new.created_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  else
    new.version := old.version + 1;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_trip_travelers_lifecycle_metadata
  before insert or update on public.trip_travelers
  for each row execute function public.set_trip_travelers_lifecycle_metadata();

-- Trip media
create or replace function public.set_trip_media_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(new.created_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  else
    new.version := old.version + 1;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_trip_media_lifecycle_metadata
  before insert or update on public.trip_media
  for each row execute function public.set_trip_media_lifecycle_metadata();

-- Trip share links
create or replace function public.set_trip_share_links_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_by := coalesce(new.created_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
    new.enabled_at := now();
    new.enabled_by := new.created_by;
    new.disabled_at := null;
    new.disabled_by := null;
  else
    new.version := old.version + 1;
    if new.active is distinct from old.active then
      if new.active then
        new.enabled_at := now();
        new.enabled_by := new.updated_by;
        new.disabled_at := null;
        new.disabled_by := null;
      else
        new.disabled_at := now();
        new.disabled_by := new.updated_by;
        new.enabled_at := old.enabled_at;
        new.enabled_by := old.enabled_by;
      end if;
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_trip_share_links_lifecycle_metadata
  before insert or update on public.trip_share_links
  for each row execute function public.set_trip_share_links_lifecycle_metadata();

-- Trip invitations
create or replace function public.set_trip_invitations_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
    new.status_changed_at := now();
    new.status_changed_by := new.invited_by;
    new.accepted_at := null;
    new.accepted_by := null;
    new.rejected_at := null;
    new.rejected_by := null;
    new.revoked_at := null;
    new.revoked_by := null;
  else
    new.version := old.version + 1;
    if new.status is distinct from old.status then
      new.status_changed_at := now();
      new.status_changed_by := case
        when new.status = 'accepted' then coalesce(new.invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
        when new.status = 'rejected' then coalesce(new.invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
        when new.status = 'revoked' then new.invited_by
        else new.invited_by end;
      if new.status = 'accepted' then
        new.accepted_at := now();
        new.accepted_by := coalesce(new.invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
        new.rejected_at := null;
        new.rejected_by := null;
        new.revoked_at := null;
        new.revoked_by := null;
      elsif new.status = 'rejected' then
        new.rejected_at := now();
        new.rejected_by := coalesce(new.invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
        new.accepted_at := null;
        new.accepted_by := null;
        new.revoked_at := null;
        new.revoked_by := null;
      elsif new.status = 'revoked' then
        new.revoked_at := now();
        new.revoked_by := new.invited_by;
        new.accepted_at := null;
        new.accepted_by := null;
        new.rejected_at := null;
        new.rejected_by := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_trip_invitations_lifecycle_metadata
  before insert or update on public.trip_invitations
  for each row execute function public.set_trip_invitations_lifecycle_metadata();

-- User wallets
create or replace function public.set_user_wallets_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger set_user_wallets_lifecycle_metadata
  before insert or update on public.user_wallets
  for each row execute function public.set_user_wallets_lifecycle_metadata();

-- Vault keysets
create or replace function public.set_vault_keysets_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger set_vault_keysets_lifecycle_metadata
  before insert or update on public.vault_keysets
  for each row execute function public.set_vault_keysets_lifecycle_metadata();

-- Vault entries
create or replace function public.set_vault_entries_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
    if new.deleted_at is distinct from old.deleted_at then
      if new.deleted_at is not null then
        new.deleted_by := coalesce(new.deleted_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
      else
        new.restored_at := now();
        new.restored_by := new.updated_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_vault_entries_lifecycle_metadata
  before insert or update on public.vault_entries
  for each row execute function public.set_vault_entries_lifecycle_metadata();

-- Trip weather forecasts
create or replace function public.set_trip_weather_forecasts_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger set_trip_weather_forecasts_lifecycle_metadata
  before insert or update on public.trip_weather_forecasts
  for each row execute function public.set_trip_weather_forecasts_lifecycle_metadata();
