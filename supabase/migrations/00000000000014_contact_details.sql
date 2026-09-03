create type public.contact_relationship as enum ('family', 'friend', 'coworker', 'other');

alter table public.contacts
  add column relationship public.contact_relationship not null default 'other',
  add column traveler_type public.traveler_type not null default 'adult',
  add column birth_date date,
  add column notes text;

alter table public.contacts
  add constraint contacts_name_length_chk check (char_length(trim(full_name)) between 2 and 100),
  add constraint contacts_notes_length_chk check (notes is null or char_length(notes) <= 500),
  add constraint contacts_birth_date_chk check (birth_date is null or birth_date <= current_date);
