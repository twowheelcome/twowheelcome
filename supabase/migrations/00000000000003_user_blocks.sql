-- User blocking (post-contact safety, user-vs-user, no moderation).
--
-- A user may block another; once a block exists in EITHER direction between two people
-- they can no longer knock (create a stay request) or message each other. The blocker
-- can unblock at any time. Enforcement is at the DB level so it can't be bypassed by a
-- crafted client: the block check lives in the existing SECURITY DEFINER trigger
-- functions that already guard stay_request and message writes.

CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- A user manages and sees ONLY their own blocks (as the blocker). The blocked person is
-- never told who blocked them; the hard gates below enforce the effect regardless.
DROP POLICY IF EXISTS "blocks_select" ON public.blocks;
CREATE POLICY "blocks_select" ON public.blocks FOR SELECT TO public USING (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocks_insert" ON public.blocks;
CREATE POLICY "blocks_insert" ON public.blocks FOR INSERT TO public WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocks_delete" ON public.blocks;
CREATE POLICY "blocks_delete" ON public.blocks FOR DELETE TO public USING (auth.uid() = blocker_id);

GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT SELECT, INSERT, DELETE, UPDATE, REFERENCES, TRIGGER, TRUNCATE ON public.blocks TO service_role;

-- ── Knock gate: block check added to the stay_request write validator ───────────
-- (Full redefinition layered on the host-cancel version so the ACCEPTED->CANCELLED
--  transition stays intact; the only addition is the block check in the INSERT branch.)
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
    -- Block: no knock if either side has blocked the other.
    IF EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = NEW.guest_id AND blocked_id = NEW.host_id)
         OR (blocker_id = NEW.host_id AND blocked_id = NEW.guest_id)
    ) THEN
      RAISE EXCEPTION 'You can no longer send a request to this host.';
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

-- ── Message gate: block check added to the message write validator ──────────────
CREATE OR REPLACE FUNCTION public.validate_message_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_other uuid;
BEGIN
  IF NEW.request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM stay_requests s
    WHERE s.id = NEW.request_id AND s.conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'Message request does not belong to this conversation';
  END IF;
  -- Block: no messaging if either side has blocked the other.
  SELECT CASE WHEN c.user_a = NEW.sender_id THEN c.user_b ELSE c.user_a END
    INTO v_other FROM conversations c WHERE c.id = NEW.conversation_id;
  IF v_other IS NOT NULL AND EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = NEW.sender_id AND blocked_id = v_other)
       OR (blocker_id = v_other AND blocked_id = NEW.sender_id)
  ) THEN
    RAISE EXCEPTION 'You can no longer message this person.';
  END IF;
  RETURN NEW;
END;
$function$
;
