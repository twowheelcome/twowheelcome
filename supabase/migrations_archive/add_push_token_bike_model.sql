-- Push notification token (Expo) + bike model field on profiles
alter table profiles
  add column if not exists push_token text,
  add column if not exists bike_model  text;
