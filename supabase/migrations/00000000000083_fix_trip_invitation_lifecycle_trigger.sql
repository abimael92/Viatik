-- Keep lifecycle metadata writes aligned with the actual trip_invitations schema.
-- This table has updated_at but no updated_by column.
create or replace function public.set_trip_invitations_lifecycle_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.version := 1;
    new.status_changed_at := now();
    new.status_changed_by := new.invited_by;
    new.accepted_at := null;
    new.accepted_by := null;
    new.rejected_at := null;
    new.rejected_by := null;
    new.revoked_at := null;
    new.revoked_by := null;
  else
    new.version := old.version + 1;
    if new.status is distinct from old.status then
      new.status_changed_at := now();
      new.status_changed_by := case
        when new.status = 'accepted' then coalesce(new.invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
        when new.status = 'rejected' then coalesce(new.invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid)
        when new.status = 'revoked' then new.invited_by
        else new.invited_by end;
      if new.status = 'accepted' then
        new.accepted_at := now();
        new.accepted_by := coalesce(new.invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
        new.rejected_at := null;
        new.rejected_by := null;
        new.revoked_at := null;
        new.revoked_by := null;
      elsif new.status = 'rejected' then
        new.rejected_at := now();
        new.rejected_by := coalesce(new.invited_user_id, '0fb843db-9c96-4021-92f8-f143ddd3efe8'::uuid);
        new.accepted_at := null;
        new.accepted_by := null;
        new.revoked_at := null;
        new.revoked_by := null;
      elsif new.status = 'revoked' then
        new.revoked_at := now();
        new.revoked_by := new.invited_by;
        new.accepted_at := null;
        new.accepted_by := null;
        new.rejected_at := null;
        new.rejected_by := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;
