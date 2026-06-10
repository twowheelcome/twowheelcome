# Concerns Map
<!-- last_mapped: 2026-06-10 -->

## Summary

10 concern areas identified. Several are critical (security) and should be addressed before production launch.

---

## Critical — Security

### 1. Hardcoded / Exposed Supabase Credentials
- **Risk:** HIGH — credentials in source or `.env` exposed to client bundle
- **Location:** `src/lib/supabase.ts`, `.env` / `.env.local`
- **Fix:** Confirm Supabase anon key is truly public-safe; never expose service role key; audit `.gitignore`

### 2. Missing or Incomplete Row-Level Security (RLS)
- **Risk:** HIGH — any authenticated user may be able to read/write other users' data
- **Location:** Supabase project (database policies)
- **Fix:** Enable RLS on all tables (`host_profile`, `stay_request`); define minimal per-user policies

### 3. XSS Risk in HostMap
- **Risk:** MEDIUM — user-supplied content (host names, addresses) rendered in map popups without sanitization
- **Location:** `src/components/HostMap.tsx`
- **Fix:** Sanitize or escape all user-supplied strings before injecting into HTML/JSX

---

## High — Type Safety

### 4. Extensive `any` Usage Despite `strict: true`
- **Risk:** HIGH — TypeScript strict mode configured but bypassed with `any`, hiding runtime errors
- **Location:** Multiple screen files, `src/lib/supabase.ts`
- **Fix:** Replace `any` with proper types or `unknown`; define typed Supabase response shapes

---

## High — Error Handling

### 5. Silent Catch Blocks
- **Risk:** HIGH — errors swallowed silently; users see no feedback, bugs are invisible
- **Location:** Auth handlers in `src/app/index.tsx`, Supabase queries in tab screens
- **Fix:** Surface errors to user via `Alert.alert()` or toast; log to error service

### 6. Unhandled Promise Rejections
- **Risk:** MEDIUM — async operations (geocoding, Supabase writes) not always awaited with error handling
- **Location:** `src/app/become-host.tsx`, `src/app/(tabs)/map.tsx`
- **Fix:** Wrap async calls in try/catch; add loading + error states to UI

---

## High — Data Validation

### 7. Client-Only Validation, No Server-Side Checks
- **Risk:** HIGH — validation happens only on-device; malformed data can be inserted directly via Supabase API
- **Location:** `src/app/become-host.tsx` (host profile form), `src/app/(tabs)/map.tsx` (stay request)
- **Fix:** Add Supabase database constraints (NOT NULL, CHECK); consider Postgres triggers for business rules

---

## Medium — Performance

### 8. No Pagination on Map / Requests Queries
- **Risk:** MEDIUM — fetching all rows from `host_profile` and `stay_request` will degrade at scale
- **Location:** `src/app/(tabs)/map.tsx`, `src/app/(tabs)/requests.tsx`
- **Fix:** Add `.range()` / `.limit()` pagination; use bounding-box query for map hosts

### 9. No Response Caching
- **Risk:** LOW-MEDIUM — every screen mount triggers fresh Supabase query; no local cache
- **Fix:** Consider React Query or SWR for cache + background revalidation

### 10. Runtime CSS Injection (Web)
- **Risk:** LOW — Leaflet/map CSS injected at runtime causes flash of unstyled map on web
- **Location:** `src/components/HostMap.tsx` (web variant)
- **Fix:** Import Leaflet CSS statically in layout

---

## Medium — Fragile Areas

### 11. Global `window` Pollution
- **Risk:** MEDIUM — direct `window.*` assignments for Leaflet workarounds may conflict with SSR or future web tooling
- **Location:** `src/components/HostMap.tsx` (web)
- **Fix:** Use dynamic import with `ssr: false` pattern; isolate Leaflet initialization

### 12. Uncontrolled Modal State
- **Risk:** LOW-MEDIUM — form fields in `become-host.tsx` modal not reset on close; stale data visible on reopen
- **Location:** `src/app/become-host.tsx`
- **Fix:** Reset state in `onDismiss` / `useEffect` cleanup

---

## Medium — Architecture

### 13. No Error Boundaries
- **Risk:** MEDIUM — a render error in any screen crashes entire app with no recovery UI
- **Fix:** Add React `ErrorBoundary` around tab screens; implement fallback UI

### 14. No Global State Management
- **Risk:** LOW-MEDIUM — session/user data passed implicitly; will become prop-drilling problem as app grows
- **Fix:** Add Zustand or React Context for auth/session state

---

## Low — Code Quality

### 15. Hardcoded Colors
- **Risk:** LOW — brand colors duplicated across 7+ files making theming/rebrand costly
- **Location:** Inline `StyleSheet.create()` calls across screen files
- **Fix:** Centralize to a `src/constants/colors.ts` theme object

### 16. Large Component Files
- **Risk:** LOW — some screen files mix data fetching, business logic, and rendering in one file
- **Fix:** Extract data-fetching hooks (`useHosts`, `useRequests`) into `src/lib/hooks/`

---

## Zero Test Coverage

- **Risk:** HIGH (compound) — all concerns above have zero regression protection
- No unit tests, no integration tests, no E2E tests
- Any refactor can silently break auth, host creation, or request flow
- **Fix:** Prioritize tests for auth flow, host profile UPSERT, and stay request INSERT
