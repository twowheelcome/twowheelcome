-- HARDENING BATCH 1 — two fixes proven against the live DB.
-- Safe to re-run.

-- (1) CRITICAL: host_locations_public is a security_invoker=false view owned by
-- postgres, so writes through it run as postgres and BYPASS the base table's RLS.
-- anon + authenticated were granted INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
-- on it, which let an anonymous user UPDATE any host's listing (notes, city, parking,
-- max_guests, user_id, …) through the view. Proven live: anon UPDATE changed a row.
-- The view only ever needs to be READ (the public map). Lock it to SELECT.
-- Guarded: on a clean from-zero apply the view may not exist yet at this point (migrations
-- are applied in filename order); the canonical view + grants are re-asserted in the final
-- zzzz_canonical_reconcile migration, so skipping here is safe.
DO $$
BEGIN
  IF to_regclass('public.host_locations_public') IS NOT NULL THEN
    REVOKE ALL ON public.host_locations_public FROM anon, authenticated;
    GRANT SELECT ON public.host_locations_public TO anon, authenticated;
  END IF;
END $$;

-- (2) The rider's "Withdraw request" silently failed: sr_update only allowed the HOST
-- (auth.uid() = host_id). Allow the guest to withdraw their own still-pending request
-- (PENDING -> CANCELLED). The validate_stay_request_write trigger already enforces the
-- exact transition + actor, so this RLS change is defense-in-depth, not the only guard.
DROP POLICY IF EXISTS "sr_update" ON stay_requests;
CREATE POLICY "sr_update" ON stay_requests FOR UPDATE
  USING (
    status = 'PENDING' AND (auth.uid() = host_id OR auth.uid() = guest_id)
  )
  WITH CHECK (
    (auth.uid() = host_id  AND status = ANY (ARRAY['ACCEPTED','REJECTED']))
    OR (auth.uid() = guest_id AND status = 'CANCELLED')
  );
