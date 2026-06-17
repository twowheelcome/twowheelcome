import { useEffect, useState } from 'react'
import { Tabs } from 'expo-router'
import { Platform, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTheme } from '../../lib/ThemeContext'
import { unreadStore } from '../../lib/unreadStore'
import { supabase } from '../../lib/supabase'

function TabIcon({ name, color, dot, C }: { name: React.ComponentProps<typeof Feather>['name']; color: string | import('react-native').ColorValue; dot?: boolean; C: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ width: 34, height: 30, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
      <Feather name={name} size={24} color={color} />
      {dot && (
        <View style={{
          position: 'absolute', top: -5, right: -7,
          width: 18, height: 18, borderRadius: 9,
          backgroundColor: C.accent, borderWidth: 3, borderColor: C.bg,
        }} />
      )}
    </View>
  )
}

async function checkUnread(userId: string) {
  const { data: convData } = await supabase
    .from('conversations')
    .select('id, user_a, user_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)

  if (!convData?.length) { unreadStore.set(false); return }

  const convIds = convData.map((c: any) => c.id)
  const { data: lastMsgs } = await supabase
    .from('messages')
    .select('conversation_id, sender_id')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })

  // For each conversation, check if the latest message is from someone else
  const seen = new Set<string>()
  let anyUnread = false
  for (const msg of lastMsgs ?? []) {
    if (seen.has(msg.conversation_id)) continue
    seen.add(msg.conversation_id)
    if (msg.sender_id !== userId) { anyUnread = true; break }
  }
  unreadStore.set(anyUnread)
}

export default function TabsLayout() {
  const C = useTheme()
  const [hasUnread, setHasUnread] = useState(unreadStore.get())

  useEffect(() => unreadStore.subscribe(setHasUnread), [])

  useEffect(() => {
    // Check unread immediately on mount (so dot shows right after login)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) checkUnread(user.id)
    })

    // Re-check when auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) checkUnread(session.user.id)
      else unreadStore.set(false)
    })

    return () => subscription.unsubscribe()
  }, [])

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
          href: null,
        }}
      />
    </Tabs>
  )
}
