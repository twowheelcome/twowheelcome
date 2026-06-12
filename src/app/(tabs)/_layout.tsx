import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { Platform, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { C } from '../../lib/theme'
import { unreadStore } from '../../lib/unreadStore'

function TabIcon({ name, color, dot }: { name: React.ComponentProps<typeof Feather>['name']; color: string; dot?: boolean }) {
  return (
    <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
      <Feather name={name} size={22} color={color} />
      {dot && (
        <View style={{
          position: 'absolute', top: 0, right: -2,
          width: 9, height: 9, borderRadius: 5,
          backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg,
        }} />
      )}
    </View>
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
          backgroundColor: C.surface,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingBottom: Platform.OS === 'ios' ? 24 : 12,
          paddingTop: 10,
        },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textDim,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <TabIcon name="map-pin" color={color} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <TabIcon name="message-circle" color={color} dot={hasUnread} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  )
}
