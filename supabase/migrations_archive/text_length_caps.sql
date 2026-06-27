-- Defense-in-depth server-side length caps on free-text fields. The client limits these
-- via maxLength, but a direct API call could otherwise store a multi-megabyte payload.
-- Caps are generous (existing data maxes out well under them) so they never bite genuine
-- use. NULL is always allowed. Safe to re-run.

ALTER TABLE messages       DROP CONSTRAINT IF EXISTS messages_body_length;
ALTER TABLE messages       ADD  CONSTRAINT messages_body_length       CHECK (body IS NULL OR char_length(body) <= 4000);

ALTER TABLE stay_requests  DROP CONSTRAINT IF EXISTS stay_requests_message_length;
ALTER TABLE stay_requests  ADD  CONSTRAINT stay_requests_message_length CHECK (message IS NULL OR char_length(message) <= 2000);

ALTER TABLE host_locations DROP CONSTRAINT IF EXISTS host_locations_notes_length;
ALTER TABLE host_locations ADD  CONSTRAINT host_locations_notes_length CHECK (notes IS NULL OR char_length(notes) <= 4000);

ALTER TABLE host_locations DROP CONSTRAINT IF EXISTS host_locations_name_length;
ALTER TABLE host_locations ADD  CONSTRAINT host_locations_name_length  CHECK (location_name IS NULL OR char_length(location_name) <= 200);

ALTER TABLE host_locations DROP CONSTRAINT IF EXISTS host_locations_city_length;
ALTER TABLE host_locations ADD  CONSTRAINT host_locations_city_length  CHECK (location_city IS NULL OR char_length(location_city) <= 120);

ALTER TABLE host_locations DROP CONSTRAINT IF EXISTS host_locations_country_length;
ALTER TABLE host_locations ADD  CONSTRAINT host_locations_country_length CHECK (location_country IS NULL OR char_length(location_country) <= 120);

ALTER TABLE profiles       DROP CONSTRAINT IF EXISTS profiles_full_name_length;
ALTER TABLE profiles       ADD  CONSTRAINT profiles_full_name_length   CHECK (full_name IS NULL OR char_length(full_name) <= 120);

ALTER TABLE profiles       DROP CONSTRAINT IF EXISTS profiles_bio_length;
ALTER TABLE profiles       ADD  CONSTRAINT profiles_bio_length         CHECK (bio IS NULL OR char_length(bio) <= 2000);
