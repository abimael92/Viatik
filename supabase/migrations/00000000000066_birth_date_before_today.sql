-- A birth date must be a past calendar day. Today is not a valid birth date.

alter table public.profiles drop constraint if exists profiles_birth_date_chk;
alter table public.profiles
  add constraint profiles_birth_date_chk check (
    birth_date is null or birth_date < current_date
  );

alter table public.contacts drop constraint if exists contacts_birth_date_chk;
alter table public.contacts
  add constraint contacts_birth_date_chk check (
    birth_date is null or birth_date < current_date
  );
