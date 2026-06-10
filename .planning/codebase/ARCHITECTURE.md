# Architecture Map
<!-- last_mapped: 2026-06-10 -->

## System Overview

**twowheelcome** is an Expo-based hospitality mobile app (iOS, Android, Web) connecting motorcyclists who need a place to stay with hosts willing to offer accommodation.

## Architecture Pattern

**Layered client-first app (no dedicated backend server)**

```
┌─────────────────────────────────────────────┐
│  Presentation Layer                          │
│  src/app/ (Expo Router screens)             │
│  src/components/ (reusable UI)              │
├─────────────────────────────────────────────┤
│  Data Access Layer                           │
│  src/lib/supabase.ts (Supabase client)      │
├─────────────────────────────────────────────┤
│  External Services                           │
│  Supabase (PostgreSQL + Auth)               │
│  Nominatim (geocoding)                       │
│  OpenStreetMap / React Leaflet (maps)       │
│  Browser Geolocation API                    │
└─────────────────────────────────────────────┘
```

## Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Presentation | `src/app/`, `src/components/` | Screens, navigation, UI rendering |
| Data Access | `src/lib/supabase.ts` | Supabase client, session management |
| External | Supabase, Nominatim, OSM | Auth, DB, geocoding, maps |

## Entry Points

| Entry Point | File | Purpose |
|------------|------|---------|
| Root layout | `src/app/_layout.tsx` | Session listener, routing guard |
| Auth screen | `src/app/index.tsx` | Signup / signin |
| Tab navigator | `src/app/(tabs)/` | Main app shell after auth |
| Become host | `src/app/become-host.tsx` | Host profile modal |

## Key Data Flows

### Auth Flow
```
index.tsx (signup/signin)
  → supabase.auth.signUp / signInWithPassword
  → session stored via AsyncStorage (mobile) / localStorage (web)
  → _layout.tsx session listener
  → routes to (tabs)
```

### Host Discovery Flow
```
(tabs)/map.tsx
  → supabase SELECT from host_profile
  → renders pins on map (Leaflet web / RN Maps mobile)
  → user taps pin → stay request modal
  → supabase INSERT stay_request
```

### Host Management Flow
```
become-host.tsx
  → browser Geolocation API
  → Nominatim reverse geocoding
  → supabase UPSERT host_profile
```

### Requests Flow
```
(tabs)/requests.tsx
  → supabase SELECT stay_request (sent + received)
  → status toggle → supabase UPDATE stay_request
```

## Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| HostMap | `src/components/HostMap.tsx` | Map rendering, host pins, platform-aware (web/mobile) |
| Root Layout | `src/app/_layout.tsx` | Auth guard, session subscription |
| Index | `src/app/index.tsx` | Login/signup forms |
| Become Host | `src/app/become-host.tsx` | Host profile creation with geocoding |

## Known Anti-Patterns

| Anti-Pattern | Impact | Location |
|-------------|--------|---------|
| No service layer | Screens coupled directly to Supabase | All screen files |
| Hard-coded colors | Brand colors duplicated across 7+ files | Inline StyleSheet calls |
| No error boundaries | Silent failures in auth listeners | `_layout.tsx` |
| Uncontrolled form state | Modal state not reset on close | `become-host.tsx` |
