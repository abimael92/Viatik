-- Store the user's own optional personal details on their private profile,
-- mirroring the rich fields collected for contacts. Registration/onboarding can
-- then capture a complete profile while keeping every field (except the name)
-- optional. No sensitive identity documents (e.g. passport numbers) are stored.

alter table public.profiles
  add column birth_date date,
  add column emergency_contact_name text,
  add column emergency_contact_relationship text,
  add column emergency_contact_phone text,
  add column dietary_restrictions text[] not null default '{}',
  add column allergies text[] not null default '{}',
  add column passport_issuing_country text,
  add column passport_expires_on date;

alter table public.profiles
  add constraint profiles_emergency_name_length_chk check (
    emergency_contact_name is null or char_length(trim(emergency_contact_name)) between 2 and 100
  ),
  add constraint profiles_emergency_relationship_length_chk check (
    emergency_contact_relationship is null or char_length(trim(emergency_contact_relationship)) between 2 and 50
  ),
  add constraint profiles_emergency_phone_length_chk check (
    emergency_contact_phone is null or char_length(trim(emergency_contact_phone)) between 7 and 32
  ),
  add constraint profiles_dietary_restrictions_chk check (
    array_position(dietary_restrictions, null) is null and cardinality(dietary_restrictions) <= 50
  ),
  add constraint profiles_allergies_chk check (
    array_position(allergies, null) is null and cardinality(allergies) <= 50
  ),
  add constraint profiles_passport_country_chk check (
    passport_issuing_country is null or passport_issuing_country ~ '^[A-Z]{2}$'
  ),
  add constraint profiles_birth_date_chk check (
    birth_date is null or birth_date <= current_date
  );
