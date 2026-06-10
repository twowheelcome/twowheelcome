# External Integrations

**Analysis Date:** 2026-06-10

## APIs & External Services

**Supabase (Database & Auth):**
- Service: PostgreSQL database + authentication backend
- What it's used for:
  - User authentication (email/password sign-up and login)
  - Storing user profiles, host profiles, stay requests
  - Real-time data queries via Supabase client
  - Session management (token-based)
- SDK/Client: `@supabase/supabase-js` 2.108.0
- Implementation: `src/lib/supabase.ts`
  - Configured with hardcoded URL and anon key (SECURITY ISSUE)
  - Uses AsyncStorage for session persistence on native platforms
  - Auto-refresh tokens enabled
  - Session detection disabled (allows offline operation)

**OpenStreetMap Nominatim (Geocoding):**
- Service: Free geocoding and reverse-geocoding API
- What it's used for:
  - Converting GPS coordinates to city/country names
  - Converting city names to GPS coordinates
- Endpoints:
  - Reverse geocoding: `https://nominatim.openstreetmap.org/reverse` (used in `src/app/become-host.tsx`)
  - Forward geocoding: `https://nominatim.openstreetmap.org/search` (used in `src/app/become-host.tsx`)
- No API key required
- No authentication

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Client: `@supabase/supabase-js`
  - Tables used:
    - `profiles` - User profile data (full_name, avatar_url, bio)
    - `host_profiles` - Host offerings (location, parking type, pricing, max_guests, notes)
    - `stay_requests` - Booking requests between guests and hosts
  - Connection: URL and anon key in `src/lib/supabase.ts`

**File Storage:**
- Not detected (Supabase Storage not in use)
- Local storage only via AsyncStorage for session persistence

**Caching:**
- React state management (in-memory only)
- AsyncStorage for session persistence on mobile platforms
- No server-side caching detected

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (built-in PostgreSQL auth)
  - Implementation: `src/app/index.tsx` (auth screen)
  - Methods:
    - Email/password signup: `supabase.auth.signUp()`
    - Email/password login: `supabase.auth.signInWithPassword()`
    - Session persistence: Token stored in AsyncStorage (mobile) or localStorage (web)
    - Session validation: `supabase.auth.getUser()`, `supabase.auth.getSession()`
  - Email confirmation required (email verification step)
  - Token auto-refresh enabled

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, LogRocket, or similar)

**Logs:**
- Browser/mobile console only (`console.error()` in `src/app/(tabs)/map.tsx`)
- No centralized logging service

## CI/CD & Deployment

**Hosting:**
- Expo Go / Expo-managed deployment (iOS, Android, Web)
- Web deployment: Static export (configured in `app.json`)
- No custom server/backend detected

**CI Pipeline:**
- Not detected (no GitHub Actions, GitLab CI, or similar)

## Environment Configuration

**Required env vars:**
- Supabase credentials should use environment variables (currently hardcoded):
  - `EXPO_PUBLIC_SUPABASE_URL` - Supabase project URL
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key

**Current configuration:**
- Hardcoded in `src/lib/supabase.ts`:
  - `SUPABASE_URL = 'https://igrmxzvnadqckxjachdc.supabase.co'`
  - `SUPABASE_ANON_KEY = 'sb_publishable__9ut7dzGoOq3ZabRwoDabg_Rznv47CA'` (EXPOSED)

**Secrets location:**
- Currently: Hardcoded in source (SECURITY ISSUE)
- Should be: Environment variables, Expo secrets, or `.env` file (gitignored)

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Supabase auth callbacks:
  - Email confirmation link (Supabase sends via configured SMTP)
  - Password reset (not implemented in UI)

---

*Integration audit: 2026-06-10*

## Security Notes

**CRITICAL ISSUES:**

1. **Hardcoded Credentials:** Supabase URL and anon key are exposed in `src/lib/supabase.ts`. These should be stored as environment variables.

2. **Public Anon Key Exposure:** The key `sb_publishable__9ut7dzGoOq3ZabRwoDabg_Rznv47CA` is visible in source code and git history. If this is a real project, the key must be rotated immediately.

3. **No Environment Variable Usage:** The project does not use `.env` files or Expo's built-in secret management. All sensitive config is hardcoded.

See `.planning/codebase/CONCERNS.md` for detailed security audit.
