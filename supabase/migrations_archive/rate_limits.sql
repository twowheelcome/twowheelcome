-- Basic abuse / cost rate limits. Conservative defaults chosen to never bite genuine
-- use; tune the numbers if real usage needs it. Both exempt the service_role and the
-- accept-cascade (app.cascade) so system/edge inserts are never throttled.

-- (1) Knocks: each knock can fire a host email + push, so capping knocks also caps
-- notification cost at the source (notify-request is already idempotent per request).
-- 15/hour per rider is generous for "shopping around" while stopping scripted spam.
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
  IF p_arrival IS NULL OR p_departure IS NULL OR p_departure < p_arrival THEN
    RAISE EXCEPTION 'Invalid stay period';
  END IF;

  -- Rate limit: max 15 knocks per rider per rolling hour.
  IF (SELECT count(*) FROM stay_requests
        WHERE guest_id = v_guest AND created_at > now() - interval '1 hour') >= 15 THEN
    RAISE EXCEPTION 'You have sent too many requests in the last hour. Please wait a little before knocking again.'
      USING errcode = 'check_violation';
  END IF;

  -- The location must belong to the named host (mirrors the stay_request trigger).
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

-- (2) Chat flood guard: max 30 messages per sender per rolling minute.
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Exempt service_role (edge functions) and the accept-cascade system messages.
  IF coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR coalesce(current_setting('app.cascade', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM messages
        WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'You are sending messages too fast. Please slow down.'
      USING errcode = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_message_rate_limit_trigger ON messages;
CREATE TRIGGER enforce_message_rate_limit_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION enforce_message_rate_limit();
