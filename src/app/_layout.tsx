import { useEffect, useRef } from 'react'
import { router, Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { useFonts, Oswald_500Medium, Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter'
import { ThemeProvider, useTheme } from '../lib/ThemeContext'
import { LanguageProvider } from '../lib/i18n'
import { Toast } from '../components/Toast'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { registerPushToken } from '../lib/pushNotifications'

// Expo Router uses this exported ErrorBoundary to catch render crashes app-wide.
export { ErrorBoundary } from '../components/AppErrorBoundary'

SplashScreen.preventAutoHideAsync()

// A push notification's data.url is attacker-influenceable, so we never route to it blindly.
// Allow only known internal relative routes (no scheme, no protocol-relative, leading '/'),
// matching what our own notify-* functions emit; anything else falls back to the inbox.
function safeNotifRoute(raw: unknown): string {
  const fallback = '/(tabs)/requests'
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes(':')) return fallback
  const path = raw.split('?')[0]
  const allowed = ['/requests', '/(tabs)/requests', '/notifications', '/reviews']
  return (allowed.includes(path) || path.startsWith('/host/')) ? raw : fallback
}

function AppStack() {
  const C = useTheme()

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="become-host"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Become a Host',
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.accent,
          headerTitleStyle: { color: C.text, fontWeight: '700' },
          headerBackTitle: 'Back',
        }}
      />
    </Stack>
  )
}

export default function RootLayout() {
  const notifSubRef = useRef<Notifications.Subscription | null>(null)
  const [fontsLoaded] = useFonts({
    Oswald_500Medium, Oswald_600SemiBold, Oswald_700Bold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  })

  useEffect(() => {
    // Hide the splash only once fonts are ready, so the UI doesn't flash in system font first.
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) registerPushToken(user.id)
    })

    // Sync full_name from auth metadata to profiles on first login
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        const user = session.user
        // Register the push token on a fresh in-session login too (mount only covers
        // cold starts). registerPushToken is idempotent and non-fatal.
        registerPushToken(user.id)
        const metaName = user.user_metadata?.full_name as string | undefined
        if (metaName) {
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
          if (!prof?.full_name) {
            await supabase.from('profiles').update({ full_name: metaName }).eq('id', user.id)
          }
        }
      }
    })

    notifSubRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      router.push(safeNotifRoute(response.notification.request.content.data?.url) as never)
    })

    return () => { subscription.unsubscribe(); notifSubRef.current?.remove() }
  }, [])

  if (!fontsLoaded) return null

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <AppStack />
          <Toast />
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
