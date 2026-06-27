-- 00000000000000_baseline.sql
-- Canonical baseline = full public schema + storage setup, reconstructed from the live
-- production DB (read-only). A fresh `supabase db push` applies just this and reproduces
-- production. The old incremental migrations are archived under supabase/migrations_archive/.
-- Supabase provisions the auth & storage schemas (auth.users, storage.objects/buckets,
-- storage.foldername, auth.uid) before migrations run, so this baseline relies on them.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Tables ──
CREATE TABLE IF NOT EXISTS bikes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  make text,
  model text,
  year integer,
  type text,
  photo_url text,
  is_primary boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS conversation_reads (
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  last_read_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_a uuid,
  user_b uuid,
  last_message_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  location_id uuid
);
CREATE TABLE IF NOT EXISTS host_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  location_lat double precision NOT NULL,
  location_lng double precision NOT NULL,
  location_city text DEFAULT ''::text,
  location_country text DEFAULT ''::text,
  parking text DEFAULT 'yard'::text,
  max_guests integer DEFAULT 2,
  pricing text DEFAULT 'free'::text,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  sleep_types text[] DEFAULT '{}'::text[],
  amenities text[] DEFAULT '{}'::text[],
  available_from date,
  available_to date,
  pricings text[] DEFAULT '{}'::text[],
  vehicle_types text[] DEFAULT '{}'::text[],
  parkings text[] DEFAULT '{}'::text[],
  location_name text,
  photos text[] NOT NULL DEFAULT '{}'::text[],
  price_amount numeric,
  price_unit text,
  price_currency text
);
CREATE TABLE IF NOT EXISTS host_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  is_active boolean DEFAULT true,
  max_guests integer DEFAULT 1,
  parking text,
  sleeping text[],
  facilities text[],
  bonuses text[],
  bike_types text[],
  location_lat numeric,
  location_lng numeric,
  location_city text,
  location_country text,
  pricing text DEFAULT 'free'::text,
  price_per_night numeric DEFAULT 0,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  sender_id uuid,
  body text,
  photo_url text,
  request_id uuid,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profiles (
  id uuid NOT NULL,
  full_name text,
  avatar_url text,
  bio text,
  languages text[],
  verified_phone boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  last_seen timestamp without time zone DEFAULT now(),
  vehicle_types text[] DEFAULT '{}'::text[],
  push_token text,
  bike_model text,
  cover_url text,
  notify_email boolean NOT NULL DEFAULT true,
  notify_push boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS request_notification_events (
  request_id uuid NOT NULL,
  event text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stay_request_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  rating smallint NOT NULL,
  body text,
  created_at timestamp with time zone DEFAULT now(),
  reply_body text,
  reply_created_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS stay_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  guest_id uuid,
  host_id uuid,
  status text DEFAULT 'PENDING'::text,
  arrival_date date,
  departure_date date,
  guests_count integer DEFAULT 1,
  message text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  arrival_time text,
  guest_vehicle text,
  conversation_id uuid NOT NULL,
  photo_url text,
  location_id uuid NOT NULL
);

-- ── Constraints (PK / unique / check / exclude) ──
ALTER TABLE bikes ADD CONSTRAINT bikes_pkey PRIMARY KEY (id);
ALTER TABLE conversation_reads ADD CONSTRAINT conversation_reads_pkey PRIMARY KEY (user_id, conversation_id);
ALTER TABLE conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE host_locations ADD CONSTRAINT host_locations_pkey PRIMARY KEY (id);
ALTER TABLE host_profiles ADD CONSTRAINT host_profiles_pkey PRIMARY KEY (id);
ALTER TABLE messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE request_notification_events ADD CONSTRAINT request_notification_events_pkey PRIMARY KEY (request_id, event);
ALTER TABLE reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE stay_requests ADD CONSTRAINT stay_requests_pkey PRIMARY KEY (id);
ALTER TABLE host_profiles ADD CONSTRAINT host_profiles_user_id_key UNIQUE (user_id);
ALTER TABLE reviews ADD CONSTRAINT reviews_stay_request_id_reviewer_id_key UNIQUE (stay_request_id, reviewer_id);
ALTER TABLE conversations ADD CONSTRAINT conversations_ordered_distinct_users CHECK (((user_a)::text < (user_b)::text));
ALTER TABLE host_locations ADD CONSTRAINT host_locations_country_length CHECK (((location_country IS NULL) OR (char_length(location_country) <= 120)));
ALTER TABLE host_locations ADD CONSTRAINT host_locations_notes_length CHECK (((notes IS NULL) OR (char_length(notes) <= 4000)));
ALTER TABLE host_locations ADD CONSTRAINT host_locations_name_length CHECK (((location_name IS NULL) OR (char_length(location_name) <= 200)));
ALTER TABLE host_locations ADD CONSTRAINT host_locations_city_length CHECK (((location_city IS NULL) OR (char_length(location_city) <= 120)));
ALTER TABLE host_locations ADD CONSTRAINT host_locations_photos_max3 CHECK (((array_length(photos, 1) IS NULL) OR (array_length(photos, 1) <= 3)));
ALTER TABLE host_locations ADD CONSTRAINT host_locations_price_unit_len CHECK (((price_unit IS NULL) OR (char_length(price_unit) <= 40)));
ALTER TABLE host_locations ADD CONSTRAINT host_locations_price_currency_chk CHECK (((price_currency IS NULL) OR (price_currency = ANY (ARRAY['EUR'::text, 'USD'::text, 'GBP'::text, 'CHF'::text, 'JPY'::text, 'CAD'::text, 'AUD'::text, 'CZK'::text]))));
ALTER TABLE messages ADD CONSTRAINT messages_body_length CHECK (((body IS NULL) OR (char_length(body) <= 4000)));
ALTER TABLE profiles ADD CONSTRAINT profiles_bio_length CHECK (((bio IS NULL) OR (char_length(bio) <= 2000)));
ALTER TABLE profiles ADD CONSTRAINT profiles_full_name_length CHECK (((full_name IS NULL) OR (char_length(full_name) <= 120)));
ALTER TABLE request_notification_events ADD CONSTRAINT request_notification_events_event_check CHECK ((event = ANY (ARRAY['new_request'::text, 'accepted'::text, 'rejected'::text, 'cancelled_by_host'::text])));
ALTER TABLE reviews ADD CONSTRAINT reviews_no_self_review CHECK ((reviewer_id <> reviewee_id)) NOT VALID;
ALTER TABLE reviews ADD CONSTRAINT reviews_body_length CHECK (((body IS NULL) OR (char_length(body) <= 2000)));
ALTER TABLE reviews ADD CONSTRAINT reviews_reply_length CHECK (((reply_body IS NULL) OR (char_length(reply_body) <= 2000)));
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (((rating >= 1) AND (rating <= 5))) NOT VALID;
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE stay_requests ADD CONSTRAINT stay_requests_message_length CHECK (((message IS NULL) OR (char_length(message) <= 2000)));
ALTER TABLE stay_requests ADD CONSTRAINT no_double_booked_accepted EXCLUDE USING gist (location_id WITH =, daterange(arrival_date, departure_date, '[)'::text) WITH &&) WHERE ((status = 'ACCEPTED'::text));

-- ── Foreign keys (after all tables) ──
ALTER TABLE bikes ADD CONSTRAINT bikes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE conversation_reads ADD CONSTRAINT conversation_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE conversation_reads ADD CONSTRAINT conversation_reads_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD CONSTRAINT conversations_user_b_fkey FOREIGN KEY (user_b) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD CONSTRAINT conversations_location_id_fkey FOREIGN KEY (location_id) REFERENCES host_locations(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD CONSTRAINT conversations_user_a_fkey FOREIGN KEY (user_a) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE host_locations ADD CONSTRAINT host_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE host_profiles ADD CONSTRAINT host_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_request_id_fkey FOREIGN KEY (request_id) REFERENCES stay_requests(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);
ALTER TABLE request_notification_events ADD CONSTRAINT request_notification_events_request_id_fkey FOREIGN KEY (request_id) REFERENCES stay_requests(id) ON DELETE CASCADE;
ALTER TABLE reviews ADD CONSTRAINT reviews_stay_request_id_fkey FOREIGN KEY (stay_request_id) REFERENCES stay_requests(id);
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewee_id_fkey FOREIGN KEY (reviewee_id) REFERENCES auth.users(id);
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id);
ALTER TABLE stay_requests ADD CONSTRAINT stay_requests_location_id_fkey FOREIGN KEY (location_id) REFERENCES host_locations(id) ON DELETE RESTRICT;
ALTER TABLE stay_requests ADD CONSTRAINT stay_requests_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE stay_requests ADD CONSTRAINT stay_requests_host_id_fkey FOREIGN KEY (host_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE stay_requests ADD CONSTRAINT stay_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id);

-- ── Indexes ──
CREATE UNIQUE INDEX uniq_pending_knock ON public.stay_requests USING btree (guest_id, location_id, arrival_date, departure_date) WHERE (status = 'PENDING'::text);
CREATE INDEX stay_requests_location_id_idx ON public.stay_requests USING btree (location_id);
CREATE UNIQUE INDEX conversations_pair_location_key ON public.conversations USING btree (user_a, user_b, location_id);
CREATE UNIQUE INDEX reviews_unique_per_stay_reviewer ON public.reviews USING btree (stay_request_id, reviewer_id);

-- ── Row level security ──
ALTER TABLE bikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE stay_requests ENABLE ROW LEVEL SECURITY;

-- ── Policies ──
CREATE POLICY "Kola vidí všichni" ON bikes FOR SELECT TO public USING (true);
CREATE POLICY "Vlastní kola spravuje majitel" ON bikes FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "cr_all" ON conversation_reads FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "conv_insert" ON conversations FOR INSERT TO public WITH CHECK (((auth.uid() = user_a) OR (auth.uid() = user_b)));
CREATE POLICY "conv_select" ON conversations FOR SELECT TO public USING (((auth.uid() = user_a) OR (auth.uid() = user_b)));
CREATE POLICY "conv_update" ON conversations FOR UPDATE TO public USING (((auth.uid() = user_a) OR (auth.uid() = user_b))) WITH CHECK (((auth.uid() = user_a) OR (auth.uid() = user_b)));
CREATE POLICY "host_locations_owner_all" ON host_locations FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Hostitelé viditelní všem" ON host_profiles FOR SELECT TO public USING (true);
CREATE POLICY "Vlastní hostitelský profil spravuje majitel" ON host_profiles FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "msg_insert" ON messages FOR INSERT TO public WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((auth.uid() = c.user_a) OR (auth.uid() = c.user_b)))))));
CREATE POLICY "msg_select" ON messages FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((auth.uid() = c.user_a) OR (auth.uid() = c.user_b))))));
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY "profiles_public_read" ON profiles FOR SELECT TO public USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO public USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
CREATE POLICY "rev_insert" ON reviews FOR INSERT TO public WITH CHECK (((auth.uid() = reviewer_id) AND (reviewer_id <> reviewee_id) AND (EXISTS ( SELECT 1
   FROM stay_requests s
  WHERE ((s.id = reviews.stay_request_id) AND (s.status = 'ACCEPTED'::text) AND (s.departure_date <= ((now() AT TIME ZONE 'utc'::text))::date) AND (((s.guest_id = auth.uid()) AND (s.host_id = reviews.reviewee_id)) OR ((s.host_id = auth.uid()) AND (s.guest_id = reviews.reviewee_id))))))));
