// A one-shot "finish this knock after you log in" hand-off.
//
// A logged-out rider can fill in the Request-a-stay form; when they hit Send we
// stash the host + their drafted message + dates here and send them to sign-up.
// After auth the Map tab consumes this (once) and reopens the form pre-filled, so
// the rider continues exactly where they left off instead of losing everything.
//
// Module store (not a route param): the draft can be long and is private, and the
// Map tab stays mounted across navigation, so a store consumed on focus is the
// reliable hand-off. In-memory only — cleared on reload, like the other stores.

export type PendingKnock = {
  hostUserId: string
  locationId: string
  message: string
  arrivalDate: string
  departureDate: string
  arrivalChip: 'tonight' | 'tomorrow' | 'other'
  guestsCount: number
  arrivalTime: string | null
}

let _pending: PendingKnock | null = null

export const pendingKnockStore = {
  set(p: PendingKnock) { _pending = p },
  // Returns the pending knock once, then clears it.
  consume(): PendingKnock | null { const v = _pending; _pending = null; return v },
}
