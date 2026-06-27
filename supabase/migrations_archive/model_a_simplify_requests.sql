-- Model A (matchmaking, not strict booking). Riders knock freely; the only hard rule is
-- that a host's bed can't be double-booked. Safe to re-run.

-- 1) Drop the per-rider/-location overlap constraint. A rider may now have overlapping,
--    adjacent, or even already-ACCEPTED-elsewhere requests — they sort it out in chat.
ALTER TABLE stay_requests DROP CONSTRAINT IF EXISTS no_overlapping_active_stays;

-- 2) Minimal anti-duplicate guard: the same rider can't have two IDENTICAL pending
--    requests (same place + exact dates). Different dates (overlapping or adjacent) are
--    fine; a withdrawn/rejected one doesn't count, so re-knocking later still works.
DROP INDEX IF EXISTS uniq_pending_knock;
CREATE UNIQUE INDEX uniq_pending_knock
  ON stay_requests (guest_id, location_id, arrival_date, departure_date)
  WHERE status = 'PENDING';

-- 3) Host-bed protection: no two ACCEPTED stays for the SAME location may overlap nights.
--    Checkout-exclusive '[)' so adjacent nights (checkout == next check-in) are allowed,
--    and different riders on consecutive nights are fine. This blocks a host from
--    accepting a second rider for a night already taken (raises 23P01 on that accept).
ALTER TABLE stay_requests DROP CONSTRAINT IF EXISTS no_double_booked_accepted;
ALTER TABLE stay_requests ADD CONSTRAINT no_double_booked_accepted
  EXCLUDE USING gist (
    location_id WITH =,
    daterange(arrival_date, departure_date, '[)') WITH &&
  ) WHERE (status = 'ACCEPTED');

-- 4) Accept-cascade: keep ONLY the host-side cleanup (auto-reject other riders' pending
--    requests for the same location + overlapping night, with a "spot taken" note). The
--    guest-side cleanup is removed — an accepted rider keeps their other requests
--    elsewhere and chooses in chat.
CREATE OR REPLACE FUNCTION public.cascade_on_accept()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  accepted_range daterange := daterange(NEW.arrival_date, NEW.departure_date, '[)');
BEGIN
  IF NEW.status <> 'ACCEPTED' OR OLD.status = 'ACCEPTED' THEN
    RETURN NEW;
  END IF;

  -- Exempts the auto-message inserts below from the per-sender message rate limit.
  PERFORM set_config('app.cascade', '1', true);

  -- Other riders' overlapping PENDING requests at this location -> REJECTED + note.
  FOR r IN
    SELECT id, conversation_id
    FROM stay_requests
    WHERE location_id = NEW.location_id
      AND status = 'PENDING'
      AND guest_id <> NEW.guest_id
      AND id <> NEW.id
      AND daterange(arrival_date, departure_date, '[)') && accepted_range
  LOOP
    UPDATE stay_requests SET status = 'REJECTED', updated_at = now() WHERE id = r.id;
    IF r.conversation_id IS NOT NULL THEN
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES (r.conversation_id, NEW.host_id,
        '🔒 This spot was just filled for overlapping dates. Knock again for other nights! 🤙');
      UPDATE conversations SET last_message_at = now() WHERE id = r.conversation_id;
    END IF;
  END LOOP;

  PERFORM set_config('app.cascade', '', true);
  RETURN NEW;
END;
$function$;
