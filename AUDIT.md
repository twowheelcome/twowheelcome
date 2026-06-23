# TWOWHEELCOME — Audit (2026-06-19)

Deep pass while Petr is away. Rule followed: **only fixed unambiguous issues verifiable
without his manual/visual testing** (logic, RLS/DB, security, error handling, dead code).
Risky refactors and visual/product changes are **proposed, not applied**.

Method: 4 parallel code-review agents (auth/account, chat/requests, map/become-host,
edge functions/migrations) + live verification against the production DB via the
Supabase access token (anon vs. service role) + a chat realtime regression test.

Legend — **Fixed** = done & verified this pass · **Propose** = needs Petr's eye/testing
or a product decision.

---

## 1) Bugs found (most serious first)

### 🔴 SECURITY

| # | Issue | Impact | Status |
|---|---|---|---|
| S1 | **`host_profiles` table had RLS OFF + full anon grants** (legacy, unused) | Any anonymous client could **read a host's EXACT GPS + notes** (and write/delete). Verified live: anon read 1 row with full-precision coordinates. | **Fixed** — `lockdown_legacy_tables.sql` revokes grants + enables RLS on `host_profiles` and `bikes`; applied + verified anon now denied. |
| S2 | **`notify-review` cron silently failing** | The daily review-reminder cron sends only `x-cron-secret` (no JWT) but the function had `verify_jwt=true`, so the platform rejected every call → reminders never sent. | **Fixed** — redeployed `notify-review` with `--no-verify-jwt`; the function's own `CRON_SECRET` check is the gate (verified it 401s without the secret). |
| S3 | `request-photos` storage bucket allowed **anonymous enumeration** | Verified: any anon client could **list and download every bike photo** in the bucket (the public SELECT policy covered both buckets), not just guess a random URL. | **Fixed** — `restrict_request_photos_listing.sql` drops request-photos from the public SELECT (list) policy (avatars stay listable). Verified live: anon can no longer list request-photos, and the chat's public object URL still serves (200) — image display unaffected. *(Residual: a photo is still downloadable if you know its exact unguessable path; full private-bucket + signed URLs remains a larger propose.)* |
| S4 | Edge functions use **CORS `*`** | Baseline says no wildcard in prod. Practical risk low — auth is Bearer-token, not cookies, so a hostile origin can't ride a user's credentials. | **Propose (left as-is).** Whitelisting is risky to change blind: the app is called from multiple origins (apex + www + any preview deploy) and a too-narrow list would break `functions.invoke`. Needs the real origin list. |
| S5 | No **rate limiting** on edge functions; no server-side length cap on review text | Abuse/spam surface. Idempotency table already caps repeat notifications. | **Partially fixed.** Added a DB length cap on review body (defense-in-depth vs the client's 500-char limit). Rate limiting needs a design decision (left as propose). |

**Verified SAFE (no leak):** anon cannot read `stay_requests`, `messages`, `conversations`,
`conversation_reads`, raw `host_locations` (exact GPS), `profiles.push_token`, or the
private `location_name`. `host_locations_public` exposes only rounded coords + the
intended public columns (incl. `notes`, excl. `location_name`). Reviews are public by
design. RLS policies are correctly `auth.uid()`-scoped. notify-request authorization
(guest/host + status checks), HTML-escaping in emails, and the `handle_new_user` trigger
are all correct.

### 🔴 CRITICAL (correctness)

| # | Issue | Impact | Status |
|---|---|---|---|
| C1 | **Chat: a rapid 2nd inbound message dropped the 1st from the open thread.** `requests.tsx` — the realtime append used a single `incomingMsg` state slot consumed by an effect keyed on `[incomingMsg, selected]`; when message B arrived while message A's enrichment fetch was still in flight, the effect cleanup set `cancelled=true` for A, discarding its append. The list preview still updated, so the row showed B while the thread body silently lost A (A stayed in the DB, reappearing on reopen). | Intermittent silent message loss when two messages arrived within ~100–300 ms. | **Fixed & verified.** Each realtime INSERT is now appended independently in the channel handler (no single-slot, no cancel), guarded by `selectedConvIdRef`; `mergeMessage()` de-dupes by id and keeps `created_at` order via a functional updater. Verified live with two clients sending two back-to-back messages → both land in order; single-message + accept/reject regression still pass. |
| C2 | **Stay-request flow wasn't transactional.** `map.tsx` inserted `conversations`, then `stay_requests`, then `messages` as separate calls; a failure between them left an orphan empty conversation or a request with no chat body (and the success toast could still show). | Orphan empty threads; a request landing with no message; hidden failures. | **Fixed & verified.** New SECURITY DEFINER RPC `create_knock` does all three in one transaction (all-or-nothing), pins `guest_id` to `auth.uid()`, re-checks host/location ownership, and lets the triggers + exclusion constraint roll the whole thing back on overlap. Client now calls the RPC. Verified live: success creates all three atomically; an overlapping knock is blocked (23P01) leaving **nothing** behind; self/foreign-host rejected; zero orphan conversations. (No orphans existed to clean.) |

### 🟠 HIGH

| # | Issue | Status |
|---|---|---|
| H1 | `respondToRequest` (accept/decline) showed **nothing on failure** and, if the status update succeeded but the auto-message insert failed, injected a **local-only** `local-…` message the guest never received. | **Fixed.** A failed status update now shows a dismissable error banner; only the real persisted auto-message is appended (the status change already shows via the request card + realtime update). Regression (accept/reject) still passes. |
| H2 | `reset-password.tsx` accepts **any active session** as a recovery link; native token exchange isn't handled (`detectSessionInUrl` is web-only). | **Re-assessed + hardened.** Not a security hole: `updateUser({password})` is scoped to the caller's own session, so a logged-in user changing their own password has no cross-account risk. Tightening the gate to recovery-event-only is race-prone (PASSWORD_RECOVERY can fire before the screen subscribes) and could break the real email-reset flow (untestable here), so the gate is left as-is. **Safe hardening done:** track the recovery event and, when the reset came via the email link, sign the recovery session out after the update and route to login. |
| H3 | `openConv` had **no guard against overlapping opens** (two fast taps / a deep-link mid-open) → a slower fetch could drop conv X's messages into conv Y. | **Fixed.** openConv now bails before each setState if `selectedConvIdRef` no longer matches the conversation it was opening (or the user changed). |
| H4 | Bottom-sheet "knock" status is **per-location**, but the DB only blocks **overlapping dates**. A rider with one pending/future stay at a host can never knock for a *different, non-overlapping* date there (the knock button is replaced by the status card for the whole location). | **Propose** (product decision: is one-active-request-per-location intended?). |

### 🟡 MEDIUM

| # | Issue | Status |
|---|---|---|
| M1 | **Double-tap could insert duplicates** on `sendCoordinates` (two identical exact-point pins) and `submitReview`. | **Fixed** — added ref guards mirroring the existing send-message/accept-decline guards. |
| M2 | `profile.tsx` profile load used `.single()` → raised a spurious error when the profile row was missing. | **Fixed** — `.maybeSingle()`. |
| M3 | A user message starting with `"Accepted."` was rendered as the **system "Request accepted" card**, hiding the user's text. | **Fixed** — `isAcceptedAutoMessage` now matches only the exact system bodies. |
| M4 | **Push token not registered on in-session login** (only at cold start). | **Fixed** — also register on `SIGNED_IN`. |
| M5 | `extractCoords` over-matched any "number, number" in normal chat (e.g. "see you at 8, 30 min") → a spurious **"Open navigation"** button. | **Fixed** — requires a decimal part on both numbers (real coords always have one). Verified against a case set; the exact-meeting-point format still parses. |
| M6 | **Date defaults use UTC** (`toISOString().split('T')[0]`) → off-by-one calendar day for negative-UTC timezones near midnight. | **Assessed → deferred (not safe to change blind).** The *whole* system is UTC-consistent — the `validate_stay_request_write` trigger requires `arrival_date >= (now() AT TIME ZONE 'utc')::date`, and the cron, `hasStayEnded`, and review RLS all use UTC. Switching only the client to local dates would *desync from the trigger* and make a UTC-evening user's local "today" get rejected. A correct fix is timezone-aware end-to-end and needs testing across zones — left for Petr. |
| M7 | `sendCoordinates` did **nothing visible** if the location had no coords (host taps, brief spinner, no pin, no error); `lat && lng` truthiness also treated coordinate `0` as missing. | **Fixed** — `!= null` guard (handles a real `0` coordinate) and an explicit error banner when the place has no pin. |
| M8 | `markRead` / `submitReview` / avatar+name+bike saves **swallow DB errors** with no user feedback (shared `avatarError` state mislabels name/bike failures as avatar errors). | **Propose** (UX/error surfacing; needs placement decisions). |
| M9 | become-host **save isn't transactional** (delete-removed-locations then upsert are separate calls; a failure between them loses removed rows and doesn't save edits). | **Propose** (RPC/transaction; needs testing). |

