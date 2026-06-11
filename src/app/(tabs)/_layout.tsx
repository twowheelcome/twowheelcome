import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { Platform, Text, View } from 'react-native'
import { C } from '../../lib/theme'
import { unreadStore } from '../../lib/unreadStore'

function Icon({ e, dot }: { e: string; dot?: boolean }) {
  return (
    <View style={{ width: 32, height: 28, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
      <Text style={{ fontSize: 22, lineHeight: 26 }}>{e}</Text>
      {dot && (
        <View style={{
          position: 'absolute', top: 0, right: 0,
          width: 14, height: 14, borderRadius: 7,
          backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg,
        }} />
      )}
    </View>
  )
}

function Label({ title, focused }: { title: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: '700', color: focused ? C.accent : C.text }}>
      {title}
    </Text>
  )
}

export default function TabsLayout() {
  const [hasUnread, setHasUnread] = useState(unreadStore.get())

  useEffect(() => unreadStore.subscribe(setHasUnread), [])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopColor: C.surface,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 82 : 68,
          paddingBottom: Platform.OS === 'ios' ? 22 : 12,
          paddingTop: 8,
        },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.text,
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: 'Mapa',
          tabBarIcon: ({ focused }) => <Icon e="🗺" />,
          tabBarLabel: ({ focused }) => <Label title="Mapa" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Žádosti',
          tabBarIcon: ({ focused }) => <Icon e="📬" dot={hasUnread} />,
          tabBarLabel: ({ focused }) => <Label title="Žádosti" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <Icon e="👤" />,
          tabBarLabel: ({ focused }) => <Label title="Profil" focused={focused} />,
        }}
      />
    </Tabs>
  )
}
