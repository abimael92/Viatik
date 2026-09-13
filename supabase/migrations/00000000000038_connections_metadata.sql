alter table public.connections
  add column status_changed_at timestamptz,
  add column status_changed_by uuid,
  add column accepted_at timestamptz,
  add column accepted_by uuid,
  add column blocked_at timestamptz,
  add column blocked_by uuid,
  add column version bigint not null default 1,
  add column source text not null default 'legacy';

update public.connections
set
  status_changed_at = case when status = 'pending' then created_at else updated_at end,
  status_changed_by = coalesce(
    case when status = 'pending' then requester_id else recipient_id end,
    '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid
  ),
  accepted_at = case when status = 'accepted' then updated_at else null end,
  accepted_by = case when status = 'accepted' then coalesce(recipient_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else null end,
  blocked_at = case when status = 'blocked' then updated_at else null end,
  blocked_by = case when status = 'blocked' then coalesce(recipient_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid) else null end,
  version = 1,
  source = 'legacy';

alter table public.connections
  alter column status_changed_at set not null,
  alter column status_changed_by set not null,
  add constraint connections_status_changed_by_fkey foreign key (status_changed_by) references public.profiles (id) on delete cascade,
  add constraint connections_accepted_by_fkey foreign key (accepted_by) references public.profiles (id) on delete cascade,
  add constraint connections_blocked_by_fkey foreign key (blocked_by) references public.profiles (id) on delete cascade,
  add constraint connections_version_positive_chk check (version > 0),
  add constraint connections_source_chk check (source in ('legacy', 'viatik_id_request', 'qr_scan')),
  add constraint connections_lifecycle_chk check (
    (status = 'pending' and accepted_at is null and accepted_by is null and blocked_at is null and blocked_by is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by = recipient_id and blocked_at is null and blocked_by is null)
    or (status = 'blocked' and blocked_at is not null and blocked_by = recipient_id and accepted_at is null and accepted_by is null)
  ),
  add constraint connections_status_actor_chk check (
    (status = 'pending' and status_changed_by = requester_id)
    or (status in ('accepted', 'blocked') and status_changed_by = recipient_id)
  );

create index connections_status_changed_at_idx on public.connections (status, status_changed_at);

create or replace function public.set_connection_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.status_changed_at := now();
    new.status_changed_by := case when new.status = 'pending' then new.requester_id else new.recipient_id end;
    if new.status = 'accepted' then
      new.accepted_at := now();
      new.accepted_by := new.recipient_id;
      new.blocked_at := null;
      new.blocked_by := null;
    elsif new.status = 'blocked' then
      new.blocked_at := now();
      new.blocked_by := new.recipient_id;
      new.accepted_at := null;
      new.accepted_by := null;
    else
      new.accepted_at := null;
      new.accepted_by := null;
      new.blocked_at := null;
      new.blocked_by := null;
    end if;
    return new;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := case when new.status = 'pending' then new.requester_id else new.recipient_id end;
    if new.status = 'accepted' then
      new.accepted_at := now();
      new.accepted_by := new.recipient_id;
      new.blocked_at := null;
      new.blocked_by := null;
    elsif new.status = 'blocked' then
      new.blocked_at := now();
      new.blocked_by := new.recipient_id;
      new.accepted_at := null;
      new.accepted_by := null;
    else
      new.accepted_at := null;
      new.accepted_by := null;
      new.blocked_at := null;
      new.blocked_by := null;
    end if;
  else
    new.status_changed_at := old.status_changed_at;
    new.status_changed_by := old.status_changed_by;
    new.accepted_at := old.accepted_at;
    new.accepted_by := old.accepted_by;
    new.blocked_at := old.blocked_at;
    new.blocked_by := old.blocked_by;
  end if;
  return new;
end;
$$;

create trigger set_connections_lifecycle_metadata
  before insert or update on public.connections
  for each row execute function public.set_connection_lifecycle_metadata();

create or replace function public.accept_connection_from_qr(p_recipient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_req_snap jsonb;
  v_recip_snap jsonb;
  v_row public.connections%rowtype;
begin
  if v_requester is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_recipient_id is null or p_recipient_id = v_requester then
    raise exception 'Invalid recipient' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'profile_id', pd.profile_id,
    'viatik_id', pd.viatik_id,
    'display_name', pd.display_name,
    'avatar_url', pd.avatar_url,
    'avatar_seed', pd.avatar_seed,
    'public_handle', pd.public_handle
  ) into v_recip_snap
  from public.profile_directory pd
  where pd.profile_id = p_recipient_id;

  if v_recip_snap is null then
    raise exception 'Recipient not found' using errcode = '42704';
  end if;

  select jsonb_build_object(
    'profile_id', pd.profile_id,
    'viatik_id', pd.viatik_id,
    'display_name', pd.display_name,
    'avatar_url', pd.avatar_url,
    'avatar_seed', pd.avatar_seed,
    'public_handle', pd.public_handle
  ) into v_req_snap
  from public.profile_directory pd
  where pd.profile_id = v_requester;

  if v_req_snap is null then
    v_req_snap := jsonb_build_object('profile_id', v_requester);
  end if;

  insert into public.connections (
    requester_id, recipient_id, status, requester_snapshot, recipient_snapshot, source
  ) values (
    v_requester, p_recipient_id, 'accepted', v_req_snap, v_recip_snap, 'qr_scan'
  )
  on conflict (requester_id, recipient_id) do update
    set status = 'accepted',
        requester_snapshot = excluded.requester_snapshot,
        recipient_snapshot = excluded.recipient_snapshot,
        source = 'qr_scan',
        updated_at = now()
  returning * into v_row;

  update public.connections
  set status = 'accepted', source = 'qr_scan', updated_at = now()
  where requester_id = p_recipient_id and recipient_id = v_requester;

  return jsonb_build_object('status', 'applied', 'connection', to_jsonb(v_row));
end;
$$;

revoke all on function public.accept_connection_from_qr(uuid) from public;
grant execute on function public.accept_connection_from_qr(uuid) to authenticated;
