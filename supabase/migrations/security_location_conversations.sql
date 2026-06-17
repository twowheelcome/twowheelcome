-- Security reset and location-specific conversations.
-- Existing conversations/stays/reviews are test data and are intentionally removed.

TRUNCATE TABLE conversation_reads, messages, reviews, stay_requests, conversations CASCADE;

-- One conversation belongs to one rider pair at one host location.
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_user_a_user_b_key;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES host_locations(id) ON DELETE RESTRICT;

ALTER TABLE conversations ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_location_id_fkey;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_location_id_fkey FOREIGN KEY (location_id) REFERENCES host_locations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_location_key
  ON conversations (user_a, user_b, location_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_ordered_distinct_users') THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_ordered_distinct_users
      CHECK (user_a::text < user_b::text);
  END IF;
END $$;

-- Account deletion anonymizes the departed participant instead of deleting the
-- other rider's messages. New conversations still require two users in the
-- validation trigger below.
ALTER TABLE conversations ALTER COLUMN user_a DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN user_b DROP NOT NULL;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_a_fkey;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_user_b_fkey;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_user_a_fkey FOREIGN KEY (user_a) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT conversations_user_b_fkey FOREIGN KEY (user_b) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_request_id_fkey;
ALTER TABLE messages
  ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT messages_request_id_fkey FOREIGN KEY (request_id) REFERENCES stay_requests(id) ON DELETE SET NULL;

-- A deleted location must never silently detach a stay and make the app choose
-- another address. Hosts can remove a location only while it has no history.
ALTER TABLE stay_requests DROP CONSTRAINT IF EXISTS stay_requests_location_id_fkey;
ALTER TABLE stay_requests
  ADD CONSTRAINT stay_requests_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES host_locations(id) ON DELETE RESTRICT;
ALTER TABLE stay_requests ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE stay_requests ALTER COLUMN conversation_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_conversation_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS validate_conversation_write_trigger ON conversations;
CREATE TRIGGER validate_conversation_write_trigger
BEFORE INSERT OR UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION public.validate_conversation_write();

CREATE OR REPLACE FUNCTION public.validate_stay_request_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv conversations%ROWTYPE;
  location_owner uuid;
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
  IF OLD.status <> 'PENDING' OR NEW.status NOT IN ('ACCEPTED', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid stay request status transition';
  END IF;
  IF auth.uid() IS DISTINCT FROM OLD.host_id
    AND coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the host may respond to a stay request';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_stay_request_write_trigger ON stay_requests;
CREATE TRIGGER validate_stay_request_write_trigger
BEFORE INSERT OR UPDATE ON stay_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_stay_request_write();

-- Replace every permissive policy used by the app with narrow policies. Policy
-- names created in the dashboard are unknown, so remove all policies on these
-- security-sensitive tables instead of relying on a list of old names.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('conversations', 'messages', 'stay_requests', 'reviews')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', item.policyname, item.schemaname, item.tablename);
  END LOOP;
END $$;

-- Exact host locations and private notes are owner-only. The public reads the
-- deliberately limited view created below.
DO $$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'host_locations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.host_locations', policy_name);
  END LOOP;
END $$;
CREATE POLICY host_locations_owner_all ON host_locations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "conv_select" ON conversations FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "conv_insert" ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "conv_update" ON conversations FOR UPDATE
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "sr_select" ON stay_requests FOR SELECT
  USING (auth.uid() = guest_id OR auth.uid() = host_id);
CREATE POLICY "sr_insert" ON stay_requests FOR INSERT
  WITH CHECK (auth.uid() = guest_id AND status = 'PENDING');
CREATE POLICY "sr_update" ON stay_requests FOR UPDATE
  USING (auth.uid() = host_id AND status = 'PENDING')
  WITH CHECK (auth.uid() = host_id AND status IN ('ACCEPTED', 'REJECTED'));

CREATE POLICY "msg_select" ON messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND auth.uid() IN (c.user_a, c.user_b)
  ));
CREATE POLICY "msg_insert" ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND auth.uid() IN (c.user_a, c.user_b)
    )
  );

CREATE POLICY "rev_select" ON reviews FOR SELECT USING (true);
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
          (s.guest_id = auth.uid() AND s.host_id = reviews.reviewee_id)
          OR (s.host_id = auth.uid() AND s.guest_id = reviews.reviewee_id)
        )
    )
  );

-- A message linked to a request must stay inside that request's conversation.
CREATE OR REPLACE FUNCTION public.validate_message_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM stay_requests s
    WHERE s.id = NEW.request_id AND s.conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'Message request does not belong to this conversation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_message_request_trigger ON messages;
CREATE TRIGGER validate_message_request_trigger
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION public.validate_message_request();

-- Public locations deliberately exclude free-text notes. Existing notes may
-- contain exact parking directions or contact details.
DROP VIEW IF EXISTS host_locations_public;
CREATE VIEW host_locations_public
WITH (security_invoker = false) AS
SELECT
  id, user_id,
  round(location_lat::numeric, 2)::double precision AS location_lat,
  round(location_lng::numeric, 2)::double precision AS location_lng,
  location_city, location_country, parking, parkings, sleep_types, amenities,
  pricing, pricings, vehicle_types, max_guests, created_at
FROM host_locations;
GRANT SELECT ON host_locations_public TO anon, authenticated;

-- Notification events are one-shot. Edge functions use the service role.
CREATE TABLE IF NOT EXISTS request_notification_events (
  request_id uuid NOT NULL REFERENCES stay_requests(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('new_request', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, event)
);
ALTER TABLE request_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON request_notification_events FROM anon, authenticated;
