import { useEffect, useRef } from 'react'
import { router, Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { useFonts, Oswald_500Medium, Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter'
import { ThemeProvider, useTheme } from '../lib/ThemeContext'
import { LanguageProvider } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { registerPushToken } from '../lib/pushNotifications'

// Expo Router uses this exported ErrorBoundary to catch render crashes app-wide.
export { ErrorBoundary } from '../components/AppErrorBoundary'

SplashScreen.preventAutoHideAsync()

function AppStack() {
  const C = useTheme()

  return (
    <Stack screenOptions={{ headerShown: false }}>
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
      const url = response.notification.request.content.data?.url
      if (typeof url === 'string') router.push(url as any)
      else router.push('/(tabs)/requests')
    })

    return () => { subscription.unsubscribe(); notifSubRef.current?.remove() }
  }, [])

  if (!fontsLoaded) return null

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppStack />
      </LanguageProvider>
    </ThemeProvider>
  )
}
