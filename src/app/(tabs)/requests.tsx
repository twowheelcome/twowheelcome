import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { supabase } from '../../lib/supabase'

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: '⏳ Čeká na odpověď', color: '#f59e0b' },
  ACCEPTED: { label: '✅ Přijato', color: '#22c55e' },
  REJECTED: { label: '❌ Odmítnuto', color: '#ef4444' },
}

export default function RequestsScreen() {
  const [tab, setTab] = useState<'sent' | 'received'>('sent')
  const [sent, setSent] = useState<any[]>([])
  const [received, setReceived] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setCurrentUser(user); loadRequests(user.id) }
    })
  }, [])

  async function loadRequests(userId: string) {
    setLoading(true)
    const [s, r] = await Promise.all([
      supabase
        .from('stay_requests')
        .select('*, host:profiles!host_id(full_name), host_profile:host_profiles!host_id(location_city, location_country)')
        .eq('guest_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('stay_requests')
        .select('*, guest:profiles!guest_id(full_name)')
        .eq('host_id', userId)
        .order('created_at', { ascending: false }),
    ])
    setSent(s.data || [])
    setReceived(r.data || [])
    setLoading(false)
  }

  async function respond(id: string, status: 'ACCEPTED' | 'REJECTED') {
    await supabase.from('stay_requests').update({ status }).eq('id', id)
    if (currentUser) loadRequests(currentUser.id)
  }

  const list = tab === 'sent' ? sent : received

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ŽÁDOSTI</Text>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'sent' && styles.tabActive]}
            onPress={() => setTab('sent')}
          >
            <Text style={[styles.tabText, tab === 'sent' && styles.tabTextActive]}>
              📤 Poslaté {sent.length > 0 ? `(${sent.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'received' && styles.tabActive]}
            onPress={() => setTab('received')}
          >
            <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>
              📥 Přijaté {received.length > 0 ? `(${received.length})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e8631a" size="large" />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>{tab === 'sent' ? '📤' : '📭'}</Text>
          <Text style={styles.emptyTitle}>
            {tab === 'sent' ? 'Zatím jsi nikomu neklepal' : 'Nikdo ti ještě neklepal'}
          </Text>
          <Text style={styles.emptyText}>
            {tab === 'sent'
              ? 'Na záložce Mapa najdi hostitele a pošli žádost.'
              : 'Až někdo pošle žádost o ubytování, uvidíš ji tady.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {list.map((req) => {
            const s = statusConfig[req.status] || statusConfig.PENDING
            return (
              <View key={req.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.badge, { backgroundColor: s.color + '20', borderColor: s.color + '60' }]}>
                    <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
                  </View>
                  <Text style={styles.date}>{req.arrival_date} → {req.departure_date}</Text>
                </View>

                {tab === 'sent' && req.host?.full_name ? (
                  <View style={styles.personRow}>
                    <View style={styles.personAvatar}>
                      <Text style={styles.personAvatarText}>{req.host.full_name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={styles.personName}>{req.host.full_name}</Text>
                      {req.host_profile?.location_city ? (
                        <Text style={styles.personSub}>📍 {req.host_profile.location_city}, {req.host_profile.location_country}</Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                {tab === 'received' && req.guest?.full_name ? (
                  <View style={styles.personRow}>
                    <View style={styles.personAvatar}>
                      <Text style={styles.personAvatarText}>{req.guest.full_name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={styles.personName}>{req.guest.full_name}</Text>
                      <Text style={styles.personSub}>jezdec</Text>
                    </View>
                  </View>
                ) : null}

                <Text style={styles.guests}>
                  👥 {req.guests_count} {req.guests_count === 1 ? 'jezdec' : 'jezdci'}
                </Text>

                {req.message ? (
                  <Text style={styles.message} numberOfLines={4}>"{req.message}"</Text>
                ) : null}

                {tab === 'received' && req.status === 'PENDING' && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => respond(req.id, 'ACCEPTED')}>
                      <Text style={styles.acceptBtnText}>✓ PŘIJMOUT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => respond(req.id, 'REJECTED')}>
                      <Text style={styles.rejectBtnText}>✕ ODMÍTNOUT</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: { padding: 20, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#2d2d2d' },
  title: { color: '#eee', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  tabActive: { backgroundColor: '#e8631a', borderColor: '#e8631a' },
  tabText: { color: '#555', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#eee', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: '#2d2d2d', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#333', gap: 10, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  date: { color: '#555', fontSize: 11 },
  guests: { color: '#aaa', fontSize: 13 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e8631a', alignItems: 'center', justifyContent: 'center' },
  personAvatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  personName: { color: '#eee', fontWeight: '700', fontSize: 14 },
  personSub: { color: '#555', fontSize: 11, marginTop: 1 },
  message: { color: '#777', fontSize: 13, lineHeight: 19, fontStyle: 'italic', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 10 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  acceptBtn: { flex: 1, backgroundColor: '#22c55e', borderRadius: 8, padding: 11, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
  rejectBtn: { flex: 1, borderRadius: 8, padding: 11, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444' },
  rejectBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
})
