-- D10: distinguish legacy guest-gallery photos from new member-only media.
-- Existing uploaded photos retain their historical public-gallery visibility;
-- all audio and new media default to private. NULL remains a private value.
alter table public.trip_media
  add column public_gallery boolean default false;

update public.trip_media
set public_gallery = true
where kind = 'photo';

update public.trip_media
set public_gallery = false
where kind = 'audio';

create or replace function public.guard_trip_media_public_gallery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.public_gallery is true then
      raise exception 'New trip media cannot be public-gallery content' using errcode = '42501';
    end if;
    new.public_gallery := false;
    return new;
  end if;

  if old.public_gallery is not true and new.public_gallery is true then
    raise exception 'Member-only trip media cannot become public-gallery content' using errcode = '42501';
  end if;

  -- A restored tombstone is a fresh share action, not a continuation of its
  -- historical guest visibility. This branch also permits legacy true -> false.
  if old.deleted_at is not null and new.deleted_at is null then
    new.public_gallery := false;
    return new;
  end if;

  -- Older clients may send an update that omits this newly-added field. Keep
  -- legacy visibility stable except on restore, even if an old payload appears
  -- as NULL to the trigger.
  if old.public_gallery is true and new.public_gallery is distinct from true then
    new.public_gallery := true;
  end if;

  if new.kind = 'audio' then
    new.public_gallery := false;
  end if;

  return new;
end;
$$;
revoke all on function public.guard_trip_media_public_gallery() from public;
drop trigger if exists guard_trip_media_public_gallery on public.trip_media;
create trigger guard_trip_media_public_gallery
  before insert or update on public.trip_media
  for each row execute function public.guard_trip_media_public_gallery();

-- Transcript rows are sensitive even when the member row is soft-removed.
drop policy if exists "media_transcripts_select_member" on public.media_transcripts;
create policy "media_transcripts_select_member" on public.media_transcripts
  for select to authenticated
  using (public.is_active_trip_media_member(trip_id));

-- Re-applying an invitation must never demote an active member or trip owner.
-- A soft-removed membership does take the new invitation role when restored.
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
  on conflict (trip_id, user_id) do update set
    role = case
      when public.trip_members.role = 'owner' then public.trip_members.role
      when public.trip_members.removed_at is not null or public.trip_members.deleted_at is not null then excluded.role
      else public.trip_members.role
    end,
    updated_at = now(),
    removed_at = null,
    removed_by = null,
    deleted_at = null,
    deleted_by = null
  returning * into membership;
  update public.trip_invitations set status = 'accepted', invited_user_id = actor where id = p_invitation_id;
  return membership;
end;
$$;
revoke all on function public.accept_trip_invitation(uuid) from public;
grant execute on function public.accept_trip_invitation(uuid) to authenticated;
