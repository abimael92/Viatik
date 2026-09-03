create or replace function public.is_active_trip_member(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.trip_members tm
    join public.trips t on t.id = tm.trip_id
    where tm.trip_id = p_trip_id
      and tm.user_id = p_user_id
      and t.deleted_at is null
  );
$$;

revoke all on function public.is_active_trip_member(uuid, uuid) from public;
grant execute on function public.is_active_trip_member(uuid, uuid) to authenticated;

alter table public.activities alter column created_by set default auth.uid();
alter table public.expenses alter column created_by set default auth.uid();
alter table public.trip_media alter column created_by set default auth.uid();
alter table public.expense_settlements alter column created_by set default auth.uid();
alter table public.trip_travelers alter column created_by set default auth.uid();
alter table public.trip_invitations alter column invited_by set default auth.uid();

create or replace function public.enforce_created_by()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    new.created_by := actor;
  elsif new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_activities_created_by before insert or update on public.activities for each row execute function public.enforce_created_by();
create trigger enforce_expenses_created_by before insert or update on public.expenses for each row execute function public.enforce_created_by();
create trigger enforce_trip_media_created_by before insert or update on public.trip_media for each row execute function public.enforce_created_by();
create trigger enforce_expense_settlements_created_by before insert or update on public.expense_settlements for each row execute function public.enforce_created_by();
create trigger enforce_trip_travelers_created_by before insert or update on public.trip_travelers for each row execute function public.enforce_created_by();

create or replace function public.validate_expense_membership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_active_trip_member(new.trip_id, new.paid_by) then
    raise exception 'Expense payer must be an active trip member' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_expense_membership before insert or update of trip_id, paid_by on public.expenses for each row execute function public.validate_expense_membership();

create or replace function public.validate_expense_share_membership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  parent_trip_id uuid;
begin
  select trip_id into parent_trip_id from public.expenses where id = new.expense_id;
  if parent_trip_id is null then raise exception 'Expense does not exist' using errcode = '23503'; end if;
  if not public.is_active_trip_member(parent_trip_id, new.user_id) then
    raise exception 'Expense share user must be an active trip member' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.expense_id is distinct from old.expense_id or new.user_id is distinct from old.user_id) then
    raise exception 'Expense share identity is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_expense_share_membership before insert or update on public.expense_shares for each row execute function public.validate_expense_share_membership();

create or replace function public.validate_settlement_membership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_active_trip_member(new.trip_id, new.from_user_id)
    or not public.is_active_trip_member(new.trip_id, new.to_user_id) then
    raise exception 'Settlement participants must be active trip members' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_settlement_membership before insert or update of trip_id, from_user_id, to_user_id on public.expense_settlements for each row execute function public.validate_settlement_membership();

drop policy "activities_insert_editors" on public.activities;
create policy "activities_insert_editors" on public.activities for insert to authenticated
with check (public.is_trip_editor(trip_id) and created_by = auth.uid());

drop policy "expenses_insert_editors" on public.expenses;
create policy "expenses_insert_editors" on public.expenses for insert to authenticated
with check (public.is_trip_editor(trip_id) and created_by = auth.uid() and public.is_active_trip_member(trip_id, paid_by));

drop policy "expense_shares_insert_editors" on public.expense_shares;
create policy "expense_shares_insert_editors" on public.expense_shares for insert to authenticated
with check (
  exists (
    select 1 from public.expenses e
    where e.id = expense_id
      and public.is_trip_editor(e.trip_id)
      and public.is_active_trip_member(e.trip_id, user_id)
  )
);

drop policy "expense_shares_update_editors" on public.expense_shares;
create policy "expense_shares_update_editors" on public.expense_shares for update to authenticated
using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_editor(e.trip_id)))
with check (
  exists (
    select 1 from public.expenses e
    where e.id = expense_id
      and public.is_trip_editor(e.trip_id)
      and public.is_active_trip_member(e.trip_id, user_id)
  )
);

