-- ---------------------------------------------------------
-- Personal details on profiles (Profile tab).
-- All optional. Readable by the same people who can already
-- read the profile (self, linked guardians, linked children);
-- only the owner can change them (existing "profiles: update own" policy).
-- ---------------------------------------------------------

alter table public.profiles
  add column phone text,
  add column date_of_birth date,
  add column address text;

alter table public.profiles
  add constraint profiles_phone_format
    check (phone is null or (char_length(phone) between 6 and 24 and phone ~ '^\+?[0-9 ().-]+$')),
  -- One day of slack so a date picked in a timezone ahead of the database's UTC is accepted
  add constraint profiles_date_of_birth_range
    check (date_of_birth is null or date_of_birth between date '1900-01-01' and current_date + 1),
  add constraint profiles_address_length
    check (address is null or char_length(btrim(address)) between 1 and 200);

-- Column grants are additive: display_name stays editable, role and public_id stay locked
grant update (phone, date_of_birth, address) on public.profiles to authenticated;
