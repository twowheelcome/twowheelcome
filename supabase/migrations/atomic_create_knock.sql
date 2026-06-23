-- Atomic "knock" creation. Previously the client did three separate writes
-- (find/create conversation, insert stay_request, insert first message); a failure
-- between them left an orphan empty conversation or a request with no chat message.
-- This wraps all of it in one transaction so it's all-or-nothing.
--
-- SECURITY DEFINER (bypasses RLS) but pins guest_id to the authenticated caller and
-- re-checks everything the RLS/triggers would. The existing triggers
-- (validate_conversation_write, validate_stay_request_write, validate_message_request)
-- and the no_overlapping_active_stays exclusion constraint still fire on the inserts,
-- so an overlapping request raises 23P01 and rolls back the WHOLE function — including
-- any conversation it just created.

CREATE OR REPLACE FUNCTION public.create_knock(
  p_host_id uuid,
  p_location_id uuid,
  p_guests integer,
  p_message text,
  p_arrival date,
  p_departure date,
  p_arrival_time text DEFAULT NULL,
  p_photo_url text DEFAULT NULL
)
RETURNS TABLE (conversation_id uuid, request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- The location must belong to the named host (mirrors the stay_request trigger).
  SELECT user_id INTO v_loc_owner FROM host_locations WHERE id = p_location_id;
  IF v_loc_owner IS NULL OR v_loc_owner <> p_host_id THEN
    RAISE EXCEPTION 'Stay location does not belong to the host';
  END IF;

  v_ua := LEAST(v_guest, p_host_id);
  v_ub := GREATEST(v_guest, p_host_id);

  -- Find or create the per-(rider pair, location) conversation.
  SELECT id INTO v_conv FROM conversations
   WHERE user_a = v_ua AND user_b = v_ub AND location_id = p_location_id;
  IF v_conv IS NULL THEN
    INSERT INTO conversations (user_a, user_b, location_id, last_message_at)
      VALUES (v_ua, v_ub, p_location_id, now())
      RETURNING id INTO v_conv;
  ELSE
    UPDATE conversations SET last_message_at = now() WHERE id = v_conv;
  END IF;

  -- Stay request (PENDING). Overlap with an existing active request raises 23P01 and
  -- rolls everything back, including a just-created conversation.
  INSERT INTO stay_requests (
    guest_id, host_id, location_id, status, guests_count, message,
    arrival_date, departure_date, arrival_time, conversation_id, photo_url
  ) VALUES (
    v_guest, p_host_id, p_location_id, 'PENDING', GREATEST(coalesce(p_guests, 1), 1), v_msg,
    p_arrival, p_departure, nullif(btrim(coalesce(p_arrival_time, '')), ''), v_conv, p_photo_url
  ) RETURNING id INTO v_req;

  -- First chat message, tied to the request.
  INSERT INTO messages (conversation_id, sender_id, body, request_id)
    VALUES (v_conv, v_guest, v_msg, v_req);

  conversation_id := v_conv;
  request_id := v_req;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_knock(uuid, uuid, integer, text, date, date, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_knock(uuid, uuid, integer, text, date, date, text, text) TO authenticated;
