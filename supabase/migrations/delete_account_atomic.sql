-- Atomic account-data deletion. The delete-account edge function previously ran ~8
-- separate service-role statements; a failure midway left a half-deleted account
-- (e.g. reviews gone but stay_requests/profile still there). This wraps the whole DB
-- cleanup in ONE transaction (all-or-nothing). Storage removal and auth.users deletion
-- stay in the edge function (they are external API calls, not DB rows).
--
-- Order respects the FK graph: reviews before stay_requests (reviews.stay_request_id is
-- NO ACTION); messages.request_id is SET NULL so the other party's messages survive;
-- deleting profiles cascades bikes, host_profiles and any remaining stay_requests.
-- SECURITY DEFINER so it can clean across the two participants' rows (bypassing RLS),
-- but it pins the target: a logged-in caller may only delete THEMSELVES; the edge
-- function calls it with the service role (auth.uid() is null) for a user it already
-- authenticated. Safe to re-run.

CREATE OR REPLACE FUNCTION public.delete_account_data(p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

-- Only the service role may run this — the delete-account edge function calls it with
-- the admin client after it has authenticated the user. (validate_conversation_write
-- bypasses its immutability check only for service_role, which the anonymization step
-- below relies on.) Not granted to authenticated to keep the calling model explicit.
REVOKE ALL ON FUNCTION public.delete_account_data(uuid) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid) TO service_role;
