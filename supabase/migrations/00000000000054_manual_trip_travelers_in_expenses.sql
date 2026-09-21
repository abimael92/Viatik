-- Allow expenses to include saved manual trip travelers who do not have a
-- public/auth profile. Profile-backed rows continue using user_id; manual
-- traveler-backed rows use traveler_id.

alter table public.expenses
  add column if not exists paid_by_traveler_id uuid references public.trip_travelers (id) on delete restrict;

alter table public.expenses
  alter column paid_by drop not null;

alter table public.expenses
  add constraint expenses_payer_exactly_one_check
  check (num_nonnulls(paid_by, paid_by_traveler_id) = 1);

alter table public.expense_shares
  add column if not exists traveler_id uuid references public.trip_travelers (id) on delete cascade;

alter table public.expense_shares
  alter column user_id drop not null;

alter table public.expense_shares
  add constraint expense_shares_owner_exactly_one_check
  check (num_nonnulls(user_id, traveler_id) = 1);

create unique index if not exists expense_shares_expense_traveler_unique_idx
  on public.expense_shares (expense_id, traveler_id)
  where traveler_id is not null;
