-- The avatar_seed column for contacts was referenced by the CAS in migration 25
-- but never added to the table. Add it now (uploaded images still live in
-- avatar_url).
alter table public.contacts
  add column avatar_seed text;

alter table public.contacts
  add constraint contacts_avatar_seed_length_chk check (
    avatar_seed is null or char_length(avatar_seed) <= 200
  );
