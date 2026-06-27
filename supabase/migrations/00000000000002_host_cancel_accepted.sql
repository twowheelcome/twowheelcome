-- Host can cancel an already-ACCEPTED stay (life happens).
--
-- Two gates protected the stay_requests status until now and BOTH only allowed
-- transitions out of PENDING:
--   1. RLS policy "sr_update" (USING required status = 'PENDING')
--   2. trigger validate_stay_request_write() (raised on OLD.status <> 'PENDING')
--
-- This migration widens both to permit exactly ONE new transition:
--   ACCEPTED -> CANCELLED, by the host of that stay only.
-- Cancelling drops the row out of the no_double_booked_accepted exclusion
-- constraint (it is WHERE status = 'ACCEPTED'), so the host's bed slot frees up
-- automatically. A guest still cannot touch an accepted stay — the RLS USING
-- clause only exposes ACCEPTED rows for update to the host.

-- ── 1. Trigger: allow host ACCEPTED -> CANCELLED ────────────────────────────
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
    IF NEW.departure_date <= NEW.arrival_date THEN
      RAISE EXCEPTION 'A stay must be at least one night (checkout after arrival)';
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

  IF OLD.status = 'PENDING' THEN
    IF NEW.status = 'CANCELLED' THEN
      IF auth.uid() IS DISTINCT FROM OLD.guest_id AND NOT bypass_actor THEN
        RAISE EXCEPTION 'Only the guest may cancel their stay request';
      END IF;
    ELSIF NEW.status IN ('ACCEPTED', 'REJECTED') THEN
      IF auth.uid() IS DISTINCT FROM OLD.host_id AND NOT bypass_actor THEN
        RAISE EXCEPTION 'Only the host may respond to a stay request';
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid stay request status transition';
    END IF;
  ELSIF OLD.status = 'ACCEPTED' AND NEW.status = 'CANCELLED' THEN
    -- The host calls off an already-accepted stay; frees the booked night slot.
    IF auth.uid() IS DISTINCT FROM OLD.host_id AND NOT bypass_actor THEN
      RAISE EXCEPTION 'Only the host may cancel an accepted stay';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid stay request status transition';
  END IF;

  RETURN NEW;
END;
$function$
;

-- ── 2. RLS: host may also update their own ACCEPTED rows (-> CANCELLED) ──────
DROP POLICY IF EXISTS "sr_update" ON public.stay_requests;
CREATE POLICY "sr_update" ON public.stay_requests
  FOR UPDATE TO public
  USING (
    ((auth.uid() = host_id) OR (auth.uid() = guest_id))
    AND (
      (status = 'PENDING'::text)
      OR (status = 'ACCEPTED'::text AND auth.uid() = host_id)
    )
  )
  WITH CHECK (
    -- host responds to a pending knock
    ((auth.uid() = host_id) AND (status = ANY (ARRAY['ACCEPTED'::text, 'REJECTED'::text])))
    -- guest withdraws their own pending knock
    OR ((auth.uid() = guest_id) AND (status = 'CANCELLED'::text))
    -- host cancels (pending or already-accepted) stay
    OR ((auth.uid() = host_id) AND (status = 'CANCELLED'::text))
  );
