import { useCallback, useEffect, useState } from 'react'
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { notificationStore, refreshNotificationCount } from '../lib/notificationStore'

// Header bell: shows the unread notification count and opens the Notifications screen.
export function NotificationBell() {
  const C = useTheme()
  const styles = makeStyles(C)
  const [count, setCount] = useState(notificationStore.get())

  useEffect(() => notificationStore.subscribe(setCount), [])

  // Refresh whenever a screen carrying the bell gains focus, and on auth changes.
  useFocusEffect(useCallback(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) refreshNotificationCount(user.id)
      else notificationStore.set(0)
    })
  }, []))

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) refreshNotificationCount(session.user.id)
      else notificationStore.set(0)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={() => router.push('/activity' as never)}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      hitSlop={8}
    >
      <Feather name="bell" size={22} color={C.text} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

function makeStyles(C: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    btn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    badge: {
      position: 'absolute', top: 2, right: 2,
      minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
      backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg,
      alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { color: C.white, fontSize: 10, fontWeight: '800' },
  })
}
