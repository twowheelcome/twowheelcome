-- Let a rider withdraw their own still-pending stay request (status PENDING ->
-- CANCELLED). RLS (sr_update) already permits the guest to update their row; this
-- only extends the write-validation trigger, which previously allowed exactly one
-- transition (host: PENDING -> ACCEPTED/REJECTED). CANCELLED is outside the
-- exclusion constraint's WHERE (status IN ('PENDING','ACCEPTED')), so cancelling
-- frees the date slot — the rider can immediately knock again for the same nights.
--
-- Everything else is unchanged: fields other than status/updated_at stay immutable,
-- only PENDING requests can transition, and only the right actor may make each move.
-- Safe to re-run (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.validate_stay_request_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  conv conversations%ROWTYPE;
  location_owner uuid;
  is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
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
    -- The guest withdraws their own pending request.
    IF auth.uid() IS DISTINCT FROM OLD.guest_id AND NOT is_service THEN
      RAISE EXCEPTION 'Only the guest may cancel their stay request';
    END IF;
  ELSIF NEW.status IN ('ACCEPTED', 'REJECTED') THEN
    -- The host responds to the request.
    IF auth.uid() IS DISTINCT FROM OLD.host_id AND NOT is_service THEN
      RAISE EXCEPTION 'Only the host may respond to a stay request';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid stay request status transition';
  END IF;

  RETURN NEW;
END;
$function$;