### 🟢 LOW / notes
- Nominatim reverse-geocode/search has **no User-Agent and no rate-limit** (usage-policy risk; failures silently blank city/country). *Propose.*
- Notification deep-link does `router.push(data.url)` with an **unvalidated URL**. *Propose: whitelist route prefixes.*
- `handleRegister` profile upsert error swallowed (now backstopped by the `handle_new_user` trigger). *Low.*
- `host/[id].tsx` shows only the host's **first** location when no location param (multi-location hosts). *Likely intended; confirm.*
- Edge functions use `any` types (project rule). HostMap "you" marker not cleaned up on re-locate. Photo upload is web-only. Migrations are **filename-ordered (no timestamps)** and the SQL source is not cleanly re-runnable from scratch (the `notes`-in-view intent conflicts between `security_location_conversations.sql` and `public_location_description.sql`; live DB is correct, source is not). *Propose: clean up before any fresh deploy.*

---

## 2) Prioritized improvement suggestions (benefit / effort)

1. ~~Fix C1 (message drop)~~ — **done** (see §1). Petr to click-confirm: two rapid messages between two accounts both appear in the open thread without reopening.
2. **Transactional RPCs** — knock is **done** (`create_knock`, C2). Still worth the same treatment for **delete-account** (partial/orphaned deletes) and **save-listings** (M9, partial saves). *high / medium.*
3. **reset-password hardening (H2)** — *high / medium.* Verify the session is a real recovery session; handle native deep-link token exchange.
4. **Surface errors instead of swallowing** (H1, M7, M8) + split avatar/name/bike error states — *medium / low.*
5. **Decide knock-per-location vs per-date (H4)** and **guest-cancel of a pending request** (RLS currently host-only despite a comment saying guests can cancel) — *medium / low, product.*
6. **request-photos privacy (S3)** + **CORS whitelist (S4)** + **rate limiting / review length cap (S5)** — *medium / medium.*
7. **Timezone-correct dates (M6)** and **tighten `extractCoords` (M5)** — *medium / low.*
8. **Nominatim User-Agent + light debounce**; **notification-URL whitelist**; **clean up legacy tables/migrations** — *low / low.*
9. **Drop fully** the now-locked legacy `host_profiles`/`bikes` once confirmed unneeded — *low / low.*

