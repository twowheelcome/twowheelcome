# TWOWHEELCOME — Dead-code / unused inventory (2026-06-28)

Report only — **nothing deleted**. Verified against the live DB and a code grep. Each item has a
**keep/drop** recommendation and a **risk** note. Anything that might be waiting for a planned feature is
flagged ⏳ — do **not** drop those without Petr confirming.

Legend: ✅ safe to drop · ⏳ confirm first (possible planned feature) · 🔒 keep.

---

## 1. Tables (0 code references)

| Table | Rows | In code? | Rec | Notes |
|---|---|---|---|---|
| `bikes` | 0 | none (`from('bikes')` = 0) | ⏳ drop | Remnant of an early "bike profile / garage" idea. Empty. Czech RLS policies attached. Drop only if no planned "my motorcycles" feature. |
| `host_profiles` | 1 | none (`from('host_profiles')` = 0) | ⏳ drop | Old parallel design to `host_locations` (cols: parking/sleeping/facilities/bonuses/bike_types/price_per_night…). 1 stale row. Superseded by `host_locations`. Drop unless a "host profile" rework is planned. |

Both have FKs `→ profiles(id) ON DELETE CASCADE` and old Czech-named RLS policies ("Kola vidí všichni",
"Hostitelé viditelní všem") — those policies die with the tables.

## 2. Columns (never read/written in app code)

**`profiles`** (FK-cascade cleanup already covers them):
| Column | Rec | Notes |
|---|---|---|
| `languages` | ✅ drop | Only a code *comment* matches "languages"; column never used. |
| `verified_phone` | ✅ drop | No code ref. No phone verification exists. |
| `bike_model` | ⏳ drop | No code ref. Pairs with the `bikes`/garage idea — confirm. |
| `cover_url` | ✅ drop | No code ref (only avatar_url is used). |
| `last_seen` | ✅ drop | No code ref; never written. |
| `vehicle_types` | ⏳ drop | No code ref on the *profile* (the listing one is separate, below). |

**`host_locations`** (note: the `host_locations_public` view re-exposes some of these → view must be
recreated when dropping):
| Column | Rec | Notes |
|---|---|---|
| `location_name` | ✅ drop | Feature removed; `become-host` now always writes `null`. Old rows may hold values (lost on drop — acceptable, feature gone). |
| `available_from` / `available_to` | ✅ drop | Old availability-window feature; replaced by the `paused` flag. No code ref. |
| `price_unit` | ✅ drop | Always written `null`; never read. |
| `vehicle_types` | ⏳ drop | **Read** by `HostOffer` (shows "🏍 …") but **never written** by any editor — vestigial/legacy-data only. Drop the column *and* the HostOffer vehicle row together, or add a vehicle picker if "what fits" is planned. Also exposed by `host_locations_public`. |

**`reviews`**:
| Column | Rec | Notes |
|---|---|---|
| `tags` | ✅ drop | Review tags were replaced by the free-text note; no code ref. |

> Kept (look unused but aren't): `stay_requests.guest_vehicle` & `arrival_time` (shown in the request
> recap), `reviews.reply_body`/`reply_created_at` (host reply), `profiles.notify_email/notify_push`
> (settings), `host_locations.parking`/`pricing` (legacy singular, still read as fallback in code).

## 3. Functions / triggers / RLS

- **App functions — all live** (no dead ones): `create_knock`, `delete_account_data`, `set_push_token`,
  `set_review_reply` (all RPC-called) and the trigger functions `handle_new_user`, `cascade_on_accept`,
  `enforce_message_rate_limit`, `validate_conversation_write`/`_message_request`/`_stay_request_write`,
  `strip_location_notes`, `strip_review_coords`.
- **🔒 The ~180 `gbt_*` / `gbtreekey*` / `*_dist` functions are NOT app code** — they belong to the
  `btree_gist` extension that powers the `no_double_booked_accepted` exclusion constraint. Do not touch.
- **Dead policies:** only the 4 Czech-named policies on `bikes` + `host_profiles` (removed with those tables).

## 4. Enums / custom types
None — no custom enum types in `public` (statuses are `text` + CHECK constraints). Nothing to clean.

## 5. Code (files / components / deps)

- **Components/libs:** no genuinely unused ones found. (`LocationPicker.web.tsx` is the web platform
  variant of `LocationPicker`, resolved automatically — not dead.)
- **npm dependencies with 0 references in `src/` or `app.json`:**

| Package | Rec | Notes |
|---|---|---|
| `@expo-google-fonts/rye` | ✅ drop | Rye wordmark was removed; font no longer used. |
| `react-leaflet` | ✅ drop | `HostMap` uses `leaflet` directly; react-leaflet never imported. |
| `react-native-maps` | ⏳ drop | Map is Leaflet-based; no ref. Confirm no native map plan before removing. |
| `@expo/ui` | ⏳ drop | 0 refs. Experimental; confirm not earmarked. |
| `expo-glass-effect` | ⏳ drop | 0 refs. |
| `expo-symbols` | ⏳ drop | 0 refs. |
| `expo-web-browser` | ⏳ drop | 0 refs (auth uses Linking). Confirm OAuth flows don't need it. |
| `expo-device` | ⏳ drop | 0 refs. |
| 🔒 keep | — | `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`, `react-native-screens`, `@react-navigation/*`, `react-native-web`, `expo-status-bar`, `expo-system-ui`, `expo-font`, `expo-linking` — framework/peer deps used implicitly by Expo Router/runtime even without direct imports. |

---

## TL;DR

**How much dead weight:** 2 dead tables (`bikes`, `host_profiles`) + 4 orphan policies, ~11 unused
columns, 0 dead app functions, 0 custom enums, 0 unused components, ~8 unused npm deps (2–3 high-confidence).

**Safe to drop in one cleanup migration (✅, low risk — features already removed):**
- Columns: `profiles.languages, verified_phone, cover_url, last_seen`; `host_locations.location_name,
  available_from, available_to, price_unit`; `reviews.tags`. *(Recreate `host_locations_public` after
  dropping its mirrored columns.)*
- npm: `@expo-google-fonts/rye`, `react-leaflet`.

**Confirm first (⏳ — possible planned feature):**
- Tables `bikes` + `host_profiles` and column `profiles.bike_model` — the old "bike/garage" concept.
- `host_locations.vehicle_types` + `profiles.vehicle_types` (+ HostOffer vehicle row) — a "what vehicle
  fits" feature would revive these.
- npm: `react-native-maps`, `@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-web-browser`,
  `expo-device`.

**Suggested approach:** one `cleanup` migration for the ✅ set (after Petr's OK), plus a separate
decision on the ⏳ "bike/vehicle" cluster. Nothing here is urgent or a security issue — it's hygiene.
