// Voluntary, low-key "support the developer" link. Swap this placeholder for the
// real destination when ready (Stripe / Revolut / BuyMeACoffee / etc.). The UI is
// wired to it: with a non-empty URL the row opens it; while empty it shows a
// friendly "coming soon" instead. Never a paywall — purely optional.
export const SUPPORT_URL = ''

export function hasSupportLink(): boolean {
  return SUPPORT_URL.trim().length > 0
}