---

## 3) What Petr must manually test on return (two accounts)

1. **Chat back-to-back messages (C1):** have B send two messages quickly while A has the chat open — confirm both appear. (This is the #1 known bug; fix before relying on it.)
2. **Knock flow end-to-end:** knock → host gets the request **with the message body**; accept/reject updates live; no empty/orphan conversations appear.
3. **Reset password:** request a reset email, follow the link, set a new password, log in. Also confirm an already-logged-in user opening `/reset-password` behaves sanely.
4. **Push notifications:** new request / accept / reject emails+push actually arrive (SMTP/Resend + Expo). The **daily review reminder** at 10:00 UTC should now fire (was broken) — confirm it sends.
5. **Account deletion** with a throwaway account (non-transactional — watch for half-deleted state).
6. **Listings:** create/edit multiple locations incl. the fullscreen map editor, `location_name` (private), and the public "Description for riders" showing on the host detail.
7. **Timezone:** test date defaults in the evening if in a negative-UTC zone.

---

### Post-audit fixes (Petr's follow-ups)
- **Per-stay reviews (new).** Repeat stays in the same (per-location) conversation didn't
  each get a review prompt — the chat tracked a single review slot. The DB
  (`unique(stay_request_id, reviewer_id)`) and the daily reminder cron were already
  per-stay; the chat now lists every completed stay with its own prompt → "you rated … ·
  dates" bubble. **Fixed & verified** live (two stays → two independent reviews, duplicate
  blocked, host/guest independent, anon blocked).

*Fixed & verified: C1, C2, per-stay reviews, H1, H3, M5, M7, S1, S2, S3, S5 (cap). Hardened: H2.
Assessed & deferred (not safe to change blind / product calls): M6 (timezone — system-wide UTC),
S4 (CORS — origin list), H4 (knock per-location vs per-date), M8 (error-surfacing UI),
M9 + delete-account (transactional RPCs). Remaining "Propose" items await Petr's call.*

### Still open for Petr (no code changed — needs his decision/testing)
- **H4** — is one active request *per location* intended, or should a rider be able to knock for a different, non-overlapping date at the same host? (UI blocks per-location; DB blocks per-overlap.)
- **M9 / delete-account** — wrap become-host save and account deletion in transactional RPCs (like `create_knock`).
- **M6** — timezone-correct dates end-to-end (client + trigger + cron + RLS).
- **S4 / rate-limiting** — CORS origin whitelist and edge-function throttling.
- **M8** — split the shared avatar/name/bike error state and surface save failures.
