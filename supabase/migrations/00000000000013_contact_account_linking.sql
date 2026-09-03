create or replace function public.link_contact_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email is null then
    new.linked_profile_id = null;
  else
    select u.id into new.linked_profile_id
    from auth.users u
    where lower(u.email) = lower(new.email)
    limit 1;
  end if;
  return new;
end;
$$;

create trigger link_contact_profile_before_write
  before insert or update of email on public.contacts
  for each row execute function public.link_contact_profile();

update public.contacts c
set linked_profile_id = u.id
from auth.users u
where c.email is not null and lower(c.email) = lower(u.email);

create or replace function public.link_contacts_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.contacts
  set linked_profile_id = new.id
  where email is not null and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger link_contacts_after_user_created
  after insert on auth.users
  for each row execute function public.link_contacts_for_new_user();
