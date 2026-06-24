-- profiles is world-readable (profiles_public_read = true), which exposed push_token to
-- anyone — an Expo push token alone lets a third party send push notifications to that
-- device via Expo's public API. Hide the column from anon/authenticated at the column
-- level. The edge functions read it with the service_role (unaffected).
--
-- Because column SELECT is revoked, a direct PostgREST upsert breaks (its ON CONFLICT
-- DO UPDATE references EXCLUDED.push_token, which needs column SELECT). So the client
-- now writes the token through a SECURITY DEFINER RPC instead, which pins auth.uid().
-- Safe to re-run.

REVOKE SELECT (push_token) ON public.profiles FROM anon, authenticated;

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
$function$;

REVOKE ALL ON FUNCTION public.set_push_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_push_token(text) TO authenticated;
