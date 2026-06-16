# CODEX HANDOFF

Date: 2026-06-15 23:17 WEST
Workspace: /Users/corkef/twowheelcome
Current app URL in browser: http://localhost:8081/map

## Current State

The app is running locally and the current branch/worktree has several intentional cleanup and fix changes that are not yet committed.

Verification already performed:

- `npx tsc --noEmit` passes.
- `npm run build` passes.
- `npm run lint` exits 0, with warnings only.
- Browser smoke test passed for Map/Profile/Messages/Map.
- Map renders normally; no map fallback observed.

Known lint warnings:

- `src/app/(tabs)/requests.tsx`: missing hook dependencies around `openConv` and `currentUser`.
- `src/components/HostMap.tsx`: missing hook dependencies around `C.accent`, `C.text`, and `addMarkers`.
- `src/components/LocationPicker.web.tsx`: missing hook dependencies around `onChange`, `setMarker`, and `pin`.

## Cleanup Already Done

- `.codex/` removed from the repo workspace.
- `design_handoff_twowheelcome/` removed.
- Old `CODEX_HANDOFF.md` had been removed earlier, but this new handoff file was recreated because the user asked to save state before hitting the limit.
- `.gitignore` updated to ignore `.codex/` and `supabase/.temp/`.
- `supabase/.temp/` removed.
- `.agents/skills/twowheelcome-design/SKILL.md` updated to match current TWOWHEELCOME product/brand direction.
- Old `.agents/.../README.md` removed.

## Fixes Already Made Locally

- `src/lib/supabase.ts`
  - Changed `detectSessionInContext` to `detectSessionInUrl`.

- `src/types/leaflet.d.ts`
  - Added local module declaration for `leaflet`.

- ESLint setup
  - Installed `eslint` and `eslint-config-expo`.
  - Added `eslint.config.js`.
  - `package.json` and `package-lock.json` updated.

- React/lint cleanup
  - `src/app/(tabs)/map.tsx`
  - `src/app/become-host.tsx`
  - `src/app/host/[id].tsx`
  - `src/components/LocationPicker.web.tsx`
  - `src/components/UserChip.tsx`
  - `src/app/_layout.tsx`
  - `src/components/HostMap.tsx`
  - `src/app/(tabs)/profile.tsx`
  - `src/app/(tabs)/requests.tsx`

- `supabase/functions/delete-account/index.ts`
  - Fixed local delete-account logic.
  - Important bug found: function deleted `stay_requests` before `messages`, but `messages.request_id` references `stay_requests(id)` without cascade.
  - Added `must()` helper so database errors throw instead of being ignored.
  - New order: delete messages first, then reviews, stay_requests, conversations, host_locations, profiles, then auth user.

## Deployment Note

The fixed `delete-account` Edge Function is local only.

Deployment was attempted after the user confirmed, but it failed because the environment could not reach npm registry:

- `getaddrinfo ENOTFOUND registry.npmjs.org`
- No local/global Supabase CLI was available.
- No `SUPABASE_ACCESS_TOKEN` was available.

Next step when network/CLI is available:

```bash
npx supabase functions deploy delete-account
```

## Current Review Findings

These are the important issues found during the whole-app review. They are not fixed yet unless noted otherwise.

1. Host location editing can break existing requests
   - File: `src/app/become-host.tsx`
   - Current flow deletes all `host_locations` for the user before inserting fresh rows.
   - Migration `supabase/migrations/add_stay_request_location.sql` has `stay_requests.location_id REFERENCES host_locations(id)` without `ON DELETE`.
   - If a stay request references a host location, editing host locations can fail with a foreign-key error.
   - Recommended fix: stop delete-all replacement; update/upsert existing locations with stable IDs, or change FK behavior carefully.

2. Guest request status can stay stale after host accepts/rejects
   - File: `src/app/(tabs)/requests.tsx`
   - Realtime listens to `INSERT` on `messages`, but host response updates `stay_requests.status`.
   - Auto-message does not carry enough state to reliably update the request card.
   - Recommended fix: subscribe to `stay_requests` updates for visible request IDs, or update local request cards when relevant messages/status changes arrive.

3. Bike model field mismatch
   - `src/app/(tabs)/profile.tsx` saves `bike_model`.
   - `src/app/(tabs)/map.tsx` and `src/app/host/[id].tsx` read/display `bike`.
   - Migration adds `bike_model`, not `bike`.
   - Recommended fix: consistently use `bike_model` in queries and UI, or migrate/backfill field naming.

