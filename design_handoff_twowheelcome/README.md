# Handoff: TWOWHEELCOME — visual redesign + core flow

## Overview
TWOWHEELCOME is a **moto-first** hospitality app: motorcycle travellers host
each other and — crucially — give each other's **bike a safe place to sleep**.
This package is the new **visual direction and feature set**, agreed with the
product owner. It replaces the old "from-the-hip" look and sharpens the product
around one killer insight:

> Hotels/Airbnb solve where *you* sleep. Nobody solves where your **motorcycle**
> sleeps. That — secure parking — is the whole point of this app.

The original app is **Czech-language Expo / React Native**; the product is being
**localised to English** (this redesign is English-first). Rider names and Czech
city names (Brno, Olomouc, Tábor) stay as realistic local content.

## About the design files
The files in this bundle are **design references created in HTML/React (web)** —
an interactive prototype showing the intended look and behaviour. They are **not
production code to copy**. The task is to **recreate these designs in the
existing Expo / React Native app** using its established patterns (the repo
already uses a `C` colour object in `src/lib/theme.ts`, `@expo-google-fonts/rye`
+ `oswald`, and `@expo/vector-icons` → Feather).

- `TWOWHEELCOME-app-demo.html` — open in any browser; this is the source of truth
  for layout & behaviour. (Log in with anything → Map → tap a pin → Knock.)
- `theme.ts` — **drop-in replacement** for `src/lib/theme.ts`: same `C` shape,
  new "Living Green" values, plus new `SAFETY`, `RADIUS`, `FONT`, `SPEED` exports.
- `logo.png` — the brand mark (transparent tyre-track badge).

## Fidelity
**High-fidelity.** Final colours, type, spacing, radii and interactions.
Recreate the screens faithfully in React Native using the values below.

---

## The 5 product rules (apply everywhere)
1. **Bike safety is the hero.** Every host leads with a coloured *parking-safety*
   block (🔒 Locked garage = Safest/green → 🏠 Carport = Good/blue → 🚧 Fenced
   yard = Okay/amber → 🛣️ Street = Basic/red). See `SAFETY` in `theme.ts`.
2. **Map first.** The main search is a map of host pins (coloured by safety), not
   a list. List is a secondary toggle. (No multi-day route planning — show what's
   bookable *now*.)
3. **Distance shown as TIME, terrain-aware.** A Road/Trail toggle recomputes every
   ETA (`SPEED` in `theme.ts`): same 12 km = ~10 min road / ~27 min trail.
4. **Privacy.** A host's pin is only an **approximate area** (a ~0.5 km fuzz
   circle) until they accept your request — then the **exact address unlocks**.
5. **Notifications, not babysitting.** The app pushes you (“knock sent”, “X
   accepted — address unlocked”, and after a stay “how was it?”). Riders won't
   refresh every 5 minutes.

Plus: **voluntary tips only** ("Free · beer welcome 🍺" — never a price/paywall),
and ⭐ **Buddy on the route** — a host you've stayed with & rated shows as a
gold-starred pin with their exact location saved.

---

## Screens / Views

### 1. Auth
- **Purpose:** log in / sign up.
- **Layout (top→bottom):** forest-gradient hero (~200px) with hand-built tree
  silhouettes + mist band; the **badge logo** (104px, overlapping into the hero);
  the `TWOWHEELCOME` wordmark in **Rye** (~34px, cream, soft shadow); a
  tyre-track rule (alternating terracotta dashes); then the form.
- **Components:** two pill inputs (`Email`, `Password`) with a leading Feather
  icon (`user`, `lock`); primary pill button **LOG IN** (terracotta, full width,
  54px, Oswald 700 uppercase); outline pill **SIGN UP**; "Forgot your password?"
  centered, `textDim`.

### 2. Find a host (PRIMARY — map)
- **Purpose:** find a safe garage near you, now.
- **Header:** "Find a host" (Oswald 700, 26px) + "N garages & yards near you";
  right side a **Map / List** segmented pill (Map default).
