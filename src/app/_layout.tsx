import { useEffect, useRef } from 'react'
import { Stack } from 'expo-router'
import { useFonts as useOswald, Oswald_700Bold } from '@expo-google-fonts/oswald'
import { useFonts as useRye, Rye_400Regular } from '@expo-google-fonts/rye'
import * as SplashScreen from 'expo-splash-screen'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import { C } from '../lib/theme'
import { supabase } from '../lib/supabase'
import { registerPushToken } from '../lib/pushNotifications'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [o] = useOswald({ Oswald_700Bold })
  const [r] = useRye({ Rye_400Regular })
  const fontsLoaded = o && r
  const notifSubRef = useRef<Notifications.Subscription | null>(null)

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) registerPushToken(user.id)
    })

    // Tap on notification → open Chats tab
    notifSubRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url
      if (typeof url === 'string') router.push(url as any)
      else router.push('/(tabs)/requests')
    })

    return () => { notifSubRef.current?.remove() }
  }, [])

  if (!fontsLoaded) return null

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
