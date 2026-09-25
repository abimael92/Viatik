-- Crew polls sync as decisions, options, and votes. Realtime publishes all three
-- so every traveler sees the same question and tally.

create or replace function public.sync_decision_cas_upsert(
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
  v_id uuid := (p_payload ->> 'id')::uuid;
  v_decision public.decisions;
  v_option public.decision_options;
  v_vote public.decision_votes;
  v_updated timestamptz;
begin
  if v_id is null then raise exception 'p_payload.id is required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_entity || ':' || v_id::text, 0));

  if p_entity = 'decision' then
    select * into v_decision from public.decisions where id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.decisions
        select (jsonb_populate_record(null::public.decisions, p_payload || jsonb_build_object('id', v_id))).*
        returning * into v_decision;
    elsif p_base_updated_at is null or v_decision.updated_at <> p_base_updated_at then
      return jsonb_build_object('status', 'conflict', 'server_updated_at', v_decision.updated_at, 'current', to_jsonb(v_decision));
    else
      update public.decisions set
        question = p_payload ->> 'question',
        status = p_payload ->> 'status',
        voting_ends_at = nullif(p_payload ->> 'voting_ends_at', '')::timestamptz,
        resolution = p_payload -> 'resolution',
        resolved_by = nullif(p_payload ->> 'resolved_by', '')::uuid,
        resolved_at = nullif(p_payload ->> 'resolved_at', '')::timestamptz,
        updated_at = now(),
        updated_by = auth.uid(),
        deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz,
        deleted_by = nullif(p_payload ->> 'deleted_by', '')::uuid
      where id = v_id and updated_at = p_base_updated_at
      returning * into v_decision;
    end if;
    if v_decision.id is null then return jsonb_build_object('status', 'conflict'); end if;
    return jsonb_build_object('status', 'applied', 'server_updated_at', v_decision.updated_at, 'current', to_jsonb(v_decision));
  elsif p_entity = 'decisionOption' then
    select * into v_option from public.decision_options where id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.decision_options
        select (jsonb_populate_record(null::public.decision_options, p_payload || jsonb_build_object('id', v_id))).*
        returning * into v_option;
    elsif p_base_updated_at is null or v_option.updated_at <> p_base_updated_at then
      return jsonb_build_object('status', 'conflict', 'server_updated_at', v_option.updated_at, 'current', to_jsonb(v_option));
    else
      update public.decision_options set
        label = p_payload ->> 'label',
        metadata = coalesce(p_payload -> 'metadata', '{}'::jsonb),
        position = (p_payload ->> 'position')::integer,
        updated_at = now(),
        updated_by = auth.uid(),
        deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz,
        deleted_by = nullif(p_payload ->> 'deleted_by', '')::uuid
      where id = v_id and updated_at = p_base_updated_at
      returning * into v_option;
    end if;
    if v_option.id is null then return jsonb_build_object('status', 'conflict'); end if;
    return jsonb_build_object('status', 'applied', 'server_updated_at', v_option.updated_at, 'current', to_jsonb(v_option));
  elsif p_entity = 'decisionVote' then
    select * into v_vote from public.decision_votes where id = v_id for update;
    if not found then
      if p_base_updated_at is not null then return jsonb_build_object('status', 'not_found'); end if;
      insert into public.decision_votes
        select (jsonb_populate_record(null::public.decision_votes, p_payload || jsonb_build_object('id', v_id))).*
        returning * into v_vote;
    elsif p_base_updated_at is null or v_vote.updated_at <> p_base_updated_at then
      return jsonb_build_object('status', 'conflict', 'server_updated_at', v_vote.updated_at, 'current', to_jsonb(v_vote));
    else
      update public.decision_votes set
        option_id = (p_payload ->> 'option_id')::uuid,
        updated_at = now(),
        updated_by = auth.uid(),
        deleted_at = nullif(p_payload ->> 'deleted_at', '')::timestamptz,
        deleted_by = nullif(p_payload ->> 'deleted_by', '')::uuid
      where id = v_id and user_id = auth.uid() and updated_at = p_base_updated_at
      returning * into v_vote;
    end if;
    if v_vote.id is null then return jsonb_build_object('status', 'conflict'); end if;
    return jsonb_build_object('status', 'applied', 'server_updated_at', v_vote.updated_at, 'current', to_jsonb(v_vote));
  else
    raise exception 'Unsupported decision entity: %', p_entity using errcode = '22023';
  end if;
end;
$$;

create or replace function public.sync_decision_cas_delete(
  p_entity text,
  p_id uuid,
  p_base_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated timestamptz;
  v_decision public.decisions;
  v_option public.decision_options;
  v_vote public.decision_votes;
begin
  if p_entity = 'decision' then
    select * into v_decision from public.decisions where id = p_id for update;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if v_decision.updated_at <> p_base_updated_at then
      return jsonb_build_object('status', 'conflict', 'server_updated_at', v_decision.updated_at, 'current', to_jsonb(v_decision));
    end if;
    delete from public.decisions where id = p_id;
  elsif p_entity = 'decisionOption' then
    select * into v_option from public.decision_options where id = p_id for update;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if v_option.updated_at <> p_base_updated_at then
      return jsonb_build_object('status', 'conflict', 'server_updated_at', v_option.updated_at, 'current', to_jsonb(v_option));
    end if;
    delete from public.decision_options where id = p_id;
  elsif p_entity = 'decisionVote' then
    select * into v_vote from public.decision_votes where id = p_id for update;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if v_vote.updated_at <> p_base_updated_at then
      return jsonb_build_object('status', 'conflict', 'server_updated_at', v_vote.updated_at, 'current', to_jsonb(v_vote));
    end if;
    delete from public.decision_votes where id = p_id and user_id = auth.uid();
  else
    raise exception 'Unsupported decision entity: %', p_entity using errcode = '22023';
  end if;
  return jsonb_build_object('status', 'applied');
end;
$$;

revoke all on function public.sync_decision_cas_upsert(text, jsonb, timestamptz) from public;
revoke all on function public.sync_decision_cas_delete(text, uuid, timestamptz) from public;
grant execute on function public.sync_decision_cas_upsert(text, jsonb, timestamptz) to authenticated;
grant execute on function public.sync_decision_cas_delete(text, uuid, timestamptz) to authenticated;

do $$
declare
  target text;
begin
  foreach target in array array['decisions', 'decision_options', 'decision_votes']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;
