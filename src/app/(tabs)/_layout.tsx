import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { Platform, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { unreadStore } from '../../lib/unreadStore'

function TabIcon({ name, color, dot, C }: { name: React.ComponentProps<typeof Feather>['name']; color: string | import('react-native').ColorValue; dot?: boolean; C: ReturnType<typeof useTheme> }) {
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
  const C = useTheme()
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
          height: Platform.OS === 'ios' ? 92 : 76,
          paddingBottom: Platform.OS === 'ios' ? 26 : 10,
          paddingTop: 8,
        },
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textMuted,
        tabBarItemStyle: {
          paddingTop: 2,
          paddingBottom: 2,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
          lineHeight: 14,
          marginTop: 0,
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <TabIcon name="map-pin" color={color} C={C} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <TabIcon name="message-circle" color={color} dot={hasUnread} C={C} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon name="user" color={color} C={C} />,
        }}
      />
    </Tabs>
  )
}
