-- #1 Lock down stay_requests: only the two participants (guest + host of the
-- request) may read or change a request. Closes the leak where anyone could
-- read every stay request (including the private knock messages) via the API.
--
-- Safe to re-run: enabling RLS is idempotent and policies are dropped first.
-- notify-request / notify-review / delete-account edge functions use the
-- service role and bypass RLS, so notifications keep working.

ALTER TABLE stay_requests ENABLE ROW LEVEL SECURITY;

-- READ: only the guest or the host of the request.
DROP POLICY IF EXISTS "sr_select" ON stay_requests;
CREATE POLICY "sr_select" ON stay_requests FOR SELECT
  USING (auth.uid() = guest_id OR auth.uid() = host_id);

-- INSERT: a rider may only create a request as themselves (the guest).
DROP POLICY IF EXISTS "sr_insert" ON stay_requests;
CREATE POLICY "sr_insert" ON stay_requests FOR INSERT
  WITH CHECK (auth.uid() = guest_id);

-- UPDATE: either participant may update (host accepts/rejects; guest may cancel).
DROP POLICY IF EXISTS "sr_update" ON stay_requests;
CREATE POLICY "sr_update" ON stay_requests FOR UPDATE
  USING (auth.uid() = guest_id OR auth.uid() = host_id)
  WITH CHECK (auth.uid() = guest_id OR auth.uid() = host_id);
