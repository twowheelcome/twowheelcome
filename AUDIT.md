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
| S3 | `request-photos` storage bucket is **public** | Bike photos sent in a knock are readable by anyone with the (random) URL. Avatars public is fine; request-photos is more sensitive. | **Propose** — switching to a private bucket + signed URLs is a non-trivial change to image loading (chat uses `getPublicUrl`); needs Petr's call. |
| S4 | Edge functions use **CORS `*`** | Baseline says no wildcard in prod. Practical risk low (Bearer-token auth, not cookies). | **Propose** — whitelist the prod origin; risky to change blind (could break the web app's function calls from preview origins). |
| S5 | No **rate limiting** on edge functions / no length cap on review text server-side | Abuse / spam surface. Idempotency table caps repeat notifications. | **Propose** — add basic throttling + a server-side length check on review body. |

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
| C1 | **Chat: a rapid 2nd inbound message can drop the 1st from the open thread.** `requests.tsx` — the realtime append uses a single `incomingMsg` state slot; when message B arrives while message A's enrichment fetch is still in flight, the effect cleanup cancels A's append. The conversation-list preview still updates, so the row shows B while the thread body silently lost A. (A is in the DB and reappears on reopening the chat.) | Intermittent silent message loss in the core feature when two messages arrive within ~100–300 ms. | **Propose (do NOT blind-fix).** This is in the most sensitive realtime path that has regressed before; the fix (append optimistically from the raw payload via `selectedConvIdRef`, then enrich — or drain a queue instead of a single slot) needs Petr's two-account testing. Recommended fix detailed in §2. |
| C2 | **Stay-request flow isn't transactional.** `map.tsx` inserts `conversations`, then `stay_requests`, then `messages` as separate calls. If the request insert fails (non-duplicate reason) an **orphan empty conversation** is left; if the first-message insert fails it's **swallowed** (no error check) and the host gets a request with no chat body, yet the guest sees a success toast. | Orphan empty threads; a request can land with no message; failures hidden. | **Propose.** Proper fix = a Postgres RPC (`create_knock`) doing all three in one transaction. Needs DB work + testing. |

### 🟠 HIGH

| # | Issue | Status |
|---|---|---|
| H1 | `respondToRequest` (accept/decline) shows **nothing on failure** and, if the status update succeeds but the auto-message insert fails, falls back to a **local-only** message (`local-…`) the guest never receives. (`requests.tsx`) | **Propose** (surfacing the error is easy; the local-fallback semantics need a product call). |
| H2 | `reset-password.tsx` accepts **any active session** as proof of a valid recovery link, and native deep-link token exchange isn't handled (`detectSessionInUrl` is web-only). A logged-in user opening `/reset-password` is shown the change-password form regardless of a valid recovery token. | **Propose** (security-sensitive; needs careful testing of the recovery-session vs normal-session distinction). |
| H3 | `openConv` has **no guard against overlapping opens** (two fast taps, or a deep-link firing mid-open). The later-resolving fetch wins `setMessages`, so messages from conv X can land while conv Y is selected. | **Propose** (mechanical guard: capture convId, bail if `selectedConvIdRef.current !== convId` before each `setMessages`; should be tested). |
| H4 | Bottom-sheet "knock" status is **per-location**, but the DB only blocks **overlapping dates**. A rider with one pending/future stay at a host can never knock for a *different, non-overlapping* date there (the knock button is replaced by the status card for the whole location). | **Propose** (product decision: is one-active-request-per-location intended?). |

### 🟡 MEDIUM

| # | Issue | Status |
|---|---|---|
| M1 | **Double-tap could insert duplicates** on `sendCoordinates` (two identical exact-point pins) and `submitReview`. | **Fixed** — added ref guards mirroring the existing send-message/accept-decline guards. |
| M2 | `profile.tsx` profile load used `.single()` → raised a spurious error when the profile row was missing. | **Fixed** — `.maybeSingle()`. |
| M3 | A user message starting with `"Accepted."` was rendered as the **system "Request accepted" card**, hiding the user's text. | **Fixed** — `isAcceptedAutoMessage` now matches only the exact system bodies. |
| M4 | **Push token not registered on in-session login** (only at cold start). | **Fixed** — also register on `SIGNED_IN`. |
| M5 | `extractCoords` over-matches any "number, number" in normal chat (e.g. "see you at 8, 30 min") → a spurious **"Open navigation"** button that could route a rider to the wrong place. | **Propose** (tighten to coordinate-context only; changing it risks dropping legitimate pasted-coords nav — needs a quick visual check). |
| M6 | **Date defaults use UTC** (`toISOString().split('T')[0]`) in `map.tsx`/`loadMyRequests` → off-by-one calendar day for negative-UTC timezones around midnight ("Tonight" → wrong day; date-input min can block a valid "today"). | **Propose** (date logic; should be tested across timezones). |
| M7 | `sendCoordinates` does **nothing visible** if the location row/coords are missing (host taps, brief spinner, no pin sent, no error); also `lat && lng` truthiness treats coordinate `0` as missing. | **Propose** (add a user error + `!= null` guard; low risk but worth a glance). |
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

1. **Fix C1 (message drop)** — *high / medium.* Append the incoming message immediately from the realtime payload using `selectedConvIdRef.current` (no shared single-slot cancel), then enrich (sender name / request join) in a follow-up `setMessages` patch. Dedup by id. Test with two accounts sending back-to-back messages.
2. **Transactional knock + delete-account + save-listings via Postgres RPCs** — *high / medium.* Removes orphan conversations (C2), partial deletes, and partial saves (M9). One `SECURITY DEFINER` function each, wrapped in a transaction.
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

*Fixed this pass (all verified, committed): S1, S2, M1, M2, M3, M4. Everything under
"Propose" was intentionally left for Petr's review per the no-blind-risky-changes rule.*
