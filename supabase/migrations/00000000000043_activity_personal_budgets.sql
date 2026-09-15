create table public.activity_personal_budgets (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, user_id)
);

create index activity_personal_budgets_user_id_idx on public.activity_personal_budgets (user_id);
create index activity_personal_budgets_trip_id_idx on public.activity_personal_budgets (trip_id);

alter table public.activity_personal_budgets enable row level security;

create policy "activity_personal_budgets_select_owner"
  on public.activity_personal_budgets for select to authenticated
  using (user_id = auth.uid());
create policy "activity_personal_budgets_insert_owner"
  on public.activity_personal_budgets for insert to authenticated
  with check (user_id = auth.uid());
create policy "activity_personal_budgets_update_owner"
  on public.activity_personal_budgets for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "activity_personal_budgets_delete_owner"
  on public.activity_personal_budgets for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.set_activity_personal_budget_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.version := 1;
  else new.version := old.version + 1;
  end if;
  if not public.is_active_trip_member(new.trip_id, new.user_id) then
    raise exception 'Budget owner must be an active trip member' using errcode = '23514';
  end if;
  if not exists (select 1 from public.activities where id = new.activity_id and trip_id = new.trip_id) then
    raise exception 'Budget activity must belong to the trip' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger set_activity_personal_budget_metadata
  before insert or update on public.activity_personal_budgets
  for each row execute function public.set_activity_personal_budget_metadata();

create or replace function public.sync_activity_personal_budget_cas_upsert(
  p_payload jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := (p_payload ->> 'id')::uuid;
  v_current public.activity_personal_budgets;
  v_row public.activity_personal_budgets;
begin
  if v_id is null then raise exception 'p_payload.id is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('activity_personal_budgets:' || v_id::text, 0));
  select * into v_current from public.activity_personal_budgets where id = v_id for update;
  if not found then
    if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
    insert into public.activity_personal_budgets
      select (jsonb_populate_record(null::public.activity_personal_budgets, p_payload - 'created_at' - 'updated_at' || jsonb_build_object('id', v_id))).*
      returning * into v_row;
  elsif p_base_updated_at is null or v_current.updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current.updated_at, 'current', to_jsonb(v_current));
  else
    update public.activity_personal_budgets set
      amount = (p_payload ->> 'amount')::numeric,
      currency = p_payload ->> 'currency'
    where id = v_id and user_id = auth.uid() and updated_at = p_base_updated_at
    returning * into v_row;
  end if;
  if v_row.id is null then return jsonb_build_object('status', 'conflict'); end if;
  return jsonb_build_object('status', 'applied', 'server_updated_at', v_row.updated_at, 'current', to_jsonb(v_row));
end;
$$;

create or replace function public.sync_activity_personal_budget_cas_delete(
  p_id uuid,
  p_base_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current public.activity_personal_budgets;
begin
  select * into v_current from public.activity_personal_budgets where id = p_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_current.updated_at <> p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'server_updated_at', v_current.updated_at, 'current', to_jsonb(v_current));
  end if;
  delete from public.activity_personal_budgets where id = p_id and user_id = auth.uid();
  return jsonb_build_object('status', 'applied');
end;
$$;
