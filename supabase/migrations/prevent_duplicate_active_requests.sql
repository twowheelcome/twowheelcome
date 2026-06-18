-- Stop duplicate stay requests for the same stay.
--
-- A rider could knock again on a host location they already have a PENDING or
-- ACCEPTED request for (overlapping the same dates), creating duplicate requests
-- for one stay. This adds a hard database guarantee: at most one active
-- (PENDING/ACCEPTED) request per rider × location × overlapping date range.
-- The client also blocks this in the UI; this is the safety net that holds even
-- if the UI is bypassed.
--
-- Needs btree_gist so the exclusion constraint can mix `=` (guest/location) with
-- range overlap `&&` in one GiST index.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE stay_requests DROP CONSTRAINT IF EXISTS no_overlapping_active_stays;
ALTER TABLE stay_requests ADD CONSTRAINT no_overlapping_active_stays
  EXCLUDE USING gist (
    guest_id WITH =,
    location_id WITH =,
    daterange(arrival_date, departure_date, '[]') WITH &&
  ) WHERE (status IN ('PENDING', 'ACCEPTED'));
