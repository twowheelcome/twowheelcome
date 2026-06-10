import { Stack } from 'expo-router'

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
          headerStyle: { backgroundColor: '#1a1a1a' },
          headerTintColor: '#e8631a',
          headerTitleStyle: { color: '#eee', fontWeight: '700' },
          headerBackTitle: 'Zpět',
        }}
      />
    </Stack>
  )
}
