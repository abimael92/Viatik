create or replace function public.preserve_trip_owner()
returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'Trip ownership transfer is not supported'; end if;
  return new;
end;
$$;
create trigger preserve_trip_owner before update on public.trips for each row execute function public.preserve_trip_owner();

drop policy "trip_members_insert_editors_or_self_owner" on public.trip_members;
create policy "trip_members_insert_editors_or_self_owner" on public.trip_members for insert to authenticated
with check (
  (public.is_trip_editor(trip_id) and role <> 'owner')
  or (user_id = auth.uid() and role = 'owner' and exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()))
);

drop policy "trip_members_update_owner" on public.trip_members;
create policy "trip_members_update_owner" on public.trip_members for update to authenticated
using (public.is_trip_owner(trip_id))
with check (
  public.is_trip_owner(trip_id) and (
    (role = 'owner' and user_id = (select owner_id from public.trips where id = trip_id))
    or (role <> 'owner' and user_id <> (select owner_id from public.trips where id = trip_id))
  )
);

drop policy "trip_members_delete_owner_or_self" on public.trip_members;
create policy "trip_members_delete_owner_or_self" on public.trip_members for delete to authenticated
using (role <> 'owner' and (public.is_trip_owner(trip_id) or user_id = auth.uid()));

insert into public.trip_members (trip_id, user_id, role, joined_at, created_at, updated_at)
select id, owner_id, 'owner'::public.trip_member_role, created_at, created_at, updated_at from public.trips
on conflict (trip_id, user_id) do update set role = 'owner';

create type public.invitation_status as enum ('pending', 'accepted', 'rejected', 'revoked');

create table public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  email text not null,
  role public.trip_member_role not null default 'viewer',
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles (id) on delete cascade,
  invited_user_id uuid references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, email),
  check (role <> 'owner')
);

create index trip_invitations_trip_id_idx on public.trip_invitations (trip_id);
create index trip_invitations_email_idx on public.trip_invitations (lower(email));
create trigger set_trip_invitations_updated_at before update on public.trip_invitations for each row execute function public.set_updated_at();
alter table public.trip_invitations enable row level security;

create policy "trip_invitations_select_related" on public.trip_invitations for select to authenticated using (
  public.is_trip_member(trip_id) or invited_user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
create policy "trip_invitations_insert_editors" on public.trip_invitations for insert to authenticated with check (
  public.is_trip_editor(trip_id) and invited_by = auth.uid()
);
create policy "trip_invitations_update_editors" on public.trip_invitations for update to authenticated using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id));
create policy "trip_invitations_delete_editors" on public.trip_invitations for delete to authenticated using (public.is_trip_editor(trip_id));

create or replace function public.accept_trip_invitation(p_invitation_id uuid)
returns public.trip_members
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.trip_invitations;
  membership public.trip_members;
begin
  select * into invitation from public.trip_invitations where id = p_invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.expires_at <= now() then raise exception 'Invitation is unavailable'; end if;
  if invitation.invited_user_id is distinct from auth.uid() and lower(invitation.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'Invitation does not belong to this user'; end if;
  insert into public.trip_members (trip_id, user_id, role, invited_by)
  values (invitation.trip_id, auth.uid(), invitation.role, invitation.invited_by)
  on conflict (trip_id, user_id) do update set role = excluded.role, updated_at = now()
  returning * into membership;
  update public.trip_invitations set status = 'accepted', invited_user_id = auth.uid() where id = p_invitation_id;
  return membership;
end;
$$;
grant execute on function public.accept_trip_invitation(uuid) to authenticated;

create or replace function public.reject_trip_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trip_invitations set status = 'rejected', invited_user_id = auth.uid()
  where id = p_invitation_id and status = 'pending' and expires_at > now()
    and (invited_user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
  if not found then raise exception 'Invitation is unavailable'; end if;
end;
$$;
grant execute on function public.reject_trip_invitation(uuid) to authenticated;

create table public.trip_media (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete set null,
  caption text,
  storage_path text not null,
  content_type text not null default 'image/jpeg',
  byte_size bigint not null default 0 check (byte_size >= 0),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index trip_media_trip_id_idx on public.trip_media (trip_id, updated_at);
create trigger set_trip_media_updated_at before update on public.trip_media for each row execute function public.set_updated_at();
alter table public.trip_media enable row level security;
create policy "trip_media_select_members" on public.trip_media for select to authenticated using (public.is_trip_member(trip_id));
create policy "trip_media_insert_editors" on public.trip_media for insert to authenticated with check (public.is_trip_editor(trip_id) and created_by = auth.uid());
create policy "trip_media_update_editors" on public.trip_media for update to authenticated using (public.is_trip_editor(trip_id)) with check (public.is_trip_editor(trip_id));
create policy "trip_media_delete_editors" on public.trip_media for delete to authenticated using (public.is_trip_editor(trip_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-media', 'trip-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
create policy "trip_media_objects_select" on storage.objects for select to authenticated using (
  bucket_id = 'trip-media' and public.is_trip_member(((storage.foldername(name))[1])::uuid)
);
create policy "trip_media_objects_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'trip-media' and public.is_trip_editor(((storage.foldername(name))[1])::uuid)
);
create policy "trip_media_objects_update" on storage.objects for update to authenticated using (
  bucket_id = 'trip-media' and public.is_trip_editor(((storage.foldername(name))[1])::uuid)
);
create policy "trip_media_objects_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'trip-media' and public.is_trip_editor(((storage.foldername(name))[1])::uuid)
);

create table public.expense_settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete restrict,
  to_user_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_user_id <> to_user_id)
);
create index expense_settlements_trip_id_idx on public.expense_settlements (trip_id, updated_at);
create trigger set_expense_settlements_updated_at before update on public.expense_settlements for each row execute function public.set_updated_at();
alter table public.expense_settlements enable row level security;
create policy "expense_settlements_select_members" on public.expense_settlements for select to authenticated using (public.is_trip_member(trip_id));
create policy "expense_settlements_insert_members" on public.expense_settlements for insert to authenticated with check (public.is_trip_member(trip_id) and created_by = auth.uid());
create policy "expense_settlements_update_creator" on public.expense_settlements for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "expense_settlements_delete_creator" on public.expense_settlements for delete to authenticated using (created_by = auth.uid());

alter publication supabase_realtime add table public.trips, public.trip_members, public.trip_invitations, public.activities, public.expenses, public.expense_shares, public.trip_media, public.expense_settlements;
