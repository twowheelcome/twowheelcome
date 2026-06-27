-- zzzz_canonical_reconcile.sql
-- FINAL migration (sorts last by filename) that re-asserts the CANONICAL production state of
-- every object that earlier migrations redefine in a different order than they were authored.
-- Supabase applies migrations in filename order, not authoring order, so without this an
-- alphabetically-later but older migration would clobber newer definitions (e.g. the
-- host_locations_public view losing notes/photos/price columns, create_knock losing the
-- 1-night guard, the per-guest overlap constraint coming back, request-photos re-opening).
-- After this runs, a clean from-zero apply matches the live DB. Idempotent / safe to re-run.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) stay_requests constraints (model A): riders knock freely; only a host bed can't be
-- double-booked; no exact-duplicate pending.
ALTER TABLE stay_requests DROP CONSTRAINT IF EXISTS no_overlapping_active_stays;
ALTER TABLE stay_requests DROP CONSTRAINT IF EXISTS no_double_booked_accepted;
ALTER TABLE stay_requests ADD CONSTRAINT no_double_booked_accepted
  EXCLUDE USING gist (location_id WITH =, daterange(arrival_date, departure_date, '[)') WITH &&)
  WHERE (status = 'ACCEPTED');
DROP INDEX IF EXISTS uniq_pending_knock;
CREATE UNIQUE INDEX uniq_pending_knock ON stay_requests (guest_id, location_id, arrival_date, departure_date)
  WHERE status = 'PENDING';

-- 2) Canonical functions (verbatim from production).
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
$function$
;

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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.strip_review_coords()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.body IS NOT NULL THEN
    NEW.body := btrim(regexp_replace(
      regexp_replace(NEW.body,
        '[0-9]{1,3}\.[0-9]{3,}[[:space:],;]+[0-9]{1,3}\.[0-9]{3,}', '', 'g'),
      '[[:space:]]{2,}', ' ', 'g'));
    IF NEW.body = '' THEN NEW.body := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_push_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = '28000';
  END IF;
  UPDATE profiles
     SET push_token = nullif(btrim(coalesce(p_token, '')), '')
   WHERE id = auth.uid();
END;
$function$
;

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
$function$
;

-- 3) (Re)attach triggers to the canonical functions.
DROP TRIGGER IF EXISTS cascade_on_accept_trigger ON stay_requests;
CREATE TRIGGER cascade_on_accept_trigger AFTER UPDATE ON stay_requests
  FOR EACH ROW WHEN (NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED')
  EXECUTE FUNCTION cascade_on_accept();
DROP TRIGGER IF EXISTS validate_stay_request_write_trigger ON stay_requests;
CREATE TRIGGER validate_stay_request_write_trigger BEFORE INSERT OR UPDATE ON stay_requests
  FOR EACH ROW EXECUTE FUNCTION validate_stay_request_write();
DROP TRIGGER IF EXISTS strip_review_coords_trigger ON reviews;
CREATE TRIGGER strip_review_coords_trigger BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION strip_review_coords();
DROP TRIGGER IF EXISTS enforce_message_rate_limit_trigger ON messages;
CREATE TRIGGER enforce_message_rate_limit_trigger BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION enforce_message_rate_limit();

-- 4) Canonical public view with ALL columns; read-only to clients.
DROP VIEW IF EXISTS host_locations_public;
CREATE VIEW host_locations_public WITH (security_invoker = false) AS
  SELECT id, user_id,
    round(location_lat::numeric, 2)::double precision AS location_lat,
    round(location_lng::numeric, 2)::double precision AS location_lng,
    location_city, location_country, parking, parkings, sleep_types, amenities,
    pricing, pricings, vehicle_types, max_guests, notes, created_at,
    photos, price_amount, price_unit, price_currency
  FROM host_locations;
REVOKE ALL ON host_locations_public FROM anon, authenticated;
GRANT SELECT ON host_locations_public TO anon, authenticated;

-- 5) Canonical sr_update: host responds, guest withdraws their own pending.
DROP POLICY IF EXISTS "sr_update" ON stay_requests;
CREATE POLICY "sr_update" ON stay_requests FOR UPDATE
  USING (status = 'PENDING' AND (auth.uid() = host_id OR auth.uid() = guest_id))
  WITH CHECK (
    (auth.uid() = host_id AND status = ANY (ARRAY['ACCEPTED','REJECTED']))
    OR (auth.uid() = guest_id AND status = 'CANCELLED')
  );

-- 6) push_token must not be publicly readable.
REVOKE SELECT (push_token) ON profiles FROM anon, authenticated;

-- 7) request-photos stays PRIVATE with participant-only read; listing-photos stays public.
UPDATE storage.buckets SET public = false WHERE id = 'request-photos';
UPDATE storage.buckets SET public = true  WHERE id = 'listing-photos';
DROP POLICY IF EXISTS "storage_request_photo_participant_read" ON storage.objects;
CREATE POLICY "storage_request_photo_participant_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'request-photos'
    AND EXISTS (
      SELECT 1 FROM public.stay_requests s
      WHERE s.photo_url = storage.objects.name
        AND (s.guest_id = auth.uid() OR s.host_id = auth.uid())
    )
  );
