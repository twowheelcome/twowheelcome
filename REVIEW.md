# TWOWHEELCOME — Independent code/security audit (2026-06-28)

Report only — **nothing was changed**. Every finding below is for Petr to approve before any fix.
Findings were cross-checked against the live DB where possible (marked **verified naostro**); several
items flagged by automated passes turned out to be safe and are listed under "Verified safe" so they
don't get fixed needlessly.

Severity: **CRITICAL** (exploitable now) · **HIGH** · **MEDIUM** · **LOW**.

---

## 🔴 CRITICAL

### C1 — Anyone can delete ANY account, unauthenticated `delete_account_data` RPC
**Where:** `supabase/migrations/00000000000000_baseline.sql:373` (function) + its EXECUTE grant.
**Verified naostro:** with only the public **anon** key,
`POST /rest/v1/rpc/delete_account_data {"p_uid":"<uuid>"}` returns **HTTP 204** (success), not 401.
**Why:** the function is `EXECUTE`-able by `anon`, and its guard is
`IF auth.uid() IS NOT NULL AND auth.uid() <> p_uid THEN RAISE …`. For an anonymous caller
`auth.uid()` is **NULL**, so the guard never fires and the body runs — deleting that user's profile,
listings, requests, messages and reviews. A victim's UUID is public (it's in `/host/<id>` links and the
share-profile QR code), so this is a one-request account wipe of any user.
**Impact:** catastrophic, trivially exploitable, irreversible data loss for any/all users.
**Suggested fix (safe — the app never calls this RPC directly; the delete-account Edge Function uses the
service_role key, which keeps EXECUTE):**
```sql
REVOKE EXECUTE ON FUNCTION public.delete_account_data(uuid) FROM anon, authenticated;
-- and defense-in-depth inside the function:
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = '28000'; END IF;
```
**Recommendation:** apply this one first thing — it's a low-risk REVOKE that doesn't touch the working
delete flow.

---

## 🟠 HIGH

### H1 — Over-exposed EXECUTE on internal/helper functions
**Where:** baseline.sql — EXECUTE grants. **Verified naostro** (privilege check):
`handle_new_user` → EXECUTE for **anon + authenticated**; `set_push_token` → **anon + authenticated**;
`delete_account_data` → **anon** (see C1).
**Why:** `handle_new_user` is a trigger function and should never be client-callable; `set_push_token`
should be authenticated-only. Calling them directly is mostly degenerate (they lean on `auth.uid()`),
but they shouldn't be in the public RPC surface at all.
**Impact:** unnecessary attack surface; C1 is the concrete damage, the rest is hardening.
**Fix:** `REVOKE EXECUTE … FROM anon` on `handle_new_user` and `set_push_token`; keep `set_push_token`
for `authenticated` only. Audit all SECURITY DEFINER functions and grant EXECUTE narrowly.

