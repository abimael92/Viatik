create type public.expense_split_type as enum ('equal', 'exact', 'percentage');

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  paid_by uuid not null references public.profiles (id) on delete restrict,
  split_type public.expense_split_type not null default 'equal',
  created_by uuid not null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index expenses_trip_id_idx on public.expenses (trip_id);

create trigger set_expenses_updated_at
  before update on public.expenses
  for each row
  execute function public.set_updated_at();

alter table public.expenses enable row level security;

create policy "expenses_select_members"
  on public.expenses for select
  to authenticated
  using (public.is_trip_member(trip_id));

create policy "expenses_insert_editors"
  on public.expenses for insert
  to authenticated
  with check (public.is_trip_editor(trip_id));

create policy "expenses_update_editors"
  on public.expenses for update
  to authenticated
  using (public.is_trip_editor(trip_id))
  with check (public.is_trip_editor(trip_id));

create policy "expenses_delete_editors"
  on public.expenses for delete
  to authenticated
  using (public.is_trip_editor(trip_id));

-- Per-member share of an expense. share_amount is always in the expense's
-- currency; share_percentage is stored alongside it (rather than derived)
-- so "percentage" splits remain exact even if amount is edited later.
create table public.expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  share_amount numeric(12, 2) not null check (share_amount >= 0),
  share_percentage numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (expense_id, user_id)
);

create index expense_shares_expense_id_idx on public.expense_shares (expense_id);

create trigger set_expense_shares_updated_at
  before update on public.expense_shares
  for each row
  execute function public.set_updated_at();

alter table public.expense_shares enable row level security;

create policy "expense_shares_select_members"
  on public.expense_shares for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_member(e.trip_id)
    )
  );

create policy "expense_shares_insert_editors"
  on public.expense_shares for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_editor(e.trip_id)
    )
  );

create policy "expense_shares_update_editors"
  on public.expense_shares for update
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_editor(e.trip_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_editor(e.trip_id)
    )
  );

create policy "expense_shares_delete_editors"
  on public.expense_shares for delete
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_editor(e.trip_id)
    )
  );
