import { loadNotifications } from './notifications'

// Tiny pub/sub for the unread notification-badge count (mirrors unreadStore). The header
// bell subscribes; screens call refreshNotificationCount() on focus / auth change.
type Listener = (n: number) => void

let count = 0
let listeners: Listener[] = []

export const notificationStore = {
  get: () => count,
  set: (n: number) => { count = n; listeners.forEach(l => l(n)) },
  subscribe: (l: Listener) => {
    listeners.push(l)
    return () => { listeners = listeners.filter(x => x !== l) }
  },
}

export async function refreshNotificationCount(userId: string): Promise<void> {
  try {
    const { unreadCount } = await loadNotifications(userId)
    notificationStore.set(unreadCount)
  } catch (e) {
    console.warn('refreshNotificationCount error:', e)
  }
}