create or replace function public.enforce_invitation_invariants()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  is_recipient boolean;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  if tg_op = 'INSERT' then
    new.invited_by := actor;
    new.status := 'pending';
    new.invited_user_id := null;
    new.expires_at := now() + interval '14 days';
    return new;
  end if;

  if new.trip_id is distinct from old.trip_id
    or lower(new.email) is distinct from lower(old.email)
    or new.invited_by is distinct from old.invited_by then
    raise exception 'Invitation ownership fields are immutable' using errcode = '23514';
  end if;

  is_recipient := case
    when old.invited_user_id is not null then old.invited_user_id = actor
    else lower(old.email) = actor_email and actor_email <> ''
  end;

  if new.status = old.status then
    if new.invited_user_id is distinct from old.invited_user_id then
      raise exception 'Invitation recipient is immutable' using errcode = '23514';
    end if;
    if new.expires_at is distinct from old.expires_at then
      if old.status <> 'pending' or not public.is_trip_editor(old.trip_id) then
        raise exception 'Invitation expiration cannot be changed' using errcode = '23514';
      end if;
      new.expires_at := now() + interval '14 days';
    end if;
    return new;
  end if;

  if old.status = 'pending' and new.status = 'revoked' then
    if not public.is_trip_editor(old.trip_id) then raise exception 'Only trip editors can revoke invitations' using errcode = '42501'; end if;
    if new.invited_user_id is distinct from old.invited_user_id or new.role is distinct from old.role or new.expires_at is distinct from old.expires_at then
      raise exception 'Revocation may only change invitation status' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'pending' and new.status in ('accepted', 'rejected') then
    if not is_recipient then raise exception 'Invitation does not belong to this user' using errcode = '42501'; end if;
    if old.expires_at <= now() then raise exception 'Invitation is unavailable' using errcode = '22023'; end if;
    if new.invited_user_id is distinct from actor or new.role is distinct from old.role or new.expires_at is distinct from old.expires_at then
      raise exception 'Recipient transition contains invalid changes' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status in ('rejected', 'revoked') and new.status = 'pending' then
    if not public.is_trip_editor(old.trip_id) then raise exception 'Only trip editors can resend invitations' using errcode = '42501'; end if;
    new.invited_user_id := null;
    new.expires_at := now() + interval '14 days';
    return new;
  end if;

  raise exception 'Invalid invitation status transition' using errcode = '23514';
end;
$$;

create trigger enforce_invitation_invariants before insert or update on public.trip_invitations for each row execute function public.enforce_invitation_invariants();

create or replace function public.accept_trip_invitation(p_invitation_id uuid)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.trip_invitations;
  membership public.trip_members;
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into invitation from public.trip_invitations where id = p_invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() then raise exception 'Invitation is unavailable'; end if;
  if invitation.invited_user_id is not null then
    if invitation.invited_user_id <> actor then raise exception 'Invitation does not belong to this user'; end if;
  elsif lower(invitation.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Invitation does not belong to this user';
  end if;
  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (invitation.trip_id, actor, invitation.role, invitation.invited_by)
  on conflict (trip_id, user_id) do update set updated_at = now()
  returning * into membership;
  update public.trip_invitations set status = 'accepted', invited_user_id = actor where id = p_invitation_id;
  return membership;
end;
$$;

create or replace function public.reject_trip_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.trip_invitations;
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into invitation from public.trip_invitations where id = p_invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() then raise exception 'Invitation is unavailable'; end if;
  if invitation.invited_user_id is not null then
    if invitation.invited_user_id <> actor then raise exception 'Invitation does not belong to this user'; end if;
  elsif lower(invitation.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Invitation does not belong to this user';
  end if;
  update public.trip_invitations set status = 'rejected', invited_user_id = actor where id = p_invitation_id;
end;
$$;

revoke all on function public.accept_trip_invitation(uuid) from public;
revoke all on function public.reject_trip_invitation(uuid) from public;
grant execute on function public.accept_trip_invitation(uuid) to authenticated;
grant execute on function public.reject_trip_invitation(uuid) to authenticated;
