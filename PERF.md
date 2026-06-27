# TWOWHEELCOME — Performance pass (2026-06-28)

Goal: speed only, **no behaviour/UI change**. Safe optimizations applied directly;
riskier/architectural items are listed below for Petr's sign-off (not applied).

---

## ✅ Applied (safe, shipped)

### 1. Hot-path DB indexes (live + baseline)
Indexed the columns the common screens filter/join on, which previously had no index:

| Table | Index | Used by |
|---|---|---|
| messages | `(conversation_id, created_at DESC)` | chat list, chat load, unread check |
| stay_requests | `(conversation_id)` | chat list request rows |
| stay_requests | `(guest_id)`, `(host_id)` | history, profile stats, notify-review |
| reviews | `(reviewee_id)`, `(reviewer_id)` | profile + host-profile reviews |
| conversations | `(user_b)` | chat list (`user_a` already covered by a composite) |
| host_locations | `(user_id)` | profile, My Places, become-host |

Non-destructive (`CREATE INDEX IF NOT EXISTS`).

**Measurement:** at the current tiny dataset (~62 messages, ~11 conversations) the
planner still chooses a seq scan because that's genuinely cheaper at this size — so
there is **no measurable win today**. These are **pre-scaling**: they start being used
automatically once the tables grow past a few hundred rows, avoiding seq-scan cliffs
on the busiest queries. Zero downside to having them now.

### 2. Memoized per-render `StyleSheet.create`
`Avatar`, `ContributionBadge`, `ReportButton`, `HostOffer`, `AppHeader` rebuilt their
stylesheet on **every render** via `makeStyles(C)`. These render many times per list
(map list, My Places, host profile, chat list). Wrapped in `useMemo([C])` → built once
per theme. Pure win, no behaviour change.

### 3. `conversationStatus` — single `makeStatus(C)` call
It allocated the status-map object **twice per conversation row**; now once per call.

---

## 🟡 Proposed (needs review — not applied)

Ordered by impact/effort. None applied because each risks a behaviour/layout regression
that wants a careful look, not a sleepy auto-merge.

### A. Virtualize the long lists (FlatList) — **high impact at scale, medium risk**
These render every row eagerly inside a `ScrollView` + `.map()`:
- conversation list (`requests.tsx`)
- map "list view" hosts (`map.tsx`, `filteredHosts.map`)
- History, My Places, Reviews, Blocked
Move to `FlatList` with `keyExtractor`, `initialNumToRender`, `windowSize`,
`removeClippedSubviews`, and `getItemLayout` where row height is fixed.
*Risk:* scroll/measure/nested-scroll regressions, esp. on web; needs device testing.
*Impact:* big once a user has dozens of chats/pins; negligible at a handful.

### B. Extract + `React.memo` the row components — **medium impact, medium risk**
Conversation row, map host card and place card are inline in the parent's `.map`, so
they re-render with the whole screen. Extract to memoized components with stable
(`useCallback`) handlers. Pairs naturally with (A).
*Risk:* prop plumbing; easy to introduce stale closures.

### C. HostMap markers — incremental update instead of full rebuild — **high impact (many pins), medium-high risk**
`addMarkers` does `clearLayers()` + re-create **every** marker + circle on any hosts
change. With many pins this is the map's main cost. Diff against the previous set and
only add/remove changed markers; memoize the divIcon HTML.
*Risk:* Leaflet/markercluster lifecycle is fiddly; regressions in clustering/markers.

### D. Image transforms for list thumbnails — **high bandwidth/memory win, low-medium risk**
`Avatar`, `ContributionBadge` and `ListingGallery` thumbnails load the **full-resolution**
original from `getPublicUrl` even at 32–88 px. Serve a resized variant for list/thumb
sizes via Supabase storage image transforms
(`getPublicUrl(path, { transform: { width, height, quality } })`), keeping full-res only
in the fullscreen lightbox.
*Risk:* image transforms must be enabled on the Supabase plan — verify first; visually
unchanged if so. Big win on data and decode time in lists.

### E. Narrow `select('*')` — **medium impact (payload), medium risk**
`map.tsx` (`host_locations_public`), `profile.tsx` and `become-host.tsx`
(`host_locations`) fetch all columns. Enumerate only the fields actually read.
*Risk:* must trace every consumed field (incl. nested usage) or a value silently goes
undefined — needs care, hence not auto-applied.

### F. Realtime `messages` subscription fan-out — **high impact at scale, medium risk**
`requests.tsx` subscribes to `postgres_changes` INSERT on `messages` with **no
server-side filter**, so every client receives every message insert app-wide and filters
client-side. Fine now; at scale it's N×M fan-out. Scope the binding (e.g. filter by the
user's conversation ids, or a dedicated per-user broadcast) so clients only get relevant
events.
*Risk:* realtime filter/RLS semantics; needs testing that nothing stops updating.

### G. Bundle/startup — **low-medium impact, low risk**
- `react-native-qrcode-svg` is only used in the profile "Share" modal — lazy-import it so
  it's not in the initial bundle.
- Confirm the Leaflet map screen is code-split on web (HostMap imports `leaflet` +
  `leaflet.markercluster` at module top). Lazy-loading the map route trims first paint.

---

## Notes
- No N+1 found in the hot paths — reviewer/profile lookups already batch via `.in(...)`.
- Realtime is a single lean channel (one messages INSERT + one stay_requests UPDATE), not
  an over-subscribe; only the fan-out scoping (F) is worth doing.
- Debouncing already in place on both geocoder inputs (AddressSearch, LocationPicker, 400 ms).
