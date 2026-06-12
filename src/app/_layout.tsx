import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { useFonts as useOswald, Oswald_700Bold } from '@expo-google-fonts/oswald'
import { useFonts as useRye, Rye_400Regular } from '@expo-google-fonts/rye'
import * as SplashScreen from 'expo-splash-screen'
import { C } from '../lib/theme'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [o] = useOswald({ Oswald_700Bold })
  const [r] = useRye({ Rye_400Regular })
  const fontsLoaded = o && r

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

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
