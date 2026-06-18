// A one-shot request to open a specific conversation in the Messages tab.
//
// Set it right before navigating to Messages; the screen consumes it when it gains
// focus. This is deliberately a module store, not a route param: the Messages tab
// stays mounted across tab switches, so a param-driven effect won't re-run on a
// re-focus — but useFocusEffect fires on every focus, and the store always carries
// the latest target. That makes "open this exact chat" work whether the screen is
// freshly mounted or just re-focused, and regardless of which chat was open before.

export type PendingChat = { convId: string; reviewRequestId?: string | null }

let _pending: PendingChat | null = null

export const pendingChatStore = {
  set(p: PendingChat) { _pending = p },
  // Returns the pending request once, then clears it.
  consume(): PendingChat | null { const v = _pending; _pending = null; return v },
}
