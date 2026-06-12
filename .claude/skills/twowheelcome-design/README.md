# TWOWHEELCOME — Design System

> Warmshowers pro dvě kola. A community app where motorcycle and bicycle travelers open their **garages, yards and couches** to each other. ADV, enduro, gravel, MTB, touring. No ads. Free.

---

## Product context

TWOWHEELCOME is a **mobile app (iOS + Android)** built with Expo / React Native + Supabase. It is a peer hospitality network for two-wheel travelers — riders host other riders. Core loop:

- **Become a host** — pin your location, say what you offer (locked garage, carport, yard, street parking; tent / roof / room; amenities; how many riders; free / tip / paid), add a note.
- **Find hosts on the route** — browse a list or map, filter by vehicle, parking, sleeping and pricing.
- **Knock on the door** ("Klepu na dveře") — send a stay request with dates, rider count, a photo of your bike and a message.
- **Chat** — the request opens a conversation; the host accepts or rejects; riders coordinate the rest directly.

The product is **Czech-language**, informal and warm, built for a tight community of enthusiasts rather than a mass marketplace.

---

## CONTENT FUNDAMENTALS

- **Language:** Czech, always.
- **Person & tone:** Informal second person — "ty". Never formal vy, never corporate.
- **Voice:** Warm, plain-spoken, a little cheeky. "Buď první! Otevři dveře komunitě."
- **Casing:** UPPERCASE labels with wide tracking; Oswald buttons uppercase; body sentence case.
- **Emoji:** Used as glyphs and punctuation: 🏍 🚴 🔒 ⛺ 🛏 🚿 🍺 🤞 🤘 🎉
- **Signature phrases:** "Klepu na dveře", "hostitel", "jezdec / jezdci", "na trase", "Stát se hostitelem"
- **Punctuation:** Arrows on forward actions ("→"), questions as labels ("Koho vítám?"), em-dashes for asides.

**Do:** "Ahoj, jedu přes tvoje město — máš místo?" **Don't:** "Please complete your host onboarding flow."

---

## VISUAL FOUNDATIONS

- **Mood:** Rugged adventure, vintage travel badge, campfire-at-dusk. Warm, earthy, analog.
- **Background:** `#100C08` everywhere. Depth from `surface #1E1510` → `elevated #2A1C12`. Hero areas: forest-green gradients + tree silhouettes + mist band.
- **Color:** Terracotta `#C47050` is the only primary action color. Forest green `#2D4A2D` and leather brown `#3D2314` are structural/earthy.
- **Type:** Rye (wordmark/display only). Oswald 700–900 (headings, labels, buttons). System sans (body, chat).
- **Shape:** Pill (radius 100) for buttons/chips/tags/inputs/avatars. Radius 20 for cards.
- **Borders over shadows:** Flat UI. 1px hairline borders `#3D2A18`. Shadow only on floating map chips.
- **Spacing:** 4px-based. 16 card padding, 20 screen gutter (24 on auth/profile).
- **Animation:** Minimal — short fades, 0.97 press scale. No bounces, no parallax.

---

## COLOR TOKENS

```
bg:          #100C08   near-black warm brown
surface:     #1E1510   cards, panels
elevated:    #2A1C12   inputs, chips
border:      #3D2A18   hairline

accent:      #C47050   terracotta rust (primary action)
forest:      #2D4A2D   forest green (bicycle, structural)
leather:     #3D2314   saddle leather brown

text:        #EDE5D5   warm cream
textMuted:   #A89070
textDim:     #6A5040

success:     #5A9C6E
error:       #C04030
warning:     #C87040
info:        #4A7C9C
```

---

## ICONOGRAPHY

1. **Feather icons** — all UI affordances (map-pin, message-circle, user, home, camera, edit-2, settings, clock, lock). Stroke-width 2, terracotta tint.
2. **Emoji** — category glyphs: vehicles (🏍 🚴), parking (🔒 🔐 🛡 🛣), sleep (⛺ 🏠 🛏), amenities (🚿 🍳 👕 ⚡ 📶 🍺 ☕ 🗺), pricing (🤝 🙏 💶).

No custom SVG icons. No icon font beyond Feather.

---

## LOGO

Split tire-track badge — terracotta motorcycle half (left) + forest bicycle half (right).

- `assets/images/icon.png` — app icon / splash (on dark background)
- Use solo for app-icon/avatar/splash, or locked up beside Rye TWOWHEELCOME wordmark.
- Oswald-black `TWO·WHEEL·COME` split-accent = inline text lockup.
