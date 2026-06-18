-- Private, owner-only label to tell multiple listings apart (e.g. "Chalupa",
-- "Garáž doma"). Never shown to guests: host_locations is owner-only via RLS and the
-- public view (host_locations_public) deliberately does not select this column, so it
-- is never exposed — same as `notes`.
ALTER TABLE host_locations ADD COLUMN IF NOT EXISTS location_name text;
