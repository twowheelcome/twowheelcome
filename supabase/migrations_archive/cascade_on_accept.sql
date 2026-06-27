-- Variant A + guest-side auto-cleanup, scoped to DATE OVERLAP (not "all others"),
-- so multi-night trips keep their other nights. Runs atomically inside the accept:
-- an AFTER UPDATE trigger on stay_requests that fires only on the transition into
-- ACCEPTED.
--
-- On accept (status -> ACCEPTED):
--   1) HOST side  — every OTHER rider's PENDING request for the SAME location whose
--      dates overlap the accepted stay -> REJECTED, with a "spot taken" system
--      message in each affected conversation.
--   2) GUEST side — the accepted rider's OWN other PENDING requests at OTHER hosts
--      whose dates overlap -> CANCELLED, with a system message (frees those slots so
--      the other hosts aren't blocked).
--   3) Non-overlapping requests (other nights) are LEFT untouched.
--
-- Overlap is computed exactly like the exclusion constraint:
--   daterange(arrival_date, departure_date, '[]') && daterange(...accepted...).
--
-- No recursion: the cascade only fires on PENDING/anything -> ACCEPTED; the reject
-- and cancel updates move rows to REJECTED/CANCELLED, which never match the trigger's
-- WHEN clause, so the function never re-enters.
--
-- Safe to re-run (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).

-- ── 1. Let the cascade perform the guest-side CANCELLED transition ──────────────
-- The accepting actor is the HOST. Host-side REJECTED transitions already pass the
-- write-validation trigger (those rows share the accepting host). The guest-side
-- CANCELLED rows belong to OTHER hosts, so the actor != guest_id check would block
-- them. We open a narrow, transaction-local door: a flag that ONLY cascade_on_accept
-- sets (via set_config(..., is_local => true)), which the validator treats like the
-- service role. No external caller can set it.
CREATE OR REPLACE FUNCTION public.validate_stay_request_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  conv conversations%ROWTYPE;
  location_owner uuid;
  is_service  boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  is_internal boolean := coalesce(current_setting('app.cascade', true), '') = '1';
  bypass_actor boolean;
BEGIN
  bypass_actor := is_service OR is_internal;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'A stay request must start as PENDING';
    END IF;
    IF NEW.guest_id = NEW.host_id THEN
      RAISE EXCEPTION 'A rider cannot request a stay from themselves';
    END IF;
    IF NEW.departure_date < NEW.arrival_date THEN
      RAISE EXCEPTION 'Departure cannot be before arrival';
    END IF;
    IF NEW.arrival_date < (now() AT TIME ZONE 'utc')::date THEN
      RAISE EXCEPTION 'A stay request cannot be created for a past date';
    END IF;

    SELECT * INTO conv FROM conversations WHERE id = NEW.conversation_id;
    SELECT user_id INTO location_owner FROM host_locations WHERE id = NEW.location_id;
    IF location_owner IS DISTINCT FROM NEW.host_id THEN
      RAISE EXCEPTION 'Stay location does not belong to the host';
    END IF;
    IF conv.id IS NULL
      OR conv.location_id IS DISTINCT FROM NEW.location_id
      OR conv.user_a IS DISTINCT FROM LEAST(NEW.guest_id, NEW.host_id)
      OR conv.user_b IS DISTINCT FROM GREATEST(NEW.guest_id, NEW.host_id) THEN
      RAISE EXCEPTION 'Stay request does not match its conversation';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'Only stay request status may be changed';
  END IF;
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Invalid stay request status transition';
  END IF;

  IF NEW.status = 'CANCELLED' THEN
    -- The guest withdraws their own pending request (or the accept-cascade does it).
    IF auth.uid() IS DISTINCT FROM OLD.guest_id AND NOT bypass_actor THEN
      RAISE EXCEPTION 'Only the guest may cancel their stay request';
    END IF;
  ELSIF NEW.status IN ('ACCEPTED', 'REJECTED') THEN
    -- The host responds to the request.
    IF auth.uid() IS DISTINCT FROM OLD.host_id AND NOT bypass_actor THEN
      RAISE EXCEPTION 'Only the host may respond to a stay request';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid stay request status transition';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2. The cascade itself ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_on_accept()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  accepted_range daterange := daterange(NEW.arrival_date, NEW.departure_date, '[]');
BEGIN
  -- Belt-and-suspenders: the trigger WHEN clause already restricts this to the
  -- transition into ACCEPTED, but guard anyway so the function is safe if reused.
  IF NEW.status <> 'ACCEPTED' OR OLD.status = 'ACCEPTED' THEN
    RETURN NEW;
  END IF;

  -- Open the narrow internal door for the guest-side CANCELLED writes below.
  PERFORM set_config('app.cascade', '1', true);

  -- 1) HOST side: other riders' overlapping PENDING requests at this location.
  FOR r IN
    SELECT id, conversation_id
    FROM stay_requests
    WHERE location_id = NEW.location_id
      AND status = 'PENDING'
      AND guest_id <> NEW.guest_id
      AND id <> NEW.id
      AND daterange(arrival_date, departure_date, '[]') && accepted_range
  LOOP
    UPDATE stay_requests SET status = 'REJECTED', updated_at = now() WHERE id = r.id;
    IF r.conversation_id IS NOT NULL THEN
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES (r.conversation_id, NEW.host_id,
        '🔒 This spot was just filled for overlapping dates. Knock again for other nights! 🤙');
      UPDATE conversations SET last_message_at = now() WHERE id = r.conversation_id;
    END IF;
  END LOOP;

  -- 2) GUEST side: the accepted rider's own overlapping PENDING requests elsewhere.
  FOR r IN
    SELECT id, conversation_id
    FROM stay_requests
    WHERE guest_id = NEW.guest_id
      AND status = 'PENDING'
      AND id <> NEW.id
      AND location_id IS DISTINCT FROM NEW.location_id
      AND daterange(arrival_date, departure_date, '[]') && accepted_range
  LOOP
    UPDATE stay_requests SET status = 'CANCELLED', updated_at = now() WHERE id = r.id;
    IF r.conversation_id IS NOT NULL THEN
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES (r.conversation_id, NEW.guest_id,
        '✅ The rider got a place for these dates, so this request was withdrawn.');
      UPDATE conversations SET last_message_at = now() WHERE id = r.conversation_id;
    END IF;
  END LOOP;

  PERFORM set_config('app.cascade', '', true);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cascade_on_accept_trigger ON stay_requests;
CREATE TRIGGER cascade_on_accept_trigger
  AFTER UPDATE ON stay_requests
  FOR EACH ROW
  WHEN (NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED')
  EXECUTE FUNCTION cascade_on_accept();
