import { Platform } from 'react-native'
import { supabase } from './supabase'

// Web Push (PWA) client. Web-only; every function is a no-op / guarded off native. The VAPID
// PUBLIC key is safe to ship to the client (public by design); overridable via env.
const VAPID_PUBLIC_KEY =
  process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ||
  'BOKVyESMK8Q3GQ1GDKee1xLiYx3ezWI2G1QfWpn4W2Pec6YsHt3DHRLc3dSKABxwf1zib94FRcPNbuX-zfTFhGw'

export type WebPushResult = 'subscribed' | 'denied' | 'unsupported' | 'needs-install' | 'error'

export function isWebPushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// True when running as an installed PWA (Add to Home Screen). iOS only allows web push here.
export function isStandalonePwa(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false
  const mm = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return mm || iosStandalone
}

export function isIos(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iOSDevice = /iphone|ipad|ipod/i.test(ua)
  // iPadOS reports as Mac; detect via touch.
  const iPadOS = navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ? (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1 : false
  return iOSDevice || iPadOS
}

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// Must be called from a user gesture (permission prompt requirement).
export async function enableWebPush(userId: string): Promise<WebPushResult> {
  if (Platform.OS === 'web' && isIos() && !isStandalonePwa()) return 'needs-install'
  if (!isWebPushSupported()) return 'unsupported'
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Uint8Array is a valid BufferSource at runtime; cast past the lib.dom generic mismatch.
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      })
    }
    const json = sub.toJSON()
    const endpoint = json.endpoint
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!endpoint || !p256dh || !auth) return 'error'
    const { error } = await supabase
      .from('web_push_subscriptions')
      .upsert({ user_id: userId, endpoint, p256dh, auth, user_agent: navigator.userAgent }, { onConflict: 'endpoint' })
    if (error) { console.warn('web push save error:', error.message); return 'error' }
    return 'subscribed'
  } catch (e) {
    console.warn('enableWebPush error:', e)
    return 'error'
  }
}

export async function disableWebPush(): Promise<void> {
  if (!isWebPushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch (e) {
    console.warn('disableWebPush error:', e)
  }
}

export async function isWebPushEnabled(): Promise<boolean> {
  if (!isWebPushSupported()) return false
  try {
    if (Notification.permission !== 'granted') return false
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}
