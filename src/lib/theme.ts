// TWO WHEELCOME – design system colors
// Dark mode as default, outdoor/adventure character

export const C = {
  // ── Backgrounds (darkest → lightest) ──────────────────────────
  bg:        '#1A2229',  // main page background — night sky
  surface:   '#202D38',  // cards, panels
  elevated:  '#263444',  // inputs, chips, counter buttons
  border:    '#2E3E4E',  // standard borders
  borderMid: '#3A4E5E',  // lighter borders / dividers
  hover:     '#2A3A4A',  // hover / pressed states

  // ── Text hierarchy ─────────────────────────────────────────────
  text:        '#F4F1EA',  // primary text — warm sand
  textMuted:   '#B8B2A9',  // secondary labels
  textDim:     '#637080',  // tertiary / metadata
  textFaint:   '#4A5A68',  // disabled / placeholder hints
  placeholder: '#8C8880',  // input placeholders

  // ── Accent / CTA ───────────────────────────────────────────────
  accent:       '#E67E22',   // adventure orange — buttons, active states
  accentSoft:   '#E67E2218', // tinted backgrounds
  accentBorder: '#E67E2255', // tinted borders

  // ── Khaki — online status, outdoor subtle accents ──────────────
  khaki:       '#3B4D3C',
  khakiSoft:   '#3B4D3C20',
  khakiBorder: '#3B4D3C60',

  // ── Semantic (success / error / warning / info) ────────────────
  success:       '#22c55e',
  successSoft:   '#22c55e18',
  successBorder: '#22c55e55',

  error:       '#ef4444',
  errorSoft:   '#ef444418',
  errorBorder: '#ef444455',

  warning:     '#f59e0b',
  warningSoft: '#f59e0b15',
  warningBorder: '#f59e0b55',

  info:      '#3b82f6',
  infoSoft:  '#3b82f615',
  infoBorder: '#3b82f655',

  purple:      '#a855f7',
  purpleSoft:  '#a855f715',
  purpleBorder: '#a855f755',

  // ── Base ───────────────────────────────────────────────────────
  white: '#ffffff',
  black: '#000000',
} as const
