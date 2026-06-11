import { useEffect, useRef, useState } from 'react'
import {
  FlatList, Image, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { C } from '../../lib/theme'

// ── Types ──────────────────────────────────────────────────────────────────

type OtherUser = { id: string; full_name: string | null }

type ConvRow = {
  id: string
  user_a: string
  user_b: string
  last_message_at: string
  other: OtherUser
}

type RequestData = {
  id: string
  arrival_date: string
  departure_date: string
  arrival_time: string | null
  guests_count: number
  guest_vehicle: string | null
  status: string
  photo_url: string | null
  host_id: string
  guest_id: string
}

type MsgRow = {
  id: string
  conversation_id: string
  sender_id: string
  sender_name: string | null
  body: string | null
  photo_url: string | null
  request_id: string | null
  request: RequestData | null
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

const statusLabel: Record<string, { text: string; color: string }> = {
  PENDING:  { text: '⏳ Čeká na odpověď', color: C.warning },
  ACCEPTED: { text: '✅ Přijato',          color: C.success },
  REJECTED: { text: '❌ Odmítnuto',        color: C.error },
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
}

// ── RequestCard (embedded in chat) ────────────────────────────────────────

function RequestCard({
  req, isHost, onRespond,
}: {
  req: RequestData
  isHost: boolean
  onRespond: (id: string, status: 'ACCEPTED' | 'REJECTED') => void
}) {
  const s = statusLabel[req.status] || statusLabel.PENDING
  return (
    <View style={rc.card}>
      <Text style={rc.title}>🤞 ŽÁDOST O UBYTOVÁNÍ</Text>
      <View style={rc.row}>
        <Text style={rc.badge} numberOfLines={1}>{s.text}</Text>
      </View>

      {req.status === 'ACCEPTED' && (
        <View style={rc.acceptedBlock}>
          <Text style={rc.acceptedDates}>
            📅 {req.arrival_date} → {req.departure_date}
            {req.arrival_time ? `  ·  cca ${req.arrival_time}` : ''}
          </Text>
          <Text style={rc.acceptedGuests}>
            👥 {req.guests_count} {req.guests_count === 1 ? 'jezdec' : 'jezdci'}
            {req.guest_vehicle === 'moto' ? '  ·  🏍 Moto' : req.guest_vehicle === 'bicycle' ? '  ·  🚴 Kolo' : ''}
          </Text>
          {req.photo_url ? (
            <Image source={{ uri: req.photo_url }} style={rc.photo} resizeMode="cover" />
          ) : null}
        </View>
      )}

      {req.status !== 'ACCEPTED' && (
        <View style={rc.details}>
          <Text style={rc.detail}>📅 {req.arrival_date} → {req.departure_date}{req.arrival_time ? `  ·  cca ${req.arrival_time}` : ''}</Text>
          <Text style={rc.detail}>
            👥 {req.guests_count} {req.guests_count === 1 ? 'jezdec' : 'jezdci'}
            {req.guest_vehicle === 'moto' ? '  ·  🏍 Moto' : req.guest_vehicle === 'bicycle' ? '  ·  🚴 Kolo' : ''}
          </Text>
          {req.photo_url ? (
            <Image source={{ uri: req.photo_url }} style={rc.photo} resizeMode="cover" />
          ) : null}
        </View>
      )}

      {isHost && req.status === 'PENDING' && (
        <View style={rc.actions}>
          <TouchableOpacity style={rc.acceptBtn} onPress={() => onRespond(req.id, 'ACCEPTED')}>
            <Text style={rc.acceptTxt}>✓ PŘIJMOUT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={rc.rejectBtn} onPress={() => onRespond(req.id, 'REJECTED')}>
            <Text style={rc.rejectTxt}>✕ ODMÍTNOUT</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const rc = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10, maxWidth: '88%' },
  title: { color: C.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: { color: C.text, fontSize: 13, fontWeight: '700' },
  acceptedBlock: { gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.border },
  acceptedDates: { color: C.success, fontSize: 14, fontWeight: '700' },
  acceptedGuests: { color: C.text, fontSize: 13 },
  details: { gap: 4 },
  detail: { color: C.textMuted, fontSize: 13 },
  photo: { width: '100%', height: 180, borderRadius: 10, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 1, backgroundColor: C.success, borderRadius: 8, padding: 10, alignItems: 'center' },
  acceptTxt: { color: C.white, fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
  rejectBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.error },
  rejectTxt: { color: C.error, fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
})

// ── Main Screen ───────────────────────────────────────────────────────────

export default function RequestsScreen() {
  const [convs, setConvs] = useState<ConvRow[]>([])
  const [selected, setSelected] = useState<ConvRow | null>(null)
  const [messages, setMessages] = useState<MsgRow[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const flatRef = useRef<FlatList<MsgRow>>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setCurrentUser(user); loadConvs(user.id) }
    })
  }, [])

  // Reload convs when navigating back from chat
  useEffect(() => {
    if (!selected && currentUser) loadConvs(currentUser.id)
  }, [selected])

  async function loadConvs(userId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, user_a, user_b, last_message_at,
        pa:profiles!user_a(id, full_name),
        pb:profiles!user_b(id, full_name)
      `)
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('last_message_at', { ascending: false })

    setConvs((data || []).map((c: any) => ({
      id: c.id,
      user_a: c.user_a,
      user_b: c.user_b,
      last_message_at: c.last_message_at,
      other: c.user_a === userId
        ? { id: c.pb?.id, full_name: c.pb?.full_name }
        : { id: c.pa?.id, full_name: c.pa?.full_name },
    })))
    setLoading(false)
  }

  async function openConv(conv: ConvRow) {
    setSelected(conv)
    setMessages([])
    const { data } = await supabase
      .from('messages')
      .select(`
        id, conversation_id, sender_id, body, photo_url, request_id, created_at,
        sender:profiles!sender_id(full_name),
        request:stay_requests!request_id(
          id, arrival_date, departure_date, arrival_time,
          guests_count, guest_vehicle, status, photo_url, host_id, guest_id
        )
      `)
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })

    setMessages((data || []).map(normalizeMsg))
    subscribeToConv(conv.id)
  }

  function normalizeMsg(m: any): MsgRow {
    return {
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      sender_name: m.sender?.full_name ?? null,
      body: m.body,
      photo_url: m.photo_url,
      request_id: m.request_id,
      request: m.request ?? null,
      created_at: m.created_at,
    }
  }

  function subscribeToConv(convId: string) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase
      .channel(`conv:${convId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${convId}`,
      }, async (payload) => {
        const { data } = await supabase
          .from('messages')
          .select(`
            id, conversation_id, sender_id, body, photo_url, request_id, created_at,
            sender:profiles!sender_id(full_name),
            request:stay_requests!request_id(
              id, arrival_date, departure_date, arrival_time,
              guests_count, guest_vehicle, status, photo_url, host_id, guest_id
            )
          `)
          .eq('id', payload.new.id)
          .single()
        if (!data) return
        setMessages(prev => {
          if (prev.find(m => m.id === data.id)) return prev
          return [...prev, normalizeMsg(data)]
        })
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
      })
      .subscribe()
  }

  useEffect(() => {
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  async function sendMessage() {
    if (!text.trim() || !selected || !currentUser) return
    setSending(true)
    const body = text.trim()
    setText('')
    await supabase.from('messages').insert({
      conversation_id: selected.id,
      sender_id: currentUser.id,
      body,
    })
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', selected.id)
    setSending(false)
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
  }

  async function respondToRequest(requestId: string, status: 'ACCEPTED' | 'REJECTED') {
    await supabase.from('stay_requests').update({ status }).eq('id', requestId)
    supabase.functions.invoke('notify-request', {
      body: { request_id: requestId, event: status === 'ACCEPTED' ? 'accepted' : 'rejected' },
    }).catch(() => {})
    setMessages(prev => prev.map(m =>
      m.request?.id === requestId
        ? { ...m, request: { ...m.request!, status } }
        : m
    ))
  }

  // ── Chat view ────────────────────────────────────────────────────────────

  if (selected) {
    const otherName = selected.other.full_name || 'Jezdec'
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setSelected(null); if (channelRef.current) supabase.removeChannel(channelRef.current) }}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>{otherName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.chatName}>{otherName}</Text>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.msgList}
          onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m }) => {
            const isMine = m.sender_id === currentUser?.id
            const isHost = m.request ? currentUser?.id === m.request.host_id : false

            if (m.request_id && m.request) {
              return (
                <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                  <RequestCard
                    req={m.request}
                    isHost={isHost}
                    onRespond={respondToRequest}
                  />
                </View>
              )
            }

            return (
              <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                  {m.body ? <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{m.body}</Text> : null}
                  {m.photo_url ? (
                    <Image source={{ uri: m.photo_url }} style={styles.bubblePhoto} resizeMode="cover" />
                  ) : null}
                  <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>{fmtTime(m.created_at)}</Text>
                </View>
              </View>
            )
          }}
        />

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Napiš zprávu..."
            placeholderTextColor={C.textDim}
            multiline
            onSubmitEditing={Platform.OS === 'web' ? sendMessage : undefined}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
          >
            <Text style={styles.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // ── Conversations list ────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ZPRÁVY</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={{ color: C.textDim, fontSize: 14 }}>Načítám...</Text>
        </View>
      ) : convs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>Žádné konverzace</Text>
          <Text style={styles.emptyText}>Pošli žádost hostiteli z mapy — chat se otevře automaticky.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
          {convs.map(conv => {
            const name = conv.other.full_name || 'Jezdec'
            return (
              <TouchableOpacity
                key={conv.id}
                style={styles.convRow}
                onPress={() => openConv(conv)}
              >
                <View style={styles.convAvatar}>
                  <Text style={styles.convAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.convInfo}>
                  <Text style={styles.convName}>{name}</Text>
                  <Text style={styles.convTime}>{fmtDate(conv.last_message_at)}</Text>
                </View>
                <Text style={styles.convArrow}>›</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20, paddingTop: 52,
    borderBottomWidth: 1, borderBottomColor: C.surface,
  },
  title: { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  back: { color: C.accent, fontSize: 24, fontWeight: '700', paddingRight: 4 },
  chatAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  chatAvatarText: { color: C.white, fontWeight: '700', fontSize: 15 },
  chatName: { color: C.text, fontSize: 16, fontWeight: '700', flex: 1 },

  // Messages
  msgList: { padding: 16, gap: 8, paddingBottom: 8 },
  msgRow: { flexDirection: 'row' },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%', borderRadius: 16, padding: 10,
    backgroundColor: C.elevated, gap: 4,
  },
  bubbleMine: { backgroundColor: C.accent },
  bubbleOther: { backgroundColor: C.elevated },
  bubbleText: { color: C.text, fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: C.white },
  bubblePhoto: { width: 220, height: 160, borderRadius: 10 },
  bubbleTime: { color: C.textDim, fontSize: 10, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.6)' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 12, borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  input: {
    flex: 1, backgroundColor: C.elevated, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: C.text, fontSize: 14, maxHeight: 120,
    borderWidth: 1, borderColor: C.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.border },
  sendBtnText: { color: C.white, fontSize: 20, fontWeight: '700' },

  // Conversation list
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: C.textFaint, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.surface,
  },
  convAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  convAvatarText: { color: C.white, fontWeight: '700', fontSize: 18 },
  convInfo: { flex: 1, gap: 3 },
  convName: { color: C.text, fontWeight: '700', fontSize: 15 },
  convTime: { color: C.textDim, fontSize: 12 },
  convArrow: { color: C.textDim, fontSize: 22, fontWeight: '300' },
})
