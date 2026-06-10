import { Tabs } from 'expo-router'
import { Platform, Text } from 'react-native'

function Icon({ e }: { e: string }) {
  return <Text style={{ fontSize: 22, lineHeight: 26 }}>{e}</Text>
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111',
          borderTopColor: '#222',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 82 : 62,
          paddingBottom: Platform.OS === 'ios' ? 22 : 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#e8631a',
        tabBarInactiveTintColor: '#444',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="map"
        options={{ title: 'Mapa', tabBarIcon: () => <Icon e="🗺" /> }}
      />
      <Tabs.Screen
        name="requests"
        options={{ title: 'Žádosti', tabBarIcon: () => <Icon e="📬" /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: () => <Icon e="👤" /> }}
      />
    </Tabs>
  )
}
