import { useEffect, useRef } from 'react'
import { router, Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { ThemeProvider, useTheme } from '../lib/ThemeContext'
import { supabase } from '../lib/supabase'
import { registerPushToken } from '../lib/pushNotifications'

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

  useEffect(() => {
    SplashScreen.hideAsync()
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) registerPushToken(user.id)
    })

    // Sync full_name from auth metadata to profiles on first login
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        const user = session.user
        const metaName = user.user_metadata?.full_name as string | undefined
        if (metaName) {
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
          if (!prof?.full_name) {
            await supabase.from('profiles').upsert({ id: user.id, full_name: metaName })
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

  return (
    <ThemeProvider>
      <AppStack />
    </ThemeProvider>
  )
}