CREATE POLICY "rev_select" ON reviews FOR SELECT TO public USING (true);
CREATE POLICY "sr_insert" ON stay_requests FOR INSERT TO public WITH CHECK (((auth.uid() = guest_id) AND (status = 'PENDING'::text)));
CREATE POLICY "sr_select" ON stay_requests FOR SELECT TO public USING (((auth.uid() = guest_id) OR (auth.uid() = host_id)));
CREATE POLICY "sr_update" ON stay_requests FOR UPDATE TO public USING (((status = 'PENDING'::text) AND ((auth.uid() = host_id) OR (auth.uid() = guest_id)))) WITH CHECK ((((auth.uid() = host_id) AND (status = ANY (ARRAY['ACCEPTED'::text, 'REJECTED'::text]))) OR ((auth.uid() = guest_id) AND (status = 'CANCELLED'::text))));

-- ── Functions ──
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

CREATE OR REPLACE FUNCTION public.delete_account_data(p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_conv_ids uuid[];
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'Missing user id';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_uid THEN
    RAISE EXCEPTION 'Not allowed to delete another account';
  END IF;

  -- Conversations this user is part of (to prune empties at the end).
  SELECT array_agg(id) INTO v_conv_ids
  FROM conversations WHERE user_a = p_uid OR user_b = p_uid;

  -- Remove only this user's messages; keep the other rider's. Detach surviving
  -- messages from the user's stay_requests before those requests disappear.
  DELETE FROM messages WHERE sender_id = p_uid;
  UPDATE messages SET request_id = NULL
    WHERE request_id IN (SELECT id FROM stay_requests WHERE guest_id = p_uid OR host_id = p_uid);

  -- Reviews must go before stay_requests (reviews.stay_request_id = NO ACTION).
  DELETE FROM reviews WHERE reviewer_id = p_uid OR reviewee_id = p_uid;

  -- Stay requests where the user is guest or host.
  DELETE FROM stay_requests WHERE guest_id = p_uid OR host_id = p_uid;

  -- Anonymize this participant in shared conversations; keep the other side.
  UPDATE conversations SET user_a = NULL WHERE user_a = p_uid;
  UPDATE conversations SET user_b = NULL WHERE user_b = p_uid;

  -- Drop conversations that have no messages left at all.
  IF v_conv_ids IS NOT NULL THEN
    DELETE FROM conversations c
    WHERE c.id = ANY(v_conv_ids)
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id);
  END IF;

  -- The user's host locations (no FK from host_locations to profiles).
  DELETE FROM host_locations WHERE user_id = p_uid;

  -- Finally the profile — cascades bikes, host_profiles and any leftover stay_requests.
  DELETE FROM profiles WHERE id = p_uid;
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''))
  ON CONFLICT (id) DO NOTHING;
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
  -- A host's public reply gets the same coordinate scrub as the review body.
  IF NEW.reply_body IS NOT NULL THEN
    NEW.reply_body := btrim(regexp_replace(
      regexp_replace(NEW.reply_body,
        '[0-9]{1,3}\.[0-9]{3,}[[:space:],;]+[0-9]{1,3}\.[0-9]{3,}', '', 'g'),
      '[[:space:]]{2,}', ' ', 'g'));
    IF NEW.reply_body = '' THEN NEW.reply_body := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

