import { useEffect, useRef, useState } from 'react'
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

  if (!convData?.length) return false

  const convIds = convData.map((c: any) => c.id)
  const [{ data: lastMsgs }, { data: reads }] = await Promise.all([
    supabase.from('messages')
      .select('conversation_id, sender_id, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false }),
    supabase.from('conversation_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId),
  ])

  const readMap: Record<string, string> = {}
  reads?.forEach((r: any) => { readMap[r.conversation_id] = r.last_read_at })

  // Unread if the latest message in a conversation is from someone else and is
  // newer than this user's last read of that conversation.
  const seen = new Set<string>()
  for (const msg of lastMsgs ?? []) {
    if (seen.has(msg.conversation_id)) continue
    seen.add(msg.conversation_id)
    if (msg.sender_id === userId) continue
    const lastRead = readMap[msg.conversation_id]
    if (!lastRead || new Date(msg.created_at).getTime() > new Date(lastRead).getTime()) return true
  }
  return false
}

export default function TabsLayout() {
  const C = useTheme()
  const [hasUnread, setHasUnread] = useState(unreadStore.get())
  const authUserIdRef = useRef<string | null>(null)

  useEffect(() => unreadStore.subscribe(setHasUnread), [])

  useEffect(() => {
    // Check unread immediately on mount (so dot shows right after login)
    supabase.auth.getUser().then(({ data: { user } }) => {
      authUserIdRef.current = user?.id ?? null
      if (user) checkUnread(user.id).then((anyUnread) => {
        if (authUserIdRef.current === user.id) unreadStore.set(anyUnread)
      })
      else unreadStore.set(false)
    })

    // Re-check when auth state changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null
      authUserIdRef.current = userId
      unreadStore.set(false)
      if (userId) {
        checkUnread(userId).then((anyUnread) => {
          if (authUserIdRef.current === userId) unreadStore.set(anyUnread)
        })
      }
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