### H2 — Email-sending Edge Functions have no rate limit (cost / spam)
**Where:** `supabase/functions/feedback/index.ts` (insert + Resend), `report/index.ts`, and the
`support_clicks` insert that feeds `support-digest`.
**Why:** any authenticated user can loop `feedback`/`report` and fire unlimited emails to
privacy@twowheelcome.com and unlimited DB rows — Resend quota burn + inbox flooding. (`create_knock`
and messages DO have rate limits; these don't.)
**Impact:** cost spike, inbox DoS.
**Fix:** per-user rate limit (e.g. feedback 1/min or 5/hr, report 5/day) — a small count check in the
function or a DB trigger like the message/knock limiter.

---

## 🟡 MEDIUM

### M1 — "Today" is computed in UTC, not the user's local day
**Where:** `src/app/(tabs)/requests.tsx:~176` (`isExpiredPending`), the `canRemoveConv` today calc, and
`src/app/history.tsx` (`todayStr`) — all use `new Date().toISOString().split('T')[0]`.
**Why:** `toISOString()` is UTC. West-of-UTC users in the evening already roll to "tomorrow", so a
pending knock for tonight can show **Expired** hours early (and the reverse east of UTC). This is the
same logic Petr just tightened to `arrival < today`, so the boundary correctness matters.
**Impact:** expiry/hide flips on the wrong calendar day near midnight, region-dependent.
**Fix:** a shared `getLocalYMD()` helper using local getFullYear/getMonth/getDate, used everywhere a
"today" string is compared to a stored date.

### M2 — Notification failures are silently swallowed
**Where:** `src/app/(tabs)/map.tsx:~441` and `src/app/(tabs)/requests.tsx:~1397,~1503` —
`supabase.functions.invoke('notify-request', …).catch(() => {})`.
**Why:** if the notify call fails (rate limit, auth, network) the other party never gets the
email/push and nobody sees an error. Knock/accept/cancel "succeed" but the counterpart is uninformed.
**Impact:** missed critical updates; hard to diagnose (no log).
**Fix:** at minimum `.catch(e => console.warn('notify failed', e))`; ideally a soft, non-blocking toast.

### M3 — Coordinate-scrub regex misses negative coordinates
**Where:** `strip_location_notes` / `strip_review_coords` in baseline.sql (~530, ~501) and the client
`stripContacts` (`become-host.tsx`) / review coord strip — pattern `[0-9]{1,3}\.[0-9]{3,}…`.
**Why:** no optional `-`, so a host/reviewer writing `-38.45, -145.12` (southern/western hemis) slips a
real coordinate pair past the backstop into public notes/reviews.
**Impact:** a determined user can publish exact coords in public text (defense-in-depth gap; the primary
approximate-area model is intact).
**Fix:** prefix `-?` to both numbers in every coordinate regex.

### M4 — `support-digest` / report tolerate deleted-user & unbounded inputs
**Where:** `supabase/functions/support-digest/index.ts:~70,~98` (no FK on `support_clicks.user_id`,
`undefined`/empty email can render into the dev email); `report/index.ts:~60` (`target_id` not
length/format-validated before DB insert + email).
**Why:** orphan `support_clicks` rows (no FK / not cleaned) produce "undefined"/blank rows in the
digest; an unbounded `target_id` can bloat the row/email.
**Impact:** low-grade data quality + minor abuse vector.
**Fix:** add FK `support_clicks.user_id → profiles(id) ON DELETE CASCADE` (and it's already deleted in
`delete_account_data`); default missing names to "Unknown"; cap/validate `target_id` (uuid/len).

### M5 — `select('*')` over-fetch on hot reads (also a perf item)
**Where:** `map.tsx:141` (`host_locations_public`), `profile.tsx:82`, `become-host.tsx:120`
(`host_locations`). Already noted in PERF.md (item E). Functional risk is low; payload/typing only.
**Fix:** enumerate needed columns (carefully, to not drop a used field).

---

## 🟢 LOW

- **L1 — Non-null assertions `m.request!`** at `requests.tsx:1392,1457,1493`. Not a crash (`{...null}`
  is `{}` in JS) but a type-safety smell; guard with `m.request ? … : m`.
- **L2 — `any` types** on hot state: `map.tsx:55` hosts `any[]`, `profile.tsx:19-20` user/profile `any`,
  realtime payloads `any` in `requests.tsx`. Define interfaces to catch schema drift.
- **L3 — `app.cascade` GUC** bypass of message rate-limit is **not reachable** from PostgREST clients
  (they can't run `SET`), so it's only a theoretical concern; the comment already explains the
  service_role-detection workaround. Leave, or migrate to a service_role-only check if revisited.
- **L4 — CORS fallback origin**: Edge functions fall back to `https://www.twowheelcome.com` for unknown
  origins. The browser still blocks the mismatch, so harmless; cleaner to omit the header.
- **L5 — Blocked hosts filtered client-side** (`map.tsx:~220`) — fine, since the public view carries no
  PII and exact coords are RLS-protected; brief pre-load visibility only.
- **L6 — Silent `.catch(() => {})`** in `pendingKnockStore.ts`, `i18n.tsx`, profile support link — log
  for debuggability.
- **L7 — 2-decimal public coords (~1.1 km)** in `host_locations_public`. This is the intended
  "approximate area" (Petr's product decision), not a bug — noted so it's a conscious choice. Drop to 1
  decimal (~11 km) only if Petr wants coarser.

---

## ✅ Verified safe (flagged by automated passes, but NOT a risk — do not "fix")

- **notify-request auth** (`notify-request/index.ts:82-110`): validates the JWT via
  `admin.auth.getUser(token)` (getUser verifies the token cryptographically regardless of which key made
  the client), enforces `callerCanNotify` (guest-only for new_request, host-only for accept/reject/
  cancel), checks the request status matches the event, and uses a unique constraint for one-shot
  idempotency. Solid.
- **sendCoordinates** (`requests.tsx`): host-only (`currentUser.id !== req.host_id` early-return),
  sends the **host's own** exact coords that the host chose to share. Not a leak.
- **Exact coords via base `host_locations`**: **verified naostro** — a foreigner authenticated SELECT
  returns `[]`. RLS `host_locations_owner_all USING (auth.uid()=user_id)` restricts the base table to
  the owner; the public discovery view rounds to 2 decimals. Privacy invariant holds.
- **anon table-level grants** on conversations/messages/etc.: RLS is enabled and row-restrictive, so
  anon (`auth.uid()` NULL) matches no rows. Least-privilege hygiene, not an exploitable hole.

---

## TL;DR — top 5 to act on

1. **C1 (CRITICAL, fix now):** `delete_account_data` is callable by **anon** and its auth guard is
   bypassed → anyone can delete any account with just a public UUID (verified: anon → HTTP 204).
   One-line `REVOKE EXECUTE … FROM anon, authenticated` + add the `auth.uid() IS NULL` raise.
2. **H1:** revoke EXECUTE on `handle_new_user` / `set_push_token` from anon — shrink the RPC surface.
3. **H2:** rate-limit the email Edge Functions (feedback/report) — cost & inbox-spam protection.
4. **M1:** UTC-vs-local "today" in expiry/hide — switch to a local-date helper so the day boundary is
   correct outside UTC.
5. **M2:** stop swallowing `notify-request` failures — log/surface them so missed notifications are
   visible.
