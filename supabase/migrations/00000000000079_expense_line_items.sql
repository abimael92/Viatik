alter table public.expenses
  add column line_items jsonb not null default '[]'::jsonb,
  add constraint expenses_line_items_array_chk check (jsonb_typeof(line_items) = 'array');

create or replace function public.validate_expense_line_items()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_item jsonb;
  v_allocation jsonb;
  v_item_id text;
  v_description text;
  v_minor_text text;
  v_user_id text;
  v_identity uuid;
  v_item_minor numeric;
  v_allocation_minor numeric;
  v_allocated_minor numeric;
  v_min_minor numeric;
  v_max_minor numeric;
  v_total_minor numeric := 0;
  v_item_ids text[] := array[]::text[];
  v_allocation_ids text[];
  v_allocation_count integer;
begin
  select * into v_expense from public.expenses where id = new.id;
  if not found or jsonb_array_length(v_expense.line_items) = 0 then
    return new;
  end if;
  if jsonb_array_length(v_expense.line_items) > 100 then
    raise exception 'Expense has too many line items' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(v_expense.line_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Invalid expense line item' using errcode = '22023';
    end if;
    v_item_id := v_item ->> 'id';
    v_description := btrim(coalesce(v_item ->> 'description', ''));
    v_minor_text := v_item ->> 'amountMinor';
    if v_item_id is null or v_item_id = '' or char_length(v_item_id) > 100
      or v_item_id = any(v_item_ids)
      or v_description = '' or char_length(v_description) > 200
      or coalesce(v_minor_text, '') !~ '^[0-9]{1,10}$'
      or coalesce(v_item ->> 'splitType', '') not in ('equal', 'exact')
      or coalesce(jsonb_typeof(v_item -> 'allocations'), '') <> 'array' then
      raise exception 'Invalid expense line item details' using errcode = '22023';
    end if;
    if jsonb_array_length(v_item -> 'allocations') = 0
      or jsonb_array_length(v_item -> 'allocations') > 100 then
      raise exception 'Invalid expense line item allocations' using errcode = '22023';
    end if;
    v_item_ids := array_append(v_item_ids, v_item_id);
    v_item_minor := v_minor_text::numeric;
    if v_item_minor <= 0 or v_item_minor > 9999999999 then
      raise exception 'Invalid expense line item amount' using errcode = '22023';
    end if;
    v_allocation_ids := array[]::text[];
    v_allocated_minor := 0;
    v_min_minor := null;
    v_max_minor := null;
    v_allocation_count := 0;

    for v_allocation in select value from jsonb_array_elements(v_item -> 'allocations')
    loop
      v_user_id := v_allocation ->> 'userId';
      v_minor_text := v_allocation ->> 'shareAmountMinor';
      if jsonb_typeof(v_allocation) <> 'object'
        or v_user_id is null or v_user_id = any(v_allocation_ids)
        or coalesce(v_minor_text, '') !~ '^[0-9]{1,10}$' then
        raise exception 'Invalid expense line item allocation' using errcode = '22023';
      end if;
      v_allocation_ids := array_append(v_allocation_ids, v_user_id);
      v_allocation_minor := v_minor_text::numeric;
      if v_allocation_minor > 9999999999 then
        raise exception 'Invalid expense line item allocation amount' using errcode = '22023';
      end if;
      v_allocated_minor := v_allocated_minor + v_allocation_minor;
      v_min_minor := case when v_min_minor is null then v_allocation_minor else least(v_min_minor, v_allocation_minor) end;
      v_max_minor := case when v_max_minor is null then v_allocation_minor else greatest(v_max_minor, v_allocation_minor) end;
      v_allocation_count := v_allocation_count + 1;

      if v_user_id ~ '^traveler:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        v_identity := substring(v_user_id from 10)::uuid;
        if not exists (
          select 1 from public.trip_travelers
          where id = v_identity and trip_id = v_expense.trip_id and deleted_at is null
        ) then
          raise exception 'Expense line item traveler must belong to the trip' using errcode = '23514';
        end if;
      elsif v_user_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        v_identity := v_user_id::uuid;
        if not public.is_active_trip_member(v_expense.trip_id, v_identity) then
          raise exception 'Expense line item user must be an active trip member' using errcode = '23514';
        end if;
      else
        raise exception 'Invalid expense line item traveler identity' using errcode = '22023';
      end if;
    end loop;

    if v_allocation_count = 0 or v_allocated_minor <> v_item_minor then
      raise exception 'Expense line item allocations must equal the item amount' using errcode = '23514';
    end if;
    if v_item ->> 'splitType' = 'equal' and v_max_minor - v_min_minor > 1 then
      raise exception 'Equal expense line item allocations must be even' using errcode = '23514';
    end if;
    v_total_minor := v_total_minor + v_item_minor;
  end loop;

  if v_total_minor <> v_expense.amount then
    raise exception 'Expense line items must equal the receipt total' using errcode = '23514';
  end if;
  return new;
end;
$$;

create constraint trigger validate_expense_line_items
  after insert or update on public.expenses
  deferrable initially deferred
  for each row execute function public.validate_expense_line_items();

alter function public.sync_cas_upsert(text, jsonb, timestamptz)
  rename to sync_cas_upsert_before_line_items;

create or replace function public.sync_cas_upsert(
  p_entity text,
  p_payload jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_expense_id uuid;
  v_current jsonb;
begin
  v_result := public.sync_cas_upsert_before_line_items(p_entity, p_payload, p_base_updated_at);

  if p_entity in ('expense', 'expenses')
    and p_payload ? 'line_items'
    and p_base_updated_at is not null
    and v_result ->> 'status' = 'applied' then
    v_expense_id := (p_payload ->> 'id')::uuid;
    update public.expenses as expense_row
    set line_items = p_payload -> 'line_items'
    where id = v_expense_id
    returning to_jsonb(expense_row) into v_current;
    return jsonb_build_object(
      'status', 'applied',
      'server_updated_at', v_current -> 'updated_at',
      'current', v_current
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.sync_cas_upsert(text, jsonb, timestamptz) from public;
grant execute on function public.sync_cas_upsert(text, jsonb, timestamptz) to authenticated;