-- A reviewed person (the reviewee) may post ONE public reply per review. Goes through a
-- SECURITY DEFINER RPC because reviews has no UPDATE policy — the function pins
-- auth.uid() = reviewee_id, and the strip_review_coords trigger scrubs coords on write.
CREATE OR REPLACE FUNCTION public.set_review_reply(p_review_id uuid, p_reply text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reviewee uuid;
  v_clean text;
BEGIN
  SELECT reviewee_id INTO v_reviewee FROM reviews WHERE id = p_review_id;
  IF v_reviewee IS NULL THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
  IF auth.uid() IS DISTINCT FROM v_reviewee THEN
    RAISE EXCEPTION 'Only the reviewed person may reply to their review';
  END IF;
  v_clean := btrim(coalesce(p_reply, ''));
  IF v_clean = '' THEN
    UPDATE reviews SET reply_body = NULL, reply_created_at = NULL WHERE id = p_review_id;
  ELSE
    UPDATE reviews SET reply_body = left(v_clean, 2000), reply_created_at = now() WHERE id = p_review_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_conversation_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  location_owner uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NEW.user_a IS DISTINCT FROM OLD.user_a
      OR NEW.user_b IS DISTINCT FROM OLD.user_b
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Conversation participants and location are immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_a::text >= NEW.user_b::text THEN
    RAISE EXCEPTION 'Conversation users must be distinct and ordered';
  END IF;

  SELECT user_id INTO location_owner FROM host_locations WHERE id = NEW.location_id;
  IF location_owner IS NULL OR location_owner NOT IN (NEW.user_a, NEW.user_b) THEN
    RAISE EXCEPTION 'Conversation location must belong to one participant';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_message_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM stay_requests s
    WHERE s.id = NEW.request_id AND s.conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'Message request does not belong to this conversation';
  END IF;
  RETURN NEW;
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

-- ── Triggers ──
CREATE TRIGGER cascade_on_accept_trigger AFTER UPDATE ON public.stay_requests FOR EACH ROW WHEN (((new.status = 'ACCEPTED'::text) AND (old.status IS DISTINCT FROM 'ACCEPTED'::text))) EXECUTE FUNCTION cascade_on_accept();
CREATE TRIGGER enforce_message_rate_limit_trigger BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION enforce_message_rate_limit();
CREATE TRIGGER strip_review_coords_trigger BEFORE INSERT OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION strip_review_coords();
CREATE TRIGGER validate_conversation_write_trigger BEFORE INSERT OR UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION validate_conversation_write();
CREATE TRIGGER validate_message_request_trigger BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION validate_message_request();
CREATE TRIGGER validate_stay_request_write_trigger BEFORE INSERT OR UPDATE ON public.stay_requests FOR EACH ROW EXECUTE FUNCTION validate_stay_request_write();

-- ── Views ──
CREATE OR REPLACE VIEW host_locations_public WITH (security_invoker=false) AS
 SELECT id,
    user_id,
    round(location_lat::numeric, 2)::double precision AS location_lat,
    round(location_lng::numeric, 2)::double precision AS location_lng,
    location_city,
    location_country,
    parking,
    parkings,
    sleep_types,
    amenities,
    pricing,
    pricings,
    vehicle_types,
    max_guests,
    notes,
    created_at,
    photos,
    price_amount,
    price_unit,
    price_currency
   FROM host_locations;

-- ── Grants ──
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON bikes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON conversation_reads TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON conversation_reads TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON conversation_reads TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON conversations TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON conversations TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON conversations TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON host_locations TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON host_locations TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON host_locations TO service_role;
GRANT SELECT ON host_locations_public TO anon;
GRANT SELECT ON host_locations_public TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON host_locations_public TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON host_profiles TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON messages TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON messages TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON messages TO service_role;
GRANT REFERENCES, TRIGGER, TRUNCATE ON profiles TO anon;
GRANT REFERENCES, TRIGGER, TRUNCATE ON profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON profiles TO service_role;
-- Column-scoped grants for profiles (mirror the live DB). A fresh deploy needs these
-- explicitly: anon/authenticated have no table-level SELECT, so reads of the public
-- identity columns and own-profile writes would otherwise fail on permissions.
-- push_token is deliberately NOT readable (written only via set_push_token / own UPDATE),
-- and notify_email/notify_push stay off the public surface, matching production.
GRANT SELECT (id, full_name, bio, avatar_url) ON profiles TO anon;
GRANT SELECT (id, full_name, bio, avatar_url) ON profiles TO authenticated;
GRANT INSERT (id, full_name, bio, avatar_url, push_token) ON profiles TO authenticated;
GRANT UPDATE (full_name, bio, avatar_url, push_token) ON profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON request_notification_events TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON reviews TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON reviews TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON reviews TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON stay_requests TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON stay_requests TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON stay_requests TO service_role;


-- ── User blocks (post-contact safety; enforced in the stay_request + message validators) ──
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_select" ON public.blocks FOR SELECT TO public USING (auth.uid() = blocker_id);
CREATE POLICY "blocks_insert" ON public.blocks FOR INSERT TO public WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks_delete" ON public.blocks FOR DELETE TO public USING (auth.uid() = blocker_id);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT SELECT, INSERT, DELETE, UPDATE, REFERENCES, TRIGGER, TRUNCATE ON public.blocks TO service_role;


-- ── Storage (buckets + object policies) ──
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true) ON CONFLICT (id) DO UPDATE SET public=excluded.public;
INSERT INTO storage.buckets (id, name, public) VALUES ('listing-photos','listing-photos',true) ON CONFLICT (id) DO UPDATE SET public=excluded.public;
INSERT INTO storage.buckets (id, name, public) VALUES ('request-photos','request-photos',false) ON CONFLICT (id) DO UPDATE SET public=excluded.public;
CREATE POLICY "storage_listing_delete" ON storage.objects FOR DELETE TO public USING (((bucket_id = 'listing-photos'::text) AND (owner_id = (auth.uid())::text)));
CREATE POLICY "storage_listing_insert" ON storage.objects FOR INSERT TO public WITH CHECK (((bucket_id = 'listing-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_listing_read" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'listing-photos'::text));
CREATE POLICY "storage_listing_update" ON storage.objects FOR UPDATE TO public USING (((bucket_id = 'listing-photos'::text) AND (owner_id = (auth.uid())::text))) WITH CHECK (((bucket_id = 'listing-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_owner_media_delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = ANY (ARRAY['avatars'::text, 'request-photos'::text])) AND (owner_id = (auth.uid())::text)));
CREATE POLICY "storage_owner_media_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = ANY (ARRAY['avatars'::text, 'request-photos'::text])) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_owner_media_update" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = ANY (ARRAY['avatars'::text, 'request-photos'::text])) AND (owner_id = (auth.uid())::text))) WITH CHECK (((bucket_id = ANY (ARRAY['avatars'::text, 'request-photos'::text])) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_public_media_read" ON storage.objects FOR SELECT TO public USING ((bucket_id = 'avatars'::text));
CREATE POLICY "storage_request_photo_participant_read" ON storage.objects FOR SELECT TO public USING (((bucket_id = 'request-photos'::text) AND (EXISTS ( SELECT 1
   FROM stay_requests s
  WHERE ((s.photo_url = objects.name) AND ((s.guest_id = auth.uid()) OR (s.host_id = auth.uid())))))));


-- ── Auth: auto-create a profile row on signup (trigger lives on auth.users) ──
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Realtime: the chat list + open thread rely on these tables being in the
-- supabase_realtime publication (Supabase creates the publication itself). ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'stay_requests') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE stay_requests;
    END IF;
  END IF;
END $$;