- **Map view:**
  - Stylised dark map (in production: a real map provider styled dark/warm).
  - **Host pins** = teardrop markers coloured by `SAFETY[level].color`, with the
    safety emoji. Selected pin is larger with a cream ring.
  - **Privacy:** each non-buddy host also renders a **dashed terracotta circle**
    (~96px) centred on the approximate point — the exact pin location is fuzzed.
  - **Buddy host:** gold (`C.buddy`) ring + a ⭐ above the pin, **no fuzz circle**
    (exact, saved).
  - **"You" marker:** cream dot, terracotta ring, soft glow.
  - **Overlays:** top search pill ("Search this area" + "📍 Near me"); filter
    chips (`Locked garage`, `Open now` [green when active], `Free`); a floating
    **🛣 Road / ⛰ Trail** toggle (bottom-left) that changes every ETA.
  - **Bottom sheet card** for the selected host: avatar (+green dot if open),
    name (+ ⭐ Buddy tag), 🏍 bike model, big terracotta **ETA** (e.g. "~10 min")
    with "{km} km · {mode}" under it, the **SafetyBlock**, and a privacy line
    ("🔒 Approx. area — exact spot unlocks when they accept" / for buddy "⭐
    You've stayed here · exact address saved"). Tapping opens the Knock screen.
- **List view (secondary):** same hosts as cards sorted by distance; each card =
  identity row + SafetyBlock + sleep/tip line.

**SafetyBlock** (reused everywhere): a rounded 14px block tinted at ~12% of the
safety colour with a ~45% border; large emoji; bold Oswald label + a small
outlined rank pill ("Safest"/"Good"/…); a one-line description; "🏍 parking" hint.

### 3. Knock on the door (request)
- **Purpose:** request a stay.
- **Header:** "← Back" (terracotta) + "KNOCK ON THE DOOR 🤞" (Oswald 700).
- **Cards (radius 20, surface, hairline border):**
  1. Host summary — avatar, name, 🏍 bike · 📍 city, km away, **SafetyBlock**, notes.
  2. "Riders in your party" — `Counter` (− value +), capped at host's maxGuests.
  3. "When are you arriving?" — two pill chips **🌙 Tonight / ☀️ Tomorrow**
     (active = terracotta soft-fill + border).
  4. "Photo of your bike" — dashed upload tile; filled state shows ✅ "Bike photo
     added". (Helps the host recognise you; ties into the request.)
  5. "Message to host" — multiline textarea (elevated, radius 12).
- **CTA:** full-width terracotta **Send request →**.

### 4. Chat (Chats tab)
- **List:** conversation rows (avatar +unread dot, name, preview, date, "Pending"
  tag). Two segmented tabs "My requests / Chats".
- **Thread (traveller side — your knock):** a **YOUR KNOCK** card with a status
  badge (Pending terracotta → **Accepted** green). While pending it shows a
  locked block "🔒 Approx. area for now — exact address shows the moment {host}
  accepts." On accept it flips to a green **🔓 ADDRESS UNLOCKED** block with the
  exact street ("U Garáže 7, Tábor") and a **🧭 Navigate** button.
- **Thread (host side — incoming request):** a STAY REQUEST card with dates,
  arrival, riders, the quoted message, and **✓ Accept / ✕ Decline** buttons.
- **Composer:** pill text input + round terracotta send button.

### 5. Profile
- Gradient hero; ringed avatar (84px) with a camera badge.
- Name (Oswald 800) + edit pencil; 🏍 **bike model**; email.
- **"Your place"** card — your offered parking as a SafetyBlock (🔒 Locked garage
  · Safest), sleep + max riders, "Free · beer welcome 🍺" and an **Open** tag.
- Stats row (spots / nights / trips).
- Menu rows: **Edit my place** (shield), **Stay history** (clock), **Settings**.
- "Log out" (underlined, faint).

---

## Interactions & behaviour
- **Tabs:** Map · Chats (unread dot) · Profile. Tab bar hides on the Knock screen
  and inside a chat thread.
- **Knock → accept flow (demo simulates the backend):** Send request → push
  notification "Knock sent" → conversation created (status pending) → after the
  host accepts, push "X accepted — address unlocked" and the thread reveals the
  exact address + Navigate. In production this is driven by the host actually
  tapping Accept (real-time via your Supabase backend + push notifications).
- **Notification banner:** push-style card drops from the top (~280ms ease-out),
  auto-dismisses after a few seconds, tap to open the thread.
- **Press states:** buttons scale to 0.97; chips/cards swap to soft-tint + accent
  border when active. Touch targets ≥ 44px. Animations are short & functional —
  no bounces or infinite loops.

## State (per screen, minimal)
- Map: `view` (map|list), `mode` (road|trail), `filters[]`, `selectedHostId`.
- Knock: `guests`, `when`, `photoAttached`, `message`.
- App: `authed`, `tab`, `requestHost`, `openThread`, `accepted{hostId}`,
  `notification`, `conversations[]`.
- Host model: `{ id, name, bike, city, area, address, km, lat/lng, open, buddy,
  safety, sleep, tip, maxGuests, notes }` — `address` only sent to the client
  **after** the host accepts (enforce server-side for real privacy).

## Design tokens
All in `theme.ts` (palette, `SAFETY`, `RADIUS`, `FONT`, `SPEED`). Highlights:
- Canvas `#0E0D09`, surface `#201E15`, elevated `#2D2A1B`, border `#463F2B`.
- Action terracotta `#C47050`; availability/success moss `#76C085`; buddy gold
  `#E0A23C`; info `#5A8FAE`, warning `#D08049`, error `#CB4636`.
- Text `#F0E8D7` / muted `#C0B08B` / dim `#897C5C`.
- Radii: pill 100 (buttons/chips/inputs/avatars), card 20.
- Flat UI: 1px hairline borders, **not** shadows (one float shadow on map sheet).

## Typography & fonts
- **Rye** — logo/hero only. **Oswald** (700–900, uppercase, tracked) — headings,
  labels, buttons. **System sans** — body & chat. Fonts already in the app via
  `@expo-google-fonts/rye` + `@expo-google-fonts/oswald`.

## Iconography
- **Feather** (already `@expo/vector-icons`) for UI: `map-pin`, `message-circle`,
  `user`, `home`/`shield`, `camera`, `edit-2`, `settings`, `clock`, `lock`,
  `search`. Stroke 2, tinted terracotta.
- **Emoji** as category glyphs: 🏍 🔒 🏠 🚧 🛣️ 🛏 ⛺ 🚿 🍺 🤞 ⭐ 🧭. Never hand-draw SVG icons.

## Assets
- `logo.png` — tyre-track badge (terracotta moto half + forest bicycle half),
  transparent. Use for app icon / splash / avatar fallback and the auth lockup.
  Replace the old default-Expo `assets/images/icon.png` with this.

## Files in this bundle
- `TWOWHEELCOME-app-demo.html` — the interactive reference prototype.
- `theme.ts` — drop-in palette + tokens.
- `logo.png` — brand mark.
- `PROMPT.txt` — a ready-to-paste instruction for your terminal AI.

## Future (don't build yet, but design leaves room for it)
- Reviews after a stay (notification "how was it?"), then a **voluntary** "send
  the app's creator €1 thanks" — same opt-in spirit as the host beer. No paywall.