4. `notify-request` lacks app-level authorization
   - File: `supabase/functions/notify-request/index.ts`
   - Function accepts `request_id` and `event`, then uses service-role access.
   - It should verify the caller is the guest/host on that request and that the event is valid for the current request state.

5. `notify-request` inserts user text directly into HTML email
   - File: `supabase/functions/notify-request/index.ts`
   - `request.message` and profile names should be HTML-escaped before templating.

6. Push notifications may silently skip registration
   - File: `src/lib/pushNotifications.ts`
   - Registration requires EAS project ID.
   - `app.json` does not currently contain `extra.eas.projectId`.

7. Profile bike save ignores database errors
   - File: `src/app/(tabs)/profile.tsx`
   - `saveBike` updates local state even if Supabase upsert fails.
   - Recommended fix: check `{ error }` and show inline error if save fails.

## Suggested Next Work Order

1. Fix host location update flow in `src/app/become-host.tsx`.
2. Fix request status realtime/update behavior in `src/app/(tabs)/requests.tsx`.
3. Fix bike field consistency across profile, map, and host detail.
4. Harden `notify-request` authorization and HTML escaping.
5. Add/confirm EAS project ID for push notifications.
6. Deploy `delete-account` once network/Supabase CLI access works.
7. Rerun:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Git Status Snapshot

Modified/deleted/tracked changes at save time:

```text
 M .gitignore
 D design_handoff_twowheelcome/PROMPT.txt
 D design_handoff_twowheelcome/README.md
 D design_handoff_twowheelcome/TWOWHEELCOME-app-demo.html
 D design_handoff_twowheelcome/logo.png
 D design_handoff_twowheelcome/theme.ts
 M package-lock.json
 M package.json
 M src/app/(tabs)/map.tsx
 M src/app/(tabs)/profile.tsx
 M src/app/(tabs)/requests.tsx
 M src/app/_layout.tsx
 M src/app/become-host.tsx
 M src/app/host/[id].tsx
 M src/components/HostMap.tsx
 M src/components/LocationPicker.web.tsx
 M src/components/UserChip.tsx
 M src/lib/supabase.ts
 M supabase/functions/delete-account/index.ts
?? .agents/
?? eslint.config.js
?? src/types/
```

## Notes For Next Assistant

- User speaks Czech and prefers simple, non-technical summaries unless details are needed.
- Do not revert existing changes.
- If editing Expo code, repo instruction says to read exact Expo SDK 56 docs first: https://docs.expo.dev/versions/v56.0.0/
- Current highest-priority app bug is the host location delete-all flow.

## Update: 2026-06-16

Codex fixed the main review findings locally.

Done:

- `src/app/become-host.tsx`
  - Host locations are no longer deleted and recreated blindly.
  - Existing locations keep their IDs and are updated via upsert.
  - Removed locations are deleted only when no `stay_requests` reference them.
  - If a removed location already has requests, saving stops with a clear message so existing request history is not broken.

- `src/app/(tabs)/requests.tsx`
  - Conversation list now fetches request status.
  - Open chats subscribe to `stay_requests` updates and update request cards when host accepts/rejects.
  - Host response updates local conversation/request status immediately.

- `supabase/migrations/enable_stay_requests_realtime.sql`
  - Added idempotent migration to add `stay_requests` to the Supabase realtime publication.

- `src/app/(tabs)/map.tsx`
  - Profile query now reads `bike_model` instead of old `bike`.

- `src/app/host/[id].tsx`
  - Public host profile now reads/displays `bike_model`.

- `src/app/(tabs)/profile.tsx`
  - Bike model save now checks Supabase errors before updating UI state.

- `supabase/functions/notify-request/index.ts`
  - Added bearer token auth check.
  - Verifies caller is the correct guest/host for the notification event.
  - Verifies request status matches the event.
  - Escapes user-controlled text before inserting it into HTML emails.

Verification after these fixes:

- `npx tsc --noEmit` passes.
- `npm run lint` passes with no warnings.
- `npm run build` passes.
- In-app browser smoke tests:
  - `/map` renders with map controls and no console errors.
  - `/profile` loads current user profile, including bike model.
  - `/requests` renders with no console errors.
  - `/become-host` opens the editor and existing location with no console errors.

Still blocked:

- Supabase deploy was attempted again, but `npx supabase --version` failed because DNS/network could not reach `registry.npmjs.org`.
- Local Edge Function and migration changes are not deployed yet.
- Deploy needed when CLI/network is available:

```bash
npx supabase db push
npx supabase functions deploy delete-account
npx supabase functions deploy notify-request
```

Not changed:

- Push notification `projectId` was not added because no EAS project ID was found in the repo. Do not invent it; add the real EAS project ID to `app.json` when known.
