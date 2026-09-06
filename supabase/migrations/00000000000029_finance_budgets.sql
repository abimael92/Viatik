-- Phase 2A: Advanced Finance & Settlements — budgets, wallets, and expense metadata.
--
-- Extends `trips` with an optional overall budget and adds per-trip financial
-- planning entities. Money is stored in minor units as `numeric(12,2)`, matching
-- the existing `expenses` / `expense_shares` convention (client sends bigint
-- minor units as a plain integer string).

-- Trip-level overall budget, in minor units of the trip's base currency.
alter table public.trips add column total_budget numeric(12, 2);

-- Split methodology gains a 'shares' option (per-participant share counts).
alter type public.expense_split_type add value 'shares';

-- Expense metadata: date incurred (distinct from created_at), optional exchange
-- rate to the trip's base currency, and a free-form category reference.
alter table public.expenses add column expense_date date not null default now()::date;
alter table public.expenses add column exchange_rate_to_base numeric;
alter table public.expenses add column category_id text;

-- Per-member starting balance attributed to a trip, in the wallet's own
-- currency. Private to its owner (RLS below); the owner must be an active
-- trip member to hold a wallet.
create table public.user_wallets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  starting_balance numeric(12, 2) not null default 0 check (starting_balance >= 0),
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create index user_wallets_user_id_idx on public.user_wallets (user_id);
create index user_wallets_trip_id_idx on public.user_wallets (trip_id);

create trigger set_user_wallets_updated_at
  before insert or update on public.user_wallets
  for each row execute function public.set_updated_at();

alter table public.user_wallets enable row level security;

-- Per-day budget override for a trip, in minor units of the trip's base
-- currency. Takes precedence over the trip's derived daily budget.
create table public.daily_budget_overrides (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  date date not null,
  custom_budget_amount numeric(12, 2) not null check (custom_budget_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, date)
);

create index daily_budget_overrides_trip_id_idx on public.daily_budget_overrides (trip_id);

create trigger set_daily_budget_overrides_updated_at
  before insert or update on public.daily_budget_overrides
  for each row execute function public.set_updated_at();

alter table public.daily_budget_overrides enable row level security;

-- A wallet is visible and writable only by its owner.
create policy "user_wallets_select_owner"
  on public.user_wallets for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_wallets_insert_owner"
  on public.user_wallets for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_wallets_update_owner"
  on public.user_wallets for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_wallets_delete_owner"
  on public.user_wallets for delete
  to authenticated
  using (user_id = auth.uid());

-- Daily budget overrides are trip-scoped: active members may read; editors
-- manage them (mirrors the expenses policy shape).
create policy "daily_budget_overrides_select_members"
  on public.daily_budget_overrides for select
  to authenticated
  using (public.is_trip_member(trip_id));

create policy "daily_budget_overrides_insert_editors"
  on public.daily_budget_overrides for insert
  to authenticated
  with check (public.is_trip_editor(trip_id));

create policy "daily_budget_overrides_update_editors"
  on public.daily_budget_overrides for update
  to authenticated
  using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));

create policy "daily_budget_overrides_delete_editors"
  on public.daily_budget_overrides for delete
  to authenticated
  using (public.is_trip_editor(trip_id));

-- Membership invariant: a wallet owner must be an active trip member.
create or replace function public.validate_wallet_membership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_active_trip_member(new.trip_id, new.user_id) then
    raise exception 'Wallet owner must be an active trip member' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_wallet_membership
  before insert or update of trip_id, user_id on public.user_wallets
  for each row execute function public.validate_wallet_membership();
