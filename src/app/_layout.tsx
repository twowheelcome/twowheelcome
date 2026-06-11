import { Stack } from 'expo-router'
import { C } from '../lib/theme'

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="become-host"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Stát se hostitelem',
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.accent,
          headerTitleStyle: { color: C.text, fontWeight: '700' },
          headerBackTitle: 'Zpět',
        }}
      />
    </Stack>
  )
}
