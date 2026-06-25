-- Adjacent nights at the same host were wrongly blocked. Stays are checkout-exclusive:
-- arrival = check-in day, departure = check-out day (the client always sets departure =
-- arrival + 1, i.e. one night). So the checkout day must be free for a new check-in.
-- The overlap test used an inclusive daterange '[]', which treated departure == next
-- arrival as an overlap. Switch every overlap definition to half-open '[)' (checkout day
-- excluded), so back-to-back nights pass while real overlaps stay blocked. A 0-night stay
-- (arrival == departure) is now rejected (an empty '[)' range would otherwise slip past
-- the exclusion constraint). Safe to re-run.

-- 1) Exclusion constraint -> half-open range. (No existing data has adjacent pairs, and
--    '[)' is strictly less restrictive than '[]', so re-adding always validates.)
ALTER TABLE stay_requests DROP CONSTRAINT IF EXISTS no_overlapping_active_stays;
ALTER TABLE stay_requests ADD CONSTRAINT no_overlapping_active_stays
  EXCLUDE USING gist (
    guest_id WITH =,
    location_id WITH =,
    daterange(arrival_date, departure_date, '[)') WITH &&
  ) WHERE (status IN ('PENDING', 'ACCEPTED'));

-- 2) Accept-cascade overlap -> half-open (so it rejects/cancels only genuinely
--    overlapping requests, never an adjacent night).
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

  PERFORM set_config('app.cascade', '1', true);

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

  FOR r IN
    SELECT id, conversation_id
    FROM stay_requests
    WHERE guest_id = NEW.guest_id
      AND status = 'PENDING'
      AND id <> NEW.id
      AND location_id IS DISTINCT FROM NEW.location_id
      AND daterange(arrival_date, departure_date, '[)') && accepted_range
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

-- 3) create_knock: require at least one night (departure strictly after arrival).
CREATE OR REPLACE FUNCTION public.create_knock(p_host_id uuid, p_location_id uuid, p_guests integer, p_message text, p_arrival date, p_departure date, p_arrival_time text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text)
 RETURNS TABLE(conversation_id uuid, request_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_guest uuid := auth.uid();
  v_ua uuid;
  v_ub uuid;
  v_conv uuid;
  v_req uuid;
  v_loc_owner uuid;
  v_msg text := btrim(coalesce(p_message, ''));
BEGIN
  IF v_guest IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;
  IF p_host_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'Missing host or location';
  END IF;
  IF v_guest = p_host_id THEN
    RAISE EXCEPTION 'A rider cannot request a stay from themselves';
  END IF;
  IF v_msg = '' THEN
    RAISE EXCEPTION 'A message is required';
  END IF;
  IF p_arrival IS NULL OR p_departure IS NULL OR p_departure <= p_arrival THEN
    RAISE EXCEPTION 'Invalid stay period';
  END IF;

  IF (SELECT count(*) FROM stay_requests
        WHERE guest_id = v_guest AND created_at > now() - interval '1 hour') >= 15 THEN
    RAISE EXCEPTION 'You have sent too many requests in the last hour. Please wait a little before knocking again.'
      USING errcode = 'check_violation';
  END IF;

  SELECT user_id INTO v_loc_owner FROM host_locations WHERE id = p_location_id;
  IF v_loc_owner IS NULL OR v_loc_owner <> p_host_id THEN
    RAISE EXCEPTION 'Stay location does not belong to the host';
  END IF;

  v_ua := LEAST(v_guest, p_host_id);
  v_ub := GREATEST(v_guest, p_host_id);

  SELECT id INTO v_conv FROM conversations
   WHERE user_a = v_ua AND user_b = v_ub AND location_id = p_location_id;
  IF v_conv IS NULL THEN
    INSERT INTO conversations (user_a, user_b, location_id, last_message_at)
      VALUES (v_ua, v_ub, p_location_id, now())
      RETURNING id INTO v_conv;
  ELSE
    UPDATE conversations SET last_message_at = now() WHERE id = v_conv;
  END IF;

  INSERT INTO stay_requests (
    guest_id, host_id, location_id, status, guests_count, message,
    arrival_date, departure_date, arrival_time, conversation_id, photo_url
  ) VALUES (
    v_guest, p_host_id, p_location_id, 'PENDING', GREATEST(coalesce(p_guests, 1), 1), v_msg,
    p_arrival, p_departure, nullif(btrim(coalesce(p_arrival_time, '')), ''), v_conv, p_photo_url
  ) RETURNING id INTO v_req;

  INSERT INTO messages (conversation_id, sender_id, body, request_id)
    VALUES (v_conv, v_guest, v_msg, v_req);

  conversation_id := v_conv;
  request_id := v_req;
  RETURN NEXT;
END;
$function$;

-- 4) Write-validation trigger: a stay must be at least one night (departure > arrival).
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
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Invalid stay request status transition';
  END IF;

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

  RETURN NEW;
END;
$function$;
