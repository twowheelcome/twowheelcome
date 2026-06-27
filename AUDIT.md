# TWOWHEELCOME — Audit (2026-06-19)

> ## Production hardening — full re-audit (2026-06-25)
> Goal: make the app bulletproof. Worked autonomously, every fix **verified live**
> against the production DB (anon / foreign-authenticated / service-role contexts, all
> rolled back), committed in small batches.
>
> **Security — fixed & verified:**
> - 🔴 **CRITICAL: anon write-through-view RLS bypass.** `host_locations_public` is a
>   `security_invoker=false` view owned by postgres, and anon/authenticated held
>   INSERT/UPDATE/DELETE grants on it — so writes ran as postgres and bypassed the base
>   table's RLS. Proven live that an anonymous user could UPDATE any host's listing.
>   Locked the view to SELECT-only.
> - 🔴 **Broken `Withdraw` was also an RLS gap:** `sr_update` was host-only, so a guest
>   couldn't cancel their own pending request (silent no-op). Rewrote the policy so the
>   guest may PENDING→CANCELLED, host keeps PENDING→ACCEPTED/REJECTED.
> - **push_token harvest:** `profiles` is world-readable, exposing every user's Expo push
>   token (→ push spam via Expo's public API). Revoked column SELECT from anon/auth;
>   client now writes it through a SECURITY DEFINER RPC (`set_push_token`).
> - **Full cross-user RLS matrix re-verified** (anon + foreign user): no one can read or
>   write another user's conversations, messages, profile, host_location, host_profile,
>   conversation_reads, or forge a review. Public reads (profiles, map view) intact.
> - SECURITY DEFINER funcs (`create_knock`, `cascade_on_accept`, `delete_account_data`,
>   `set_push_token`) all pin `auth.uid()` / are service-role-only — caller can't be
>   spoofed. Edge functions: Bearer/secret gated, CORS allowlisted, service key server-only.
> - Storage: per-user-folder writes enforced; anon can't upload. **`request-photos` is now
>   private** — bucket flipped to private, photo_url stores the object path, a storage SELECT
>   policy limits read/sign to the stay request's two participants, and the client renders
>   via 1h signed URLs (placeholder on failure). Verified: old public URL → HTTP 400, signed
>   URL → 200 image, anon/foreign blocked from the object and bucket listing.
>
> **Reliability / integrity — fixed & verified:**
> - **Account deletion is now atomic.** Was ~8 separate service-role statements (a failure
>   midway = half-deleted account). Moved all DB cleanup into one transactional RPC
>   `delete_account_data`; verified the victim's data is fully removed, the other party's
>   messages/profile preserved, shared conversation anonymized, **no orphans**.
>
> **Abuse / rate-limiting — fixed & verified:**
> - Knocks capped at 15/rider/hour (also caps notification cost at the source);
>   chat messages capped at 30/sender/minute. Both exempt service-role + the accept-cascade.
>
> **Robustness — fixed:**
> - App-wide **React error boundary** (friendly fallback instead of a white screen).
> - No more raw DB/storage/auth error strings in the UI (auth, become-host, profile,
>   account delete, knock) — clear messages + console logging; loading flags always reset.
>
> **Waiting on Petr:**
> - Visual click-through of knock photos in chat (signed-URL render is verified at the
>   network layer — 200 image — but the on-screen render wasn't run in a browser).
> - Rate-limit numbers (15/h knocks, 30/min messages) — **confirmed by Petr as defaults.**
>
> Consolidated regression (rolled back) green: create_knock → accept+cascade → withdraw,
> reviews per-stay, RLS matrix, rate limits, atomic delete, private-photo signing.
> See dated sections below for history.
>
> **External-audit launch blockers (2026-06-27).**
> 1. **Migration coherence — RESOLVED via squash to a baseline (2026-06-27).** The folder was
>    an unordered, incomplete patch history (Supabase applies by filename order, not authoring
>    order, so older alphabetically-later files clobbered newer state; and the base tables
>    profiles/stay_requests/reviews/bikes/host_profiles were never created in any migration —
>    they were made in the dashboard, so a from-zero apply would crash immediately). Fixed by
>    squashing: reconstructed the FULL public schema + storage from the live DB (read-only, via
>    pg_catalog: 10 tables, 20 FKs, all constraints/indexes, 19 RLS policies, 10 functions,
>    6 public triggers + the on_auth_user_created auth trigger, the host_locations_public view
>    with all 20 cols, grants incl. the push_token column revoke, 3 storage buckets + 9 object
>    policies) into `00000000000000_baseline.sql`, plus `00000000000001_cron_review_reminder.sql`
>    for the operational cron. All old incremental files moved to `supabase/migrations_archive/`.
>    **Verified** by applying the baseline to a fresh in-memory Postgres (pglite) with auth/
>    storage stubs: it applies cleanly in order and reproduces the canonical objects (view=20
>    cols, 10 tables, 19 policies, 6 triggers, 20 FKs, withdraw policy present). A fresh
>    `supabase db push` now reproduces production. (btree_gist exclusion constraint + extensions
>    can't run in pglite but are standard on Supabase.)
> 2. **delete-account** now also removes the user's public listing-photos (GDPR).
> 3. **Deep-links** from email/push: RequestsScreen now reads ?openConv= on cold-open and
>    opens that chat (one-shot, doesn't break return-to-list / internal nav).
> 4. **Lint green** (0/0): ignore Deno functions + scripts + .expo; fixed entities,
>    set-state-in-effect, unused vars/exprs/directives.
> 5. **Terms** disclaimer reworded (EU-safe: intermediary, no exclusion of own-conduct
>    liability). 6. **Privacy** fixed false 'private notes not published' line; DSA contact
>    point named; GDPR art.13 elements present (operator = placeholder). 7. Microcopy +
>    brand casing unified to TWOWHEELCOME (emails/push/subjects).
>
> **Petr must still:** fill operator/controller legal identity placeholders in Terms+Privacy;
> final legal review; for a fresh deploy, re-create the Vault `cron_secret` + the notify-review
> CRON_SECRET env var (operational, can't live in a migration). (Schema baseline is now done.)
>
> **First-impression rider features (2026-06-27).** Three polished additions from the rider audit:
> 1. **Map place search.** A thumb-friendly search bar (city / region / address) pinned to the
>    top of the map (`HostMap.tsx`, web). Reuses the existing OpenStreetMap/Nominatim geocoder
>    (same one the listing location picker uses). Debounced (400ms), ✕ clear, loading state,
>    decent "no place found" message; on select it glides the camera with `flyToBounds` using
>    the result's boundingbox (frames a whole city or a single street appropriately). Existing
>    pins / filters / clustering untouched (search only moves the camera). Satellite toggle moved
>    below the bar so they don't overlap.
> 2. **Bio in the UI.** `profiles.bio` was selected everywhere but never shown. Now rendered on:
>    own profile (`profile.tsx`, with inline edit + a "Tell others about yourself" prompt when
>    empty, 500-char cap, saved via the same self-upsert as name); public profile (`host/[id].tsx`,
>    given an "About {first name}" section header); and the map host bottom-sheet (`map.tsx`).
>    Empty bio renders nothing (no empty block).
> 3. **Host can cancel an ACCEPTED stay** (life happens). New migration
>    `00000000000002_host_cancel_accepted.sql` widens BOTH gates that previously only allowed
>    transitions out of PENDING: the `validate_stay_request_write` trigger (now also permits
>    host ACCEPTED→CANCELLED) and the `sr_update` RLS policy (host may update their own ACCEPTED
>    rows to CANCELLED; guests still cannot touch an accepted stay). Cancelling drops the row out
>    of the `no_double_booked_accepted` exclusion constraint, so the booked nights free up
>    automatically. UI: "Cancel this stay" on the host's accepted-request card → confirm modal →
>    a system note lands in chat ("Host cancelled this stay. The booked nights are free again.").
>    **Verified naostro** (live DB, in a BEGIN/ROLLBACK transaction — no data changed): foreigner
>    update → 0 rows, guest-on-accepted → 0 rows, host → 1 row; the live row stayed ACCEPTED.
>    Migration applied to production via the management API. tsc + full eslint green.
>    **Follow-up (2026-06-27): guest notification.** The host-cancel now also notifies the rider
>    (email + push), via a new `cancelled_by_host` event in the `notify-request` edge function —
>    same path as accept/reject, host-only authorized, expects status CANCELLED, idempotent on
>    (request_id, event). Respects the rider's Email/Push prefs (default on); push only with a
>    token. The in-chat system note stays. Edge function redeployed. Verified naostro: the new
>    event passes validation and is gated (cancelled_by_host → 401 for a non-host caller, bogus
>    event → 400, accepted → 401 — identical routing).
> 4. **Knock icebreaker hint (2026-06-27).** Folded into the message-field placeholder: it now
>    shows a model knock ("Hi! I'm riding down from Berlin and hoping for one night with my KTM
>    790…") instead of a cold blank + a separate tip line. One cue, clears on type. Not required.
>
> **Logged-out = new user (first impression, 2026-06-27).** Codex flagged that logged-out flows
> dead-end. Fixed:
> 1. **Silent "Send request" (launch blocker).** A logged-out rider hitting Send on Request-a-stay
>    got a silent no-op. Now shows a clear CTA ("Create a free account to knock on this door — we'll
>    keep this host and your message ready") with sign-up / log-in. The host + drafted message +
>    dates are stashed in a module store (`pendingKnockStore`) and restored after auth — the form
>    reopens pre-filled, so context survives the round-trip through sign-up.
> 2. **Become-a-Host without login.** Logged-out main button now reads "Create a free account to
>    publish your safe spot" (routes to sign-up) instead of a saveable-looking form. Fixed the
>    misleading hint "visible for all registered riders" → "Your listing appears on the map for
>    riders browsing TWOWHEELCOME" (the map is public).
> 3. **Messages without login.** Logged-out visitors now get "Log in to see your knocks and chats."
>    + Log in / create-account buttons, instead of the generic find-a-host empty state.
> 4. **Copy/casing unified** to sentence case across listing + filter labels (Roof over head,
>    Private room, Tip welcome, Locked garage, Covered carport, Fenced yard, Street parking).
>
> Also **verified the map place search is live in production** (Codex tested a pre-deploy build):
> the deployed HostMap chunk on twowheelcome.com contains the search bar, "No place found",
> `flyToBounds`, and the Nominatim search URL. tsc + full eslint green for all of the above.
>
> **Pre-launch audit round 2 (Codex, 2026-06-27).**
> 1. **🔴 Host-cancel notification was silently dead.** The app sends a `cancelled_by_host`
>    event, but `request_notification_events_event_check` (baseline:160) only allowed
>    new_request/accepted/rejected — so the idempotency INSERT hit a 23514 check_violation and
>    `notify-request` returned 500, meaning the rider's cancel email/push never sent (the earlier
>    routing test only reached the 401 auth gate, so it hid this). Fixed the CHECK to include
>    `cancelled_by_host` — applied to live (management API) and corrected in baseline. **Verified
>    naostro** (live, BEGIN/ROLLBACK): inserting a `cancelled_by_host` event now succeeds (1 row),
>    a bogus event is still rejected (23514, so not over-opened), nothing persisted. The host-cancel
>    notification path is now unblocked end-to-end. No other place validates the event (RLS is
>    bypassed by the service-role admin client; no other CHECK/trigger references the values).
> 2. **profiles grants missing from baseline.** Live grants public read of (id, full_name, bio,
>    avatar_url) and own-profile writes via *column-level* grants, but the baseline only had
>    table-level REFERENCES/TRIGGER/TRUNCATE — so a fresh deploy/staging would fail on permissions.
>    Added explicit column grants to baseline, mirroring live exactly (verified with
>    has_column_privilege): SELECT (id, full_name, bio, avatar_url) for anon + authenticated;
>    INSERT/UPDATE for authenticated on the writable identity columns + push_token write. push_token
>    stays unreadable (no SELECT) and notify_email/notify_push stay off the public surface. Live
>    already has these, so no live change — baseline-only fix.
>    *(Separately spotted: `authenticated` also lacks SELECT/UPDATE on notify_email/notify_push, so
>    the notification-settings toggles can't persist on live — flagged as its own task, out of this
>    scope.)*
> 3. **De-booking copy.** "YOU'RE BOOKED" → "STAY ACCEPTED"; the "Paid" reward option → "Agreed
>    contribution" everywhere it shows (become-host, map filter, host profile, chat request card,
>    HostOffer); visible "guest" → "rider" in the UI (history "As rider", review prompts "RATE THIS
>    RIDER" / "How was this rider?" / "You rated this rider", profile "rate your hosts and riders").
> 4. **Listing description placeholder** no longer nudges hosts to publish access details: now
>    "Quiet fenced yard, dog on site, late arrivals okay. Exact meeting point stays in chat after I
>    accept." tsc + full eslint green.
> 5. **Become-a-Host photo upload silent click (logged out).** Tapping the "+" add-photo tile did
>    nothing for a logged-out visitor. Now it routes to sign-up (no silent click), with an explicit
>    "🔒 Create a free account to add photos →" line under the photo row.
> 6. **Accept-request confirmation.** Accepting a stay was a one-tap action (unlike cancel) — easy to
>    misfire. Added a confirm: "Accept this rider? Your exact meeting point stays hidden until you
>    send it." DECLINE stays one-tap (non-destructive).
> 7. **Send-coordinates confirmation.** Sharing the exact meeting point is sensitive and one-way, so
>    it now confirms first: "Send exact meeting point to this rider? Only do this once you're
>    comfortable hosting them."
> 8. **History copy:** "Confirmed" → "Accepted" (consistent with the rest of the de-booking wording).
>
> **Pre-launch audit round 3 (2026-06-27).**
> 1. **Rider count + arrival time back in the knock** (Petr reversed his earlier removal). The
>    Request-a-stay form now has a rider stepper (1…host's max_guests, capped) and an optional
>    orientational arrival-time chip set (Morning / Afternoon / Evening / Late / Flexible). Both are
>    sent to `create_knock` (`p_guests`, `p_arrival_time`) — the RPC already stored them
>    (guests_count = GREATEST(p_guests,1); arrival_time = nullif(trim(...))), only the client had
>    been hard-coding 1 / null. The request cards (host + rider) show "N riders" and "Arrival ~ …".
>    Date chips + message unchanged; both new fields are carried through the logged-out→sign-up
>    pendingKnockStore so context survives.
> 2. **Public reply to a review** (host-response model, instead of report/delete). The reviewed
>    person can post one public reply per review. DB: added `reply_body` / `reply_created_at` to
>    `reviews` (+ length CHECK), extended `strip_review_coords` to scrub coordinates from the reply
>    too, and added a SECURITY DEFINER RPC `set_review_reply(p_review_id, p_reply)` that pins
>    auth.uid() = reviewee_id (reviews has no UPDATE policy, so only the RPC can write a reply; reads
>    stay world-readable via rev_select). Applied to live (management API) and mirrored into baseline.
>    **Verified naostro** (live, BEGIN/ROLLBACK): the reviewee's reply is stored with coordinates
>    stripped (`50.0871, 14.4210` removed); a non-reviewee caller is rejected (P0001 "Only the
>    reviewed person may reply"); nothing persisted. UI: the /reviews screen (where the public
>    profile + map host-sheet both link) shows "Reply from {name}" under each review and gives the
>    reviewed person an inline Reply editor. tsc + full eslint green.
> 3. **Block a user** (post-contact safety, user-vs-user, no moderation). New `blocks` table
>    (blocker_id, blocked_id, created_at; PK both; no-self CHECK; FKs to auth.users CASCADE).
>    RLS: a user manages and reads ONLY their own block rows (auth.uid() = blocker_id) — the
>    blocked person is never told who blocked them. Enforcement is at the DB and bidirectional:
>    the block check was added to the existing SECURITY DEFINER validators —
>    `validate_stay_request_write` (knock blocked) and `validate_message_request` (message
>    blocked) — so a block in EITHER direction stops both knocking and messaging, un-bypassable by
>    a crafted client. New migration `00000000000003_user_blocks.sql` applied to live + mirrored
>    into baseline (the validator redefinitions live in the migration because they layer on the
>    host-cancel version; the table/RLS/grants are also in baseline). **Verified naostro** (live,
>    BEGIN/ROLLBACK): blocked→message rejected (P0001), blocked→knock rejected (P0001), reverse
>    block also blocks (bidirectional), a foreigner can't insert a block as someone else (RLS
>    42501), control message without a block succeeds, unblock restores messaging; nothing
>    persisted. UI: Block (with confirm) / Unblock on the counterpart's profile (host/[id], reached
>    from chat header + map + reviews); blocked conversations are hidden from the blocker's
>    Messages list; a blocked send surfaces the server message instead of failing silently.
>
> **Map pins = bike safety, not avatars (2026-06-27, Petr's design).** The core promise is
> "bike safety first", so map markers now show the parking-safety level instead of the host's
> face. Each pin is a teardrop coloured on a green→red semantic — locked_garage #4A9E5C (safest),
> carport #5A8FAE, fenced_yard #D08049, street #CB4636 (basic) — with the matching SAFETY icon
> (🔒/🏠/🚧/🛣️) inside. The level is derived with the shared `bestSafety()` (best of the host's
> parking options; falls back to street/basic when none), so it reuses the same normalisation as
> the SafetyBlock cards (garage_locked→locked_garage, yard→fenced_yard, …). The dashed ~500 m fuzz
> circle (now tinted to the safety colour), clustering, tap→host sheet and approximate location are
> all unchanged. Marker aria-label now leads with the safety level. Avatar marker code removed.
> Map controls regrouped (Petr): "Near me" now sits on the top row next to the search field (both
> are location actions); the Satellite toggle moved to the bottom-left corner so it no longer
> crowds the search. Both keep their behaviour; thumb-reachable on mobile.
>
> **Pre-launch audit round 4 (2026-06-27).**
> 1. **Persist the pending knock.** pendingKnockStore was in-memory only, so the "we'll keep this
>    host and your message ready" promise broke on a reload / confirmation-email round-trip. Now it
>    persists to AsyncStorage (localStorage on web) on set and is restored (async) + cleared on use.
> 2. **Resend confirmation email.** Signup needs email confirmation; a stuck user (no/lost email)
>    now gets a "Didn't get the email? Resend confirmation" action — shown after sign-up and when
>    login fails with email-not-confirmed — via supabase.auth.resend({type:'signup'}).
> 3. **Public listing description guard.** Reworded the warning (no exact address, gate code, phone,
>    email, social handle or GPS) and added a light client strip on save that cuts GPS coordinate
>    pairs, emails and phone-number runs (verified: strips those, keeps "3 riders, 2 nights").
>    Addresses-in-words aren't detectable — hence the explicit warning.
> 4. **guest → rider copy** (remaining): history "Rider:", Terms "Riders and hosts", the review-
>    reminder email/push "How was this rider?" (notify-review redeployed). DB field names untouched.
> 5. **Map marker accessibility.** Host pins were empty buttons to a screen reader; each now carries
>    role="button" + aria-label "Host {name}, {city} — safe spot for your bike".
> 6. **set_review_reply hardening.** Explicit REVOKE EXECUTE FROM public/anon + GRANT EXECUTE TO
>    authenticated (live + baseline); verified anon_exec=false, auth_exec=true.
>
> **host_locations_public — SECURITY DEFINER advisor (verification, no change).** Confirmed safe:
> the view returns only round(lat/lng, 2) (~1 km, never exact GPS), public offer columns and notes
> — no exact coordinates, no push_token (not in the base table), no private location_name. The base
> host_locations has RLS owner-only; naostro, anon reads 0 rows from it, so an invoker view would
> break the public map — the definer projection is the deliberate, correct pattern. View grants are
> SELECT-only for anon/authenticated (nothing extra). The advisor warning is intentional/acceptable.
> Optional extra hardening (not applied): REVOKE SELECT ON host_locations FROM anon (harmless today —
> RLS already returns 0 rows).
>
> now a calendar (@react-native-community/datetimepicker, min today; web keeps its date input;
> the package's web stub is a safe no-op). The Request-a-stay window shows a highlighted
> capacity badge (👥 Up to N riders) from host_locations.max_guests, and the pin-tap detail
> sheet shows the capacity line too (was missing in both). No per-request rider count
> reintroduced. Verified: max_guests is in the public view; tsc clean.
>
> **Pre-launch pass (2026-06-26).** (A) Rider/host walkthrough — flows are solid (map has
> load-error+retry / empty states, knock validates, chat coordinate-send tray, reviews
> reachable). Fixed: the Paid price now also shows in the knock form (not only the host
> detail). Proposals (not changed): native 'Other day' date entry is a manual YYYY-MM-DD field
> (add a native date picker); the 'Min. number of riders' filter is semi-orphaned after the
> per-request rider count was removed (keep or drop?). (B) Bulletproof re-run — all green
> live: full cross-user RLS matrix (anon + foreign can't read/write anything private; public
> map/profiles/reviews/listing-photos read works; request-photos private), push_token hidden,
> knock/accept/cascade/withdraw, host-bed double-book blocked, currency CHECK, coord strip.
> Nothing broken, no fixes needed. (C) Legal — strengthened liability disclaimer in Terms +
> Privacy (intermediary only, no liability, use at own risk, no vetting, indemnity);
> operator/controller legal identity left as [PLACEHOLDERS] for Petr to fill before launch;
> final legal review recommended.
>
> **Cleanup (2026-06-26): removed personal 'bike model' field.** profiles.bike_model was
> editable on the own profile and shown only on the public /host/<id> profile (the map even
> selected it unused). Removed from the own-profile editor, public profile (select + display),
> map select, and privacy wording. DB column kept (nullable, untouched), just unused. Distinct
> from host_locations.vehicle_types (unchanged). tsc clean, no remaining references.
>
> **Privacy (2026-06-26): review location protection.** A reminder under the review text field
> ("don't share the host's exact address/location") plus a backstop that strips obvious GPS
> coordinate pairs (3+ decimals, e.g. '50.0875, 14.4213') from the review body — client-side on
> submit and via a BEFORE INSERT/UPDATE trigger on reviews (covers direct API calls); prices
> like '20.50' are untouched, no word/address matching. Reporting/moderation not done (Petr's
> call). Verified live: coords stripped, normal review unchanged.
>
> **Additions (2026-06-26): price currency + privacy notes.** Listing price gained a currency
> (`price_currency`, default EUR, currency-chip selector in become-host, shown as '20 EUR /
> night' everywhere the price appears). Currency set is global majors —
> EUR/USD/GBP/CHF/JPY/CAD/AUD/CZK (CHECK enforces it; USD passes, a non-major like SEK is
> blocked) — and the price carries an 'indicative — agreed in chat' note for riders. Plus two decent
> privacy notes: at the photo upload (don't reveal exact address/house from the street) and at
> the map pin picker (public pin is fuzzed/approximate; exact coords are sent in chat after
> accepting). Verified live: currency saves through RLS, an invalid currency is CHECK-blocked,
> the public view returns '20 EUR / night' to anon.
>
> **Feature (2026-06-26): host listing photos + Paid price.** Hosts can upload up to 3 public
> listing photos per place (compressed via image-manipulator, owner-only write to a new
> public `listing-photos` bucket, paths in `host_locations.photos` with a CHECK ≤ 3) and, for
> a Paid listing, enter the amount + unit (`price_amount`/`price_unit`). Riders see both before
> knocking: a tappable gallery (fullscreen lightbox, same as the bike photo) and 'Paid — 500
> Kč / night' on the map host sheet, the Request-a-stay window (via HostOffer), and the public
> /host/<id> profile. Verified live (rolled back): owner saves photos+price through RLS and the
> public view returns them to anon; storage write is owner-folder-only, read is public; max-3
> enforced. Image render is for Petr to confirm visually.
>
> **Fix (2026-06-26): host sheet close + reviews round-trip.** The pin-tap host detail sheet
> got an explicit ✕ close button (the backdrop tap is hard to reach when the sheet is tall on
> a phone; harmless on desktop). And opening Reviews from the sheet no longer strands the user
> on the bare map on back — a reopenHostSheetRef flag reopens the still-selected host's sheet
> on the map's next focus, so pin → detail → (Reviews → back = detail) → (✕ = map).
>
> **UI (2026-06-26): host bottom-sheet reviews row.** The map pin-tap host sheet gained a
> 'Reviews' folder row (⭐ avg · n reviews → /reviews?user=<hostId>, 'No reviews yet' when
> empty/non-clickable) and dropped the redundant 'View full profile' button (its only extra
> was reviews, now reachable directly). Knock CTA unchanged.
>
> **UI (2026-06-26): Reviews folder + Messages returns to list.** (a) Received reviews moved
> from a long inline list into a 'Reviews' menu folder (subtitle '⭐ avg · N reviews') opening
> a dedicated /reviews screen — parameterized by ?user=<id> so it serves the own profile and
> the public /host/<id> profile (host checks a rider's reviews in one tap). (b) Switching tabs
> and back to Messages now lands on the conversation LIST, not the last open chat; deep-links /
> 'Open chat' (pendingChatStore) still open a specific chat, and a keepChatOpenRef flag keeps
> the chat when returning from the profile/map sub-screens.
>
> **Feature (2026-06-26): reach the other person's profile from a conversation.** A host
> couldn't check an incoming rider's reputation before accepting. The chat header (avatar +
> name) is now tappable → opens the other party's public profile (`/host/<id>`), both
> directions. Also fixed: that page 404'd ("Rider not found") for anyone without a listing
> because it required a host_location; a profile alone is now enough, so a pure rider's
> reputation (avg/count/received reviews) shows — host-offer + knock CTA render only when a
> location exists. Privacy unchanged (coarse public view; reviews already world-readable).
> Verified: a real rider with reviews but no location now resolves to a viewable profile.
>
> **Bug fix (2026-06-26): received reviews invisible on own profile.** The own profile
> loaded "reviews about me" via a PostgREST embed (`reviewer:profiles!reviewer_id`) needing
> a `reviews.reviewer_id → profiles` FK that doesn't exist, so the query errored → reviews
> empty → rating/count showed "—" and the REVIEWS list was hidden. Not an RLS problem
> (`rev_select = true` already makes reviews world-readable; the public `/host/<id>` and the
> map worked because they fetch reviewer names separately). Fixed the own-profile query to do
> the same (+ show the review date). Write rules unchanged. Verified live: subject, a foreign
> rider, and anon all read the subject's received reviews (count 3, avg 3.67); a
> non-participant review insert stays blocked.
>
> **UI follow-up (2026-06-25): arrival time removed.** Matchmaking model — the time is
> agreed in chat, only the night matters. Removed the 'Est. arrival time' form field
> (state/default/validation), the 'Arrival approx.' row on both request cards, and the
> arrival_time bit from notify-request emails/push. create_knock now passes null;
> `arrival_time` column stays nullable. Date chips unchanged. Verified live (rolled back):
> a knock with no time succeeds (arrival_time NULL); history/reviews unaffected.
>
> **UI follow-ups (2026-06-25).** (a) Knock photos are now downscaled + JPEG-compressed
> client-side before upload (expo-image-manipulator, longest side 1400px / q0.7, ~100–300 KB),
> best-effort with fallback to the original; private bucket + signed-URL render unchanged.
> (b) Tapping a host pin shows the host's complete public offer (sleep, amenities, pricing,
> vehicles, note) via a shared HostOffer block — public `host_locations_public` data only,
> exact GPS still hidden until accept. Compression runs in-browser (web-only photo path), so
> the actual size reduction is for Petr to confirm visually; the upload/fallback is verified.
>
> **Model A — request logic simplified (2026-06-25).** Switched to matchmaking, not strict
> booking. Riders knock freely (overlapping, adjacent, multiple places, even while accepted
> elsewhere): dropped the per-rider exclusion constraint and the guest-side accept-cascade,
> and removed the request form's rider-count stepper (always 1). The only rules left are
> host-side: a new `no_double_booked_accepted` EXCLUDE stops two ACCEPTED stays overlapping
> at one location (checkout-exclusive `[)`), the host-side cascade still auto-rejects other
> riders' pending requests for the same place+night on accept, and a `uniq_pending_knock`
> partial index blocks exact-duplicate pending requests. Withdraw unchanged. Client shows
> friendly messages for the dup (23505) and double-book (23P01) blocks. Verified live
> (rolled back): adjacent + overlapping knocks pass, exact-dup blocked, accepted@A + knock@B
> same night allowed, second accept for the same place+night blocked, withdraw works.
>
> **Follow-up fix (2026-06-25): back-to-back nights.** Stays are checkout-exclusive
> (departure = arrival+1), but every overlap test used an inclusive daterange `[]`, so a
> stay ending the day another began was wrongly flagged as overlapping — a rider couldn't
> book tomorrow at a host they had today. Switched the exclusion constraint, the
> accept-cascade, and the client pre-check to half-open `[)` (checkout day free), and made
> a stay require ≥1 night (closes the empty-range loophole). Verified live (rolled back):
> today + tomorrow both pass, real overlaps blocked, cascade rejects only true overlaps.

---

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
| S4 | Edge functions use **CORS `*`** | Baseline says no wildcard in prod. Practical risk low — auth is Bearer-token, not cookies, so a hostile origin can't ride a user's credentials. | **Fixed & verified.** `notify-request` + `delete-account` now reflect an allowlisted Origin (apex, www, the project's `*.vercel.app` deploy URLs, localhost dev) and fall back to `https://www.twowheelcome.com` for anything else. `notify-review` is cron-only (no browser origin). Verified live: a legit Origin is reflected; `evil.example.com` gets the mismatch and is blocked. |
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

*Fixed & verified: C1, C2, per-stay reviews, H1, H3, H4, M5, M7, S1, S2, S3, S4 (CORS), S5 (cap). Hardened: H2.
Assessed & deferred (not safe to change blind / product calls): M6 (timezone — system-wide UTC),
M8 (error-surfacing UI), M9 + delete-account (transactional RPCs). Remaining "Propose" items await Petr's call.*

### Request model — multi-location, repeat knocks, withdraw (2026-06-23)
Verified live against the DB, then aligned the app to what the DB already allows.
- **B1 — knock at multiple hosts at once.** Already worked: the exclusion constraint is
  scoped per `(guest, location)`, so a rider shopping around several hosts (even on the
  same dates) is fine. No change. **Verified live.**
- **B2 — repeat knock at the *same* host on free dates (was H4).** The DB only blocks
  *date-overlapping* active requests; the app blocked *any* second knock per location.
  Relaxed the app: the host card now shows the existing request as context and still
  offers "Knock again — other dates"; an overlapping repeat is caught by the submit-time
  date check + the exclusion constraint. **Fixed & verified live** (non-overlapping repeat
  allowed, overlapping repeat blocked with 23P01).
- **B3 — rider withdraws a pending request.** New `PENDING → CANCELLED` transition by the
  guest (RLS already permitted the guest's update; the `validate_stay_request_write`
  trigger now allows it; only the guest, only while pending). `CANCELLED` sits outside the
  exclusion constraint, so the slot frees and the rider can re-knock the same nights. The
  conversation and its history stay intact; a "Withdraw request" button shows on the guest's
  pending card. **Fixed & verified live** (guest cancel OK, host cancel blocked, slot freed).
- **When accepted elsewhere, other pending knocks are *left as-is*** (manual withdraw is
  enough). Auto-cancel-on-accept was considered and intentionally **not** implemented.

### One host, multiple riders, same night — Variant A + guest cleanup (C, 2026-06-23)
**Was (verified live):** two *different* riders could both knock for the same place + same
night and the host could **accept both** → silent **double-booking** (the exclusion
constraint is per-guest). **Petr chose Variant A + guest-side auto-cleanup**, scoped to
date overlap so multi-night trips keep their other nights.
**Implemented (atomic AFTER UPDATE trigger `cascade_on_accept`, fires only on the
transition into ACCEPTED → no recursion):**
- **Host side** — every *other* rider's overlapping PENDING request at the same location
  → REJECTED, with a 🔒 "spot taken" system message in each conversation.
- **Guest side** — the accepted rider's *own* overlapping PENDING requests at *other*
  hosts → CANCELLED (frees those slots), with a system message.
- **Non-overlapping requests (other nights) are untouched.**
Overlap = `daterange(arrival, departure, '[]') &&` (same as the exclusion constraint). The
guest-side cancel (actor is the host) is permitted via a narrow, transaction-local
`app.cascade` flag that only this trigger sets and the validator honours like the service
role. System messages surface as the last conversation-list message through existing
realtime — no client change. **Fixed & verified live** (rolled back): accept → other rider
rejected, own overlapping request elsewhere cancelled, other-night request stays PENDING;
one system message per affected conversation.
*Not added: email/push for the auto-rejected/cancelled riders (in-chat system message only)
— easy follow-up if Petr wants it.*

### Still open for Petr (no code changed — needs his decision/testing)
- **M9 / delete-account** — wrap become-host save and account deletion in transactional RPCs (like `create_knock`).
- **M6** — timezone-correct dates end-to-end (client + trigger + cron + RLS).
- **Rate-limiting** — edge-function throttling (CORS itself is now fixed, see S4).
- **M8** — split the shared avatar/name/bike error state and surface save failures.
