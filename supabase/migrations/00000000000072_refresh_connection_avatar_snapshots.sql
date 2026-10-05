-- Connection snapshots are taken when two profiles link, so a later avatar change
-- never reached the counterpart's local contact. Mirror avatar changes into every
-- snapshot of that profile; the connections lifecycle trigger bumps version and
-- updated_at so incremental pulls and realtime deliver the refreshed snapshot.
-- Only public avatar keys are written; the snapshot CHECK constraints still apply.
create or replace function public.refresh_connection_avatar_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar_url is not distinct from old.avatar_url
     and new.avatar_seed is not distinct from old.avatar_seed then
    return new;
  end if;

  update public.connections
  set requester_snapshot = requester_snapshot || jsonb_build_object('avatar_url', new.avatar_url, 'avatar_seed', new.avatar_seed)
  where requester_id = new.id;

  update public.connections
  set recipient_snapshot = recipient_snapshot || jsonb_build_object('avatar_url', new.avatar_url, 'avatar_seed', new.avatar_seed)
  where recipient_id = new.id;

  return new;
end;
$$;

revoke all on function public.refresh_connection_avatar_snapshots() from public;

create trigger refresh_connection_avatar_snapshots_after_update
  after update of avatar_url, avatar_seed on public.profiles
  for each row execute function public.refresh_connection_avatar_snapshots();

-- Backfill snapshots that are already stale.
update public.connections c
set requester_snapshot = c.requester_snapshot || jsonb_build_object('avatar_url', p.avatar_url, 'avatar_seed', p.avatar_seed)
from public.profiles p
where p.id = c.requester_id
  and (c.requester_snapshot ->> 'avatar_url' is distinct from p.avatar_url
    or c.requester_snapshot ->> 'avatar_seed' is distinct from p.avatar_seed);

update public.connections c
set recipient_snapshot = c.recipient_snapshot || jsonb_build_object('avatar_url', p.avatar_url, 'avatar_seed', p.avatar_seed)
from public.profiles p
where p.id = c.recipient_id
  and (c.recipient_snapshot ->> 'avatar_url' is distinct from p.avatar_url
    or c.recipient_snapshot ->> 'avatar_seed' is distinct from p.avatar_seed);
