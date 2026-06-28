# TWOWHEELCOME — Independent code/security audit (2026-06-28)

Report only — **nothing was changed**. Every finding below is for Petr to approve before any fix.
Findings were cross-checked against the live DB where possible (marked **verified naostro**); several
items flagged by automated passes turned out to be safe and are listed under "Verified safe" so they
don't get fixed needlessly.

Severity: **CRITICAL** (exploitable now) · **HIGH** · **MEDIUM** · **LOW**.

---

## 🔴 CRITICAL

### C1 — ✅ FIXED (2026-06-28) — Anyone can delete ANY account, unauthenticated `delete_account_data` RPC
**Fix applied (live + baseline):** `REVOKE EXECUTE ON FUNCTION public.delete_account_data(uuid) FROM
anon, authenticated;` — now only the delete-account Edge Function (service_role) can run it. Kept the
`auth.uid() IS NOT NULL AND auth.uid() <> p_uid` guard as defense-in-depth. (Note: a plain
`auth.uid() IS NULL → RAISE` was tried and **reverted** — it broke the real delete flow, because the
Edge Function calls via service_role which has a NULL `auth.uid()`. The REVOKE is the correct primary
fix.)
**Verified naostro after fix:** anon RPC → **HTTP 401** (was 204); an authenticated user calling it for
another uuid → **403**; legitimate delete via the Edge Function → **`{"ok":true}` 200** and the profile
row is gone (`[]`). Privileges now: anon=false, authenticated=false, service_role=true.

<details><summary>Original report</summary>
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
</details>

---

## 🟠 HIGH

### H1 — ✅ FIXED (2026-06-28) — Over-exposed EXECUTE on internal/helper functions
**Applied (live + baseline):** `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` on the trigger/helper
SECURITY DEFINER funcs (`handle_new_user`, `cascade_on_accept`, `enforce_message_rate_limit`,
`validate_conversation_write/_message_request/_stay_request_write`); `set_push_token` authenticated-only.
**Verified naostro:** registration still auto-creates the profile (trigger fires regardless of EXECUTE);
`set_push_token` authenticated→204, anon→401.
**Where:** baseline.sql — EXECUTE grants. **Verified naostro** (privilege check):
`handle_new_user` → EXECUTE for **anon + authenticated**; `set_push_token` → **anon + authenticated**;
`delete_account_data` → **anon** (see C1).
**Why:** `handle_new_user` is a trigger function and should never be client-callable; `set_push_token`
should be authenticated-only. Calling them directly is mostly degenerate (they lean on `auth.uid()`),
but they shouldn't be in the public RPC surface at all.
**Impact:** unnecessary attack surface; C1 is the concrete damage, the rest is hardening.
**Fix:** `REVOKE EXECUTE … FROM anon` on `handle_new_user` and `set_push_token`; keep `set_push_token`
for `authenticated` only. Audit all SECURITY DEFINER functions and grant EXECUTE narrowly.

### H2 — ✅ FIXED (2026-06-28) — Email-sending Edge Functions have no rate limit (cost / spam)
**Applied (deployed):** per-user rolling rate limits — `feedback` 5/hour, `report` 5/day (count check
before insert, returns 429). **Verified naostro:** user at limit→429, fresh user→200.
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

### M1 — ✅ FIXED (2026-06-28) — "Today" is computed in UTC, not the user's local day
**Applied:** new `src/lib/date.ts → getLocalYMD()` (device-local date) replaces the UTC
`toISOString().split` in all day-vs-stored comparisons (isExpiredPending, hasStayEnded, canRemoveConv,
history todayStr, profile accepted-stay cutoff). Behaviour unchanged; boundary now flips at local
midnight. (Map date-picker defaults left as-is — input generation, not a comparison.)
**Where:** `src/app/(tabs)/requests.tsx:~176` (`isExpiredPending`), the `canRemoveConv` today calc, and
`src/app/history.tsx` (`todayStr`) — all use `new Date().toISOString().split('T')[0]`.
**Why:** `toISOString()` is UTC. West-of-UTC users in the evening already roll to "tomorrow", so a
pending knock for tonight can show **Expired** hours early (and the reverse east of UTC). This is the
same logic Petr just tightened to `arrival < today`, so the boundary correctness matters.
**Impact:** expiry/hide flips on the wrong calendar day near midnight, region-dependent.
**Fix:** a shared `getLocalYMD()` helper using local getFullYear/getMonth/getDate, used everywhere a
"today" string is compared to a stored date.

