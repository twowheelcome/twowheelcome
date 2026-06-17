-- #3 Protect reviews at the database level (not just in the app):
--   * reviews stay publicly readable (shown on host profiles and as map ratings);
--   * a review can only be inserted by a real participant of an ACCEPTED stay
--     that has already ended, for the other person, and only once per stay.
--
-- Safe to re-run: policies/constraints are guarded with IF EXISTS / catalog checks.

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- READ: public (ratings and reviews are shown to everyone, incl. logged-out).
DROP POLICY IF EXISTS "rev_select" ON reviews;
CREATE POLICY "rev_select" ON reviews FOR SELECT USING (true);

-- INSERT: only the reviewer themselves, only the counterpart of an ACCEPTED,
-- already-ended stay they were part of.
DROP POLICY IF EXISTS "rev_insert" ON reviews;
CREATE POLICY "rev_insert" ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewer_id <> reviewee_id
    AND EXISTS (
      SELECT 1 FROM stay_requests s
      WHERE s.id = reviews.stay_request_id
        AND s.status = 'ACCEPTED'
        AND s.departure_date <= (now() AT TIME ZONE 'utc')::date
        AND (
          (s.guest_id = auth.uid() AND s.host_id = reviews.reviewee_id) OR
          (s.host_id  = auth.uid() AND s.guest_id = reviews.reviewee_id)
        )
    )
  );

-- One review per stay per reviewer.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_per_stay_reviewer
  ON reviews (stay_request_id, reviewer_id);

-- No self-reviews; rating must be 1..5. NOT VALID so existing rows aren't touched.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_no_self_review') THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_no_self_review
      CHECK (reviewer_id <> reviewee_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_rating_range') THEN
    ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range
      CHECK (rating >= 1 AND rating <= 5) NOT VALID;
  END IF;
END $$;