### M2 — ✅ FIXED (2026-06-28) — Notification failures are silently swallowed
**Applied:** the three `notify-request` `.catch(() => {})` now `console.warn` + show a non-blocking
Toast (new `toastStore` + `<Toast>` mounted in `_layout`); the action itself still completes.
**Where:** `src/app/(tabs)/map.tsx:~441` and `src/app/(tabs)/requests.tsx:~1397,~1503` —
`supabase.functions.invoke('notify-request', …).catch(() => {})`.
**Why:** if the notify call fails (rate limit, auth, network) the other party never gets the
email/push and nobody sees an error. Knock/accept/cancel "succeed" but the counterpart is uninformed.
**Impact:** missed critical updates; hard to diagnose (no log).
**Fix:** at minimum `.catch(e => console.warn('notify failed', e))`; ideally a soft, non-blocking toast.

### M3 — ✅ FIXED (2026-06-28) — Coordinate-scrub regex misses negative coordinates
**Applied (live + baseline + client):** added `-?` to both numbers in `strip_review_coords`,
`strip_location_notes`, and client `stripContacts`/`stripCoords`. Verified naostro: `-38.4, -145.1`
is now stripped.
**Where:** `strip_location_notes` / `strip_review_coords` in baseline.sql (~530, ~501) and the client
`stripContacts` (`become-host.tsx`) / review coord strip — pattern `[0-9]{1,3}\.[0-9]{3,}…`.
**Why:** no optional `-`, so a host/reviewer writing `-38.45, -145.12` (southern/western hemis) slips a
real coordinate pair past the backstop into public notes/reviews.
**Impact:** a determined user can publish exact coords in public text (defense-in-depth gap; the primary
approximate-area model is intact).
**Fix:** prefix `-?` to both numbers in every coordinate regex.

### M4 — ✅ FIXED (2026-06-28) — `support-digest` / report tolerate deleted-user & unbounded inputs
**Applied:** FK `support_clicks.user_id → profiles(id) ON DELETE CASCADE` (live + baseline, 0 orphans);
digest name defaults to "Unknown"; `report` now validates `target_id` is a UUID (else 400). Verified
naostro: non-uuid target → 400.
**Where:** `supabase/functions/support-digest/index.ts:~70,~98` (no FK on `support_clicks.user_id`,
`undefined`/empty email can render into the dev email); `report/index.ts:~60` (`target_id` not
length/format-validated before DB insert + email).
**Why:** orphan `support_clicks` rows (no FK / not cleaned) produce "undefined"/blank rows in the
digest; an unbounded `target_id` can bloat the row/email.
**Impact:** low-grade data quality + minor abuse vector.
**Fix:** add FK `support_clicks.user_id → profiles(id) ON DELETE CASCADE` (and it's already deleted in
`delete_account_data`); default missing names to "Unknown"; cap/validate `target_id` (uuid/len).

### M5 — 🟡 PARTIALLY APPLIED (2026-06-28) — `select('*')` over-fetch on hot reads
**Applied:** narrowed `profile.tsx` (→ `id, paused`) and `become-host.tsx` (→ the exact 17 fields the
editor maps). **Left on `*` by design:** `map.tsx` reads the curated `host_locations_public` view (no
PII, coords already rounded) and nearly every column feeds the markers/sheet/cards — narrowing risks
silently dropping a field for marginal gain, so per the "leave if unsure" rule it stays.
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

1. **C1 — ✅ FIXED (2026-06-28):** `delete_account_data` was callable by **anon** with its auth guard
   bypassed → anyone could delete any account with a public UUID. Fixed by REVOKE EXECUTE from
   anon/authenticated (verified: anon RPC 204→401, cross-user 403, legit Edge-Function delete still
   200 + row gone).
2. **H1 — ✅ fixed:** EXECUTE revoked from anon on trigger/helper funcs; set_push_token authenticated-only.
3. **H2 — ✅ fixed:** feedback 5/hr, report 5/day rate limits (verified 429 at limit, 200 fresh).
4. **M1 — ✅ fixed:** `getLocalYMD()` local-day helper across expiry/hide/ended comparisons.
5. **M2 — ✅ fixed:** notify-request failures now logged + non-blocking Toast.

**Also fixed 2026-06-28:** M3 (negative-coord scrub), M4 (support_clicks FK + report target_id UUID
validation + digest "Unknown"). **Partial:** M5 (narrowed profile/become-host selects; map left on `*`
by design). **Still open (LOW):** L1–L7 — non-null asserts, `any` types, CORS fallback, silent
AsyncStorage catches, 2-decimal public coords (by design). None exploitable.
