import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { unreadStore } from '../../lib/unreadStore'
import { pendingChatStore } from '../../lib/pendingChatStore'
import { mapFocusStore } from '../../lib/mapFocusStore'
import { fuzzCoords } from '../../lib/geo'
import { UserChip } from '../../components/UserChip'
import { AppHeader, HeaderBackButton } from '../../components/AppHeader'
import { RequestPhoto } from '../../components/RequestPhoto'
import { SafetyIcon } from '../../components/SafetyIcon'
import { ReportButton } from '../../components/ReportButton'
import { bestSafety } from '../../components/SafetyBlock'
import { SAFETY, FONT } from '../../lib/theme'

// ── Types ──────────────────────────────────────────────────────────────────

type OtherUser = { id: string | null; full_name: string | null; avatar_url?: string | null }

type ConvRow = {
  id: string
  user_a: string | null
  user_b: string | null
  locationLabel: string
  last_message_at: string
  other: OtherUser
  lastMsgBody: string | null
  lastMsgSenderId: string | null
  lastMsgIsRequest: boolean
  hasRequest: boolean
  requestStatus: string | null
  requestHostId: string | null
  requestGuestId: string | null
  location_id: string
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
  location_id: string | null
  location: RequestLocation | null
}

type RequestLocation = {
  id: string
  location_city: string | null
  location_country: string | null
  parking: string | null
  parkings: string[] | null
  sleep_types: string[] | null
  amenities: string[] | null
  pricing: string | null
  pricings: string[] | null
  max_guests: number | null
  notes: string | null
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

// A chat timeline entry: a message, an inline "you rated …" review, or a day separator.
type ChatItem =
  | { kind: 'day'; id: string; label: string }
  | { kind: 'msg'; id: string; created_at: string; msg: MsgRow }
  | { kind: 'review'; id: string; created_at: string; stay: RequestData; review: { rating: number; body: string; created_at: string }; reviewingGuest: boolean }

type ConversationFilter = 'all' | 'knocks' | 'hosting'
type ExactPointSummary = {
  coords: { lat: number; lng: number }
  lines: { label: string; value: string }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ACCEPTED_AUTO_BODY = "Accepted. I'll send the exact meeting point here when we are set."
const ACCEPTED_AUTO_BODY_LEGACY = "Accepted. I'll send the exact meeting point here when we're set."

const REQUEST_SELECT = `
  id, arrival_date, departure_date, arrival_time,
  guests_count, guest_vehicle, status, photo_url, host_id, guest_id, location_id,
  location:host_locations!location_id(
    id, location_city, location_country, parking, parkings,
    sleep_types, amenities, pricing, pricings, max_guests, notes
  )
`

const PARKING_LABELS: Record<string, string> = {
  garage_locked: 'Locked garage',
  carport: 'Covered parking',
  yard: 'Fenced yard',
  street: 'Street parking',
}

const SLEEP_LABELS: Record<string, string> = {
  tent: 'Tent space',
  roof: 'Roof over head',
  room: 'Private room',
}

const AMENITY_LABELS: Record<string, string> = {
  shower: 'Shower',
  toilet: 'Toilet',
  kitchen: 'Kitchen',
  laundry: 'Laundry',
  electricity: 'Electricity',
  wifi: 'WiFi',
  pub_nearby: 'Pub nearby',
  tools: 'Tools',
}

const PRICING_LABELS: Record<string, string> = {
  free: 'Free',
  tip: 'Tip welcome',
  fixed: 'Agreed contribution',
}

// Same Feather icon set the request card uses, keyed by the meeting-point line label.
const MEETING_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Place: 'map-pin', Bike: 'shield', Sleep: 'moon', Services: 'coffee', Return: 'tag',
}

// Message input auto-grows between one compact line and a comfortable few lines.
const INPUT_MIN_H = 38
const INPUT_MAX_H = 130

function makeStatus(C: ThemeColors): Record<string, { label: string; color: string; bg: string; border?: string }> {
  return {
    PENDING:  { label: 'Pending',  color: C.warning, bg: C.warningSoft, border: C.warningBorder },
    ACCEPTED: { label: 'Accepted', color: C.success, bg: C.successSoft, border: C.successBorder },
    REJECTED: { label: 'Rejected', color: C.error, bg: C.errorSoft, border: C.errorBorder },
    CANCELLED: { label: 'Withdrawn', color: C.textMuted, bg: C.surface, border: C.border },
  }
}

function conversationDirection(conv: ConvRow, userId?: string | null): ConversationFilter {
  if (!userId || !conv.hasRequest) return 'all'
  if (conv.requestGuestId === userId) return 'knocks'
  if (conv.requestHostId === userId) return 'hosting'
  return 'all'
}

function conversationStatus(C: ThemeColors, conv: ConvRow, isUnread: boolean, userId?: string | null) {
  const direction = conversationDirection(conv, userId)
  const pendingHosting = direction === 'hosting' && (conv.requestStatus ?? 'PENDING') === 'PENDING'
  if (pendingHosting && isUnread) {
    return { label: 'New request', color: C.info, bg: C.infoSoft, border: C.infoBorder }
  }
  return makeStatus(C)[conv.requestStatus || 'PENDING'] || makeStatus(C).PENDING
}

// Unread = last message is from the other person and is newer than my last read.
function isConvUnread(conv: ConvRow, userId: string | null | undefined, readMap: Record<string, string>): boolean {
  if (!conv.lastMsgSenderId || conv.lastMsgSenderId === userId) return false
  const lastRead = readMap[conv.id]
  return !lastRead || new Date(conv.last_message_at).getTime() > new Date(lastRead).getTime()
}

// For DATE strings (YYYY-MM-DD) — manual parse to avoid timezone shifts
function fmtDateStr(s: string): string {
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

// For full ISO timestamps (last_message_at etc.)
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// Day grouping for chat date separators. Group by the user's LOCAL day (consistent with
// fmtTime, which also shows local time) so the header never lands off-by-one vs. the
// times printed under each message.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
function dayHeaderLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const k = localDayKey(d)
  if (k === localDayKey(today)) return 'Today'
  if (k === localDayKey(yesterday)) return 'Yesterday'
  // Manual format ("18 June 2026") so it never depends on the runtime's Intl/ICU data.
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function extractCoords(body: string | null): { lat: number; lng: number } | null {
  // Require decimals on BOTH numbers so casual text like "see you at 8, 30 min" doesn't
  // get mistaken for coordinates (which always carry a fractional part in practice).
  const match = body?.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function isAcceptedAutoMessage(body: string | null): boolean {
  if (!body) return false
  // Match only the exact system auto-messages — a user typing "Accepted. ..." must
  // render as a normal bubble, not get swallowed into the system card.
  return body === ACCEPTED_AUTO_BODY || body === ACCEPTED_AUTO_BODY_LEGACY
}

function isExactPointMessage(body: string | null): boolean {
  return !!body?.startsWith('Exact meeting point:')
}

function parseExactPointMessage(body: string | null): ExactPointSummary | null {
  const coords = extractCoords(body)
  if (!body || !coords || !isExactPointMessage(body)) return null
  const lines = body.split('\n').map(line => line.trim()).filter(Boolean)
  const summaryLines = lines
    .map(line => {
      const match = line.match(/^(Place|Bike|Sleep|Services|Return):\s*(.+)$/)
      return match ? { label: match[1], value: match[2] } : null
    })
    .filter(Boolean) as { label: string; value: string }[]
  return { coords, lines: summaryLines }
}

function labelList(values: string[] | null | undefined, labels: Record<string, string>, fallback?: string | null): string {
  const source = values?.length ? values : (fallback ? [fallback] : [])
  // Only render values we still have a label for — silently drops retired options.
  return source.filter(v => labels[v]).map(v => labels[v]).join(' · ')
}

function summarizeLocation(loc: Partial<RequestLocation> | null | undefined): string[] {
  if (!loc) return []
  const place = [loc.location_city, loc.location_country].filter(Boolean).join(', ')
  const parking = labelList(loc.parkings, PARKING_LABELS, loc.parking)
  const sleep = labelList(loc.sleep_types, SLEEP_LABELS)
  const amenities = labelList(loc.amenities, AMENITY_LABELS)
  const pricing = labelList(loc.pricings, PRICING_LABELS, loc.pricing)
  return [
    place ? `Place: ${place}` : null,
    parking ? `Bike: ${parking}` : null,
    sleep ? `Sleep: ${sleep}` : null,
    amenities ? `Services: ${amenities}` : null,
    pricing ? `Return: ${pricing}` : null,
  ].filter(Boolean) as string[]
}

function hasStayEnded(req: RequestData): boolean {
  return req.departure_date <= new Date().toISOString().split('T')[0]
}

async function openNavigation(lat: number, lng: number) {
  const label = encodeURIComponent('TWOWHEELCOME meeting point')
  const coords = `${lat},${lng}`
  const url = Platform.select({
    android: `geo:${coords}?q=${coords}(${label})`,
    ios: `http://maps.apple.com/?ll=${coords}&q=${label}`,
    default: `https://www.google.com/maps/search/?api=1&query=${coords}`,
  })!
  await Linking.openURL(url)
}

// ── RequestCard ───────────────────────────────────────────────────────────

function RequestCard({
  req, body, isHost, onRespond, responding, onShowMap, onWithdraw, withdrawing, onCancelStay, cancelling,
}: {
  req: RequestData
  body: string | null
  isHost: boolean
  onRespond: (id: string, status: 'ACCEPTED' | 'REJECTED') => void
  responding?: boolean
  onShowMap?: () => void
  onWithdraw?: (id: string) => void
  withdrawing?: boolean
  onCancelStay?: (id: string) => void
  cancelling?: boolean
}) {
  const C = useTheme()
  const rc = useMemo(() => makeRc(C), [C])
  const STATUS = useMemo(() => makeStatus(C), [C])
  const s = STATUS[req.status] || STATUS.PENDING
  const vehicle = req.guest_vehicle === 'moto' ? 'Moto' : null
  const guestsLabel = req.guests_count === 1 ? '1 rider' : `${req.guests_count} riders`
  const isGuest = !isHost
  const loc = req.location
  const place = [loc?.location_city, loc?.location_country].filter(Boolean).join(', ')
  const parkingArr: string[] = loc?.parkings?.length ? loc.parkings : (loc?.parking ? [loc.parking] : [])
  const safetyLevel = parkingArr.length ? bestSafety(parkingArr) : null
  const sleep = labelList(loc?.sleep_types, SLEEP_LABELS)
  const amenities = labelList(loc?.amenities, AMENITY_LABELS)
  const pricing = labelList(loc?.pricings, PRICING_LABELS, loc?.pricing)
  // One consistent Feather icon per fact (icon = friendly cue, value = the point).
  // Bike safety renders as its own coloured SafetyIcon row above the facts.
  const facts = ([
    place ? { icon: 'map-pin', value: place } : null,
    { icon: 'calendar', value: `${fmtDateStr(req.arrival_date)} → ${fmtDateStr(req.departure_date)}` },
    req.arrival_time ? { icon: 'clock', value: `Arrival ~ ${req.arrival_time}` } : null,
    { icon: 'users', value: `${guestsLabel}${vehicle ? ` · ${vehicle}` : ''}` },
    sleep ? { icon: 'moon', value: sleep } : null,
    amenities ? { icon: 'coffee', value: amenities } : null,
    pricing ? { icon: 'tag', value: pricing } : null,
  ].filter(Boolean) as { icon: keyof typeof Feather.glyphMap; value: string }[])

  return (
    <View style={rc.card}>
      {/* Header: icon chip + title + status */}
      <View style={rc.head}>
        <View style={rc.headIcon}>
          <Feather name={isGuest ? 'send' : 'inbox'} size={17} color={C.accent} />
        </View>
        <Text style={rc.headTitle}>{isGuest ? 'Your knock' : 'Stay request'}</Text>
        <View style={[rc.statusBadge, { backgroundColor: s.bg }]}>
          <Text style={[rc.statusText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>

      {/* Privacy block — guest side only */}
      {isGuest && req.status === 'PENDING' && (
        <View style={[rc.privacyBlock, { backgroundColor: C.accentSoft, borderColor: C.accentBorder }]}>
          <Text style={rc.privacyIcon}>🔒</Text>
          <Text style={[rc.privacyText, { color: C.textMuted }]}>
            Approx. area for now. The host sends the exact meeting point in chat when you agree.
          </Text>
        </View>
      )}
      {isGuest && req.status === 'ACCEPTED' && (
        <View style={[rc.privacyBlock, { backgroundColor: C.successSoft, borderColor: C.successBorder }]}>
          <Text style={rc.privacyIcon}>📍</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[rc.privacyText, { color: C.success, fontWeight: '700' }]}>REQUEST ACCEPTED</Text>
            <Text style={[rc.privacyText, { color: C.textMuted }]}>
              The exact spot is shared by the host in chat, so both sides know the stay is confirmed.
            </Text>
          </View>
        </View>
      )}
      {/* Details — friendly icon + value rows (value is the focus, icon is the cue) */}
      <View style={rc.facts}>
        {safetyLevel ? (
          <View style={rc.fact}>
            <View style={rc.factIcon}><SafetyIcon level={safetyLevel} size={17} color={SAFETY[safetyLevel].color} strokeWidth={2.2} /></View>
            <Text style={[rc.factValue, { color: SAFETY[safetyLevel].color, fontWeight: '700' }]}>{SAFETY[safetyLevel].label}</Text>
          </View>
        ) : null}
        {facts.map((f, i) => (
          <View key={i} style={rc.fact}>
            <Feather name={f.icon} size={16} color={C.accent} style={rc.factIcon} />
            <Text style={rc.factValue}>{f.value}</Text>
          </View>
        ))}
        {loc?.notes ? (
          <View style={rc.fact}>
            <Feather name="file-text" size={16} color={C.accent} style={rc.factIcon} />
            <Text style={[rc.factValue, rc.factNotes]}>{loc.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* In-app map link for this stay's approximate area */}
      {onShowMap ? (
        <TouchableOpacity style={rc.mapBtn} onPress={onShowMap} accessibilityRole="button">
          <Feather name="map" size={15} color={C.accent} />
          <Text style={rc.mapBtnText}>Show approximate area on map</Text>
          <Feather name="chevron-right" size={16} color={C.accent} />
        </TouchableOpacity>
      ) : null}

      {/* Message text */}
      {body ? (
        <View style={rc.msgBlock}>
          <Text style={rc.msgText}>“{body}”</Text>
        </View>
      ) : null}

      {/* Photo (private bucket → short-lived signed URL) */}
      {req.photo_url ? (
        <RequestPhoto path={req.photo_url} style={rc.photo} />
      ) : null}

      {/* Host actions */}
      {isHost && req.status === 'PENDING' && (
        <View style={rc.actions}>
          <TouchableOpacity
            style={[rc.acceptBtn, responding && rc.actionDisabled]}
            onPress={() => onRespond(req.id, 'ACCEPTED')}
            disabled={responding}
          >
            <Text style={rc.acceptTxt}>{responding ? '...' : '✓ ACCEPT'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[rc.rejectBtn, responding && rc.actionDisabled]}
            onPress={() => onRespond(req.id, 'REJECTED')}
            disabled={responding}
          >
            <Text style={rc.rejectTxt}>{responding ? '...' : '✕ DECLINE'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Guest can withdraw their own request while it is still pending */}
      {isGuest && req.status === 'PENDING' && onWithdraw && (
        <TouchableOpacity
          style={[rc.withdrawBtn, withdrawing && rc.actionDisabled]}
          onPress={() => onWithdraw(req.id)}
          disabled={withdrawing}
          accessibilityRole="button"
        >
          <Text style={rc.withdrawTxt}>{withdrawing ? '...' : 'Withdraw request'}</Text>
        </TouchableOpacity>
      )}

      {/* Host can call off an already-accepted stay (life happens). Frees the night slot. */}
      {isHost && req.status === 'ACCEPTED' && onCancelStay && (
        <TouchableOpacity
          style={[rc.withdrawBtn, cancelling && rc.actionDisabled]}
          onPress={() => onCancelStay(req.id)}
          disabled={cancelling}
          accessibilityRole="button"
        >
          <Text style={rc.withdrawTxt}>{cancelling ? '...' : 'Cancel this stay'}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function makeRc(C: ThemeColors) { return StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: 22,
    borderWidth: 1, borderColor: C.border,
    padding: 14, gap: 10, maxWidth: '90%',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  headTitle: { flex: 1, color: C.text, fontSize: 16, fontWeight: '900' },
  statusBadge: {
    borderRadius: 100, flexShrink: 0,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  facts: { gap: 11, paddingVertical: 2 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  factIcon: { marginTop: 2, width: 18 },
  factValue: { flex: 1, color: C.text, fontSize: 14, lineHeight: 20, fontFamily: FONT.body },
  factNotes: { color: C.textMuted, fontSize: 13, lineHeight: 19 },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentBorder,
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 9,
  },
  mapBtnText: { color: C.accent, fontSize: 13, fontWeight: '800' },
  msgBlock: {
    backgroundColor: C.elevated, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderLeftWidth: 3, borderLeftColor: C.accent,
  },
  msgText: { color: C.textMuted, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  photo: { width: '100%', height: 200, borderRadius: 14 },
  privacyBlock: { flexDirection: 'row', gap: 8, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'flex-start' },
  privacyIcon:  { fontSize: 18, marginTop: 1 },
  privacyText:  { fontSize: 13, lineHeight: 19, flex: 1 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  actionDisabled: { opacity: 0.6 },
  acceptBtn: { flex: 1, backgroundColor: C.success, borderRadius: 100, padding: 13, alignItems: 'center' },
  acceptTxt: { color: C.white, fontWeight: '700', fontSize: 13 },
  rejectBtn: { flex: 1, borderRadius: 100, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: C.error },
  rejectTxt: { color: C.error, fontWeight: '700', fontSize: 13 },
  withdrawBtn: { borderRadius: 100, padding: 11, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  withdrawTxt: { color: C.textMuted, fontWeight: '700', fontSize: 13 },
}) }

// ── Main Screen ───────────────────────────────────────────────────────────

export default function RequestsScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [convs, setConvs] = useState<ConvRow[]>([])
  const [selected, setSelected] = useState<ConvRow | null>(null)
  const [messages, setMessages] = useState<MsgRow[]>([])
  const [text, setText] = useState('')
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_H)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [readMap, setReadMap] = useState<Record<string, string>>({})  // conversation_id -> my last_read_at
  const [sendingCoordsFor, setSendingCoordsFor] = useState<string | null>(null)
  // Reviews are per stay (per stay_request), not per conversation — a conversation is
  // reused for repeat stays, and each completed stay is reviewed independently.
  const [endedStays, setEndedStays] = useState<RequestData[]>([])
  const [myReviewsByStay, setMyReviewsByStay] = useState<Record<string, { rating: number; body: string; created_at: string }>>({})
  const [reviewDraftStars, setReviewDraftStars] = useState<Record<string, number>>({})
  const [reviewDraftBody, setReviewDraftBody] = useState<Record<string, string>>({})
  const [submittingStayId, setSubmittingStayId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)   // accept/decline failure banner
  const [respondingFor, setRespondingFor] = useState<string | null>(null)
  const [withdrawingFor, setWithdrawingFor] = useState<string | null>(null)
  const [cancellingFor, setCancellingFor] = useState<string | null>(null)
  const [cancelStayTarget, setCancelStayTarget] = useState<string | null>(null)   // host cancel confirm modal
  const [acceptTarget, setAcceptTarget] = useState<string | null>(null)           // host accept confirm modal
  const [coordsTarget, setCoordsTarget] = useState<RequestData | null>(null)       // send-coordinates confirm modal
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>('all')
  const flatRef = useRef<FlatList<ChatItem>>(null)
  const nearBottomRef = useRef(true)   // is the user near the bottom of the thread?
  const autoStickRef = useRef(true)    // keep pinning to bottom as content lays out
  const openingRef = useRef(false)     // briefly true right after opening a conversation
  const currentUserIdRef = useRef<string | null>(null)
  const loadUserIdRef = useRef<string | null>(null)
  const respondingRef = useRef(false)   // guard against double-tap accept/decline
  const withdrawingRef = useRef(false)   // guard against double-tap withdraw
  const cancellingRef = useRef(false)   // guard against double-tap host-cancel
  const sendingMsgRef = useRef(false)   // guard against double-tap send message
  const sendingCoordsRef = useRef(false)   // guard against double-tap send coordinates
  const submittingReviewRef = useRef(false)   // guard against double-tap submit review
  const listChannelRef = useRef<any>(null)   // realtime for the whole conversation list
  const subscribingListRef = useRef(false)   // guard so we never create two channels at once
  const selectedConvIdRef = useRef<string | null>(null)
  // Set true right before we leave the open chat for a sub-screen we want to come BACK
  // into (the other person's profile, or the map preview), so the next focus keeps the
  // chat instead of resetting to the list. A plain tab switch leaves it false.
  const keepChatOpenRef = useRef(false)
  // Cold-open deep link from an email / push notification: /requests?openConv=...&reviewRequest=...
  const deepLinkParams = useLocalSearchParams<{ openConv?: string; reviewRequest?: string }>()
  const handledDeepLinkRef = useRef<string | null>(null)
  const locCoordsRef = useRef<{ lat: number; lng: number } | null>(null)  // open conversation's approximate map point


  function clearConversationState() {
    if (listChannelRef.current) {
      supabase.removeChannel(listChannelRef.current)
      listChannelRef.current = null
    }
    setReadMap({})
    setSelected(null)
    selectedConvIdRef.current = null
    setMessages([])
    setText('')
    setSending(false)
    setSendingCoordsFor(null)
    setEndedStays([])
    setMyReviewsByStay({})
    setReviewDraftStars({})
    setReviewDraftBody({})
    setSubmittingStayId(null)
    setRespondingFor(null)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      currentUserIdRef.current = user?.id ?? null
      if (user) {
        setCurrentUser(user)
        loadConvs(user.id)
        void subscribeToList(user.id)
      } else {
        clearConversationState()
        setCurrentUser(null)
        setConvs([])
        unreadStore.set(false)
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      const nextUserId = nextUser?.id ?? null
      if (currentUserIdRef.current === nextUserId) return

      currentUserIdRef.current = nextUserId
      clearConversationState()
      setConvs([])
      unreadStore.set(false)

      if (nextUser) {
        setCurrentUser(nextUser)
        loadConvs(nextUser.id)
        void subscribeToList(nextUser.id)
      } else {
        setCurrentUser(null)
        setLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
      if (listChannelRef.current) { supabase.removeChannel(listChannelRef.current); listChannelRef.current = null }
    }
    // Auth bootstrap owns the channel lifecycle; inner callbacks read latest ids from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh convs every time the tab gets focus, and honour a pending "open this
  // exact chat" request from the map/history. useFocusEffect fires on EVERY focus
  // (incl. tab switches when the screen stays mounted), so this opens the right
  // conversation even when a different one is already open — overriding it.
  useFocusEffect(
    useCallback(() => {
      if (!currentUser) return
      const userId = currentUser.id
      loadConvs(userId)
      const pending = pendingChatStore.consume()
      // Deep link from an email/push URL (?openConv=...). Handle each convId once (no
      // setParams clearing — that would re-run this effect and reset us to the list); the
      // ref guard makes a stale param a no-op on later focuses so "return to list" still works.
      const paramConv = typeof deepLinkParams.openConv === 'string' && deepLinkParams.openConv ? deepLinkParams.openConv : null
      const deepLinkConv = paramConv && handledDeepLinkRef.current !== paramConv ? paramConv : null
      const openId = pending?.convId ?? deepLinkConv
      if (openId) {
        if (deepLinkConv) handledDeepLinkRef.current = deepLinkConv
        // A deep-link / "Open chat" wins: open that exact conversation.
        void (async () => {
          const conv = convs.find(c => c.id === openId) ?? await fetchConvById(openId, userId)
          if (conv && currentUserIdRef.current === userId) openConv(conv)
        })()
      } else if (keepChatOpenRef.current) {
        // Returning from the other person's profile / the map preview — keep the chat.
        keepChatOpenRef.current = false
      } else {
        // Plain (re)focus, e.g. switching back from another tab: land on the LIST, not the
        // last open chat. The chat is reachable via the list or a deep-link.
        setSelected(null)
        selectedConvIdRef.current = null
      }
      // convs/fetchConvById/openConv intentionally excluded; this must run on focus only.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, deepLinkParams.openConv])
  )

  // Fetch one conversation by id, shaped like a list row. Used when the openConv
  // deep-link arrives before the list has loaded, so opening never races the list.
  async function fetchConvById(convId: string, userId: string): Promise<ConvRow | null> {
    const { data: c } = await supabase
      .from('conversations')
      .select('id, user_a, user_b, location_id, last_message_at')
      .eq('id', convId)
      .maybeSingle()
    if (!c || (c.user_a !== userId && c.user_b !== userId)) return null
    const otherId = c.user_a === userId ? c.user_b : c.user_a
    const [{ data: prof }, { data: loc }] = await Promise.all([
      otherId
        ? supabase.from('profiles').select('id, full_name, avatar_url').eq('id', otherId).maybeSingle()
        : Promise.resolve({ data: null as any }),
      c.location_id
        ? supabase.from('host_locations_public').select('location_city, location_country').eq('id', c.location_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ])
    return {
      id: c.id, user_a: c.user_a, user_b: c.user_b, location_id: c.location_id,
      locationLabel: loc ? ([loc.location_city, loc.location_country].filter(Boolean).join(', ') || 'Past location') : 'Past location',
      last_message_at: c.last_message_at,
      other: { id: otherId, full_name: prof?.full_name ?? null, avatar_url: prof?.avatar_url ?? null },
      lastMsgBody: null, lastMsgSenderId: null, lastMsgIsRequest: false,
      hasRequest: false, requestStatus: null, requestHostId: null, requestGuestId: null,
    }
  }

  // Reload convs when navigating back from chat
  useEffect(() => {
    if (!selected && currentUser) loadConvs(currentUser.id)
    // currentUser is stable after auth load; selected is the event that should refresh the list here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Sync unread indicator to tab bar
  useEffect(() => {
    const anyUnread = convs.some(c => isConvUnread(c, currentUser?.id, readMap))
    unreadStore.set(anyUnread)
  }, [convs, currentUser, readMap])

  // Preload the open conversation's approximate map point (rounded public coords +
  // the same ~500m fuzz the map uses) so "Show on map" is instant.
  useEffect(() => {
    locCoordsRef.current = null
    const locId = selected?.location_id
    if (!locId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from('host_locations_public')
        .select('location_lat, location_lng').eq('id', locId).maybeSingle()
      if (!cancelled && data?.location_lat != null && data?.location_lng != null) {
        locCoordsRef.current = fuzzCoords(locId, data.location_lat, data.location_lng)
      }
    })()
    return () => { cancelled = true }
  }, [selected?.location_id])

  // Open the in-app map centred on this conversation's APPROXIMATE area. Cross-tab,
  // so it goes through the focus-consumed mapFocusStore.
  async function showLocationOnMap() {
    const locId = selected?.location_id
    if (!locId) return
    let coords = locCoordsRef.current
    if (!coords) {
      const { data } = await supabase.from('host_locations_public')
        .select('location_lat, location_lng').eq('id', locId).maybeSingle()
      if (data?.location_lat != null && data?.location_lng != null) coords = fuzzCoords(locId, data.location_lat, data.location_lng)
    }
    if (!coords) return
    mapFocusStore.set(coords)
    keepChatOpenRef.current = true   // come back into this chat, not the list
    router.push('/(tabs)/map')
  }

  async function loadConvs(userId: string) {
    loadUserIdRef.current = userId
    setLoading(true)
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, user_a, user_b, location_id, last_message_at')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('last_message_at', { ascending: false })

    if (loadUserIdRef.current !== userId || currentUserIdRef.current !== userId) return
    if (!convData || convData.length === 0) { setConvs([]); setLoading(false); return }

    const convIds = convData.map((c: any) => c.id)
    const otherIds = convData
      .map((c: any) => c.user_a === userId ? c.user_b : c.user_a)
      .filter((id: string | null): id is string => !!id)
    const locationIds = convData.map((c: any) => c.location_id).filter(Boolean)

    const [{ data: profiles }, { data: locations }, { data: lastMsgs }, { data: requestRows }, { data: readRows }, { data: blockRows }] = await Promise.all([
      otherIds.length ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', otherIds) : Promise.resolve({ data: [] as any[] }),
      locationIds.length ? supabase.from('host_locations_public').select('id, location_city, location_country').in('id', locationIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from('messages')
        .select('conversation_id, body, sender_id, request_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
      supabase.from('stay_requests')
        .select('conversation_id, status, host_id, guest_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
      supabase.from('conversation_reads')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId),
      // People I've blocked — hide those conversations from my list.
      supabase.from('blocks').select('blocked_id').eq('blocker_id', userId),
    ])

    if (loadUserIdRef.current !== userId || currentUserIdRef.current !== userId) return

    const blockedSet = new Set((blockRows || []).map((b: any) => b.blocked_id))

    setReadMap(prev => {
      const next = { ...prev }
      readRows?.forEach((r: any) => {
        const cur = next[r.conversation_id]
        if (!cur || new Date(r.last_read_at).getTime() > new Date(cur).getTime()) next[r.conversation_id] = r.last_read_at
      })
      return next
    })

    const profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
    profiles?.forEach((p: any) => { profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url } })
    const locationMap: Record<string, string> = {}
    locations?.forEach((location: any) => {
      locationMap[location.id] = [location.location_city, location.location_country].filter(Boolean).join(', ')
    })

    const lastMsgMap: Record<string, { body: string | null; sender_id: string; request_id: string | null }> = {}
    const hasRequestMap: Record<string, boolean> = {}
    const requestStatusMap: Record<string, string> = {}
    const requestHostMap: Record<string, string> = {}
    const requestGuestMap: Record<string, string> = {}
    lastMsgs?.forEach((m: any) => {
      if (!lastMsgMap[m.conversation_id]) {
        lastMsgMap[m.conversation_id] = { body: m.body, sender_id: m.sender_id, request_id: m.request_id }
      }
      if (m.request_id) hasRequestMap[m.conversation_id] = true
    })
    requestRows?.forEach((r: any) => {
      if (r.conversation_id && !requestStatusMap[r.conversation_id]) {
        requestStatusMap[r.conversation_id] = r.status
        requestHostMap[r.conversation_id] = r.host_id
        requestGuestMap[r.conversation_id] = r.guest_id
      }
      if (r.conversation_id) hasRequestMap[r.conversation_id] = true
    })

    setConvs(convData.filter((c: any) => {
      const otherId = c.user_a === userId ? c.user_b : c.user_a
      return !blockedSet.has(otherId)
    }).map((c: any) => {
      const otherId = c.user_a === userId ? c.user_b : c.user_a
      const last = lastMsgMap[c.id]
      const prof = profileMap[otherId]
      return {
        id: c.id,
        user_a: c.user_a,
        user_b: c.user_b,
        location_id: c.location_id,
        locationLabel: locationMap[c.location_id] || 'Past location',
        last_message_at: c.last_message_at,
        other: { id: otherId, full_name: prof?.full_name ?? null, avatar_url: prof?.avatar_url ?? null } as OtherUser,
        lastMsgBody: last?.body ?? null,
        lastMsgSenderId: last?.sender_id ?? null,
        lastMsgIsRequest: !!last?.request_id,
        hasRequest: !!hasRequestMap[c.id],
        requestStatus: requestStatusMap[c.id] ?? null,
        requestHostId: requestHostMap[c.id] ?? null,
        requestGuestId: requestGuestMap[c.id] ?? null,
      }
    }))
    setLoading(false)
  }

  async function markRead(convId: string, isoTime: string) {
    const userId = currentUserIdRef.current
    if (!userId) return
    setReadMap(prev => {
      const cur = prev[convId]
      if (cur && new Date(cur).getTime() >= new Date(isoTime).getTime()) return prev
      return { ...prev, [convId]: isoTime }
    })
    await supabase.from('conversation_reads')
      .upsert({ user_id: userId, conversation_id: convId, last_read_at: isoTime }, { onConflict: 'user_id,conversation_id' })
  }

  // Add a message to the open thread: de-dupe by id, keep created_at order (so two
  // realtime events that arrive close together can't land out of order).
  function mergeMessage(prev: MsgRow[], msg: MsgRow): MsgRow[] {
    if (prev.some(x => x.id === msg.id)) return prev
    const next = [...prev, msg]
    next.sort((a, b) => a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : (a.id < b.id ? -1 : 1))
    return next
  }

  // Append a realtime INSERT into the OPEN conversation. Each message is handled
  // independently here (not via a shared single-slot state), so two messages arriving
  // back-to-back can no longer cancel each other's append — both are added, de-duped
  // by id. The raw payload renders immediately; the sender name + stay-request card are
  // enriched in a follow-up patch by id. selectedConvIdRef (a ref) avoids stale closures.
  function appendRealtimeMessage(m: any) {
    if (selectedConvIdRef.current !== m.conversation_id) return
    const userId = currentUserIdRef.current
    setMessages(prev => mergeMessage(prev, normalizeMsg({ ...m, sender: { full_name: null } })))
    void markRead(m.conversation_id, m.created_at)
    if (nearBottomRef.current) setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 60)
    void (async () => {
      const { data } = await supabase
        .from('messages')
        .select(`
          id, conversation_id, sender_id, body, photo_url, request_id, created_at,
          request:stay_requests!request_id(${REQUEST_SELECT})
        `)
        .eq('id', m.id)
        .maybeSingle()
      if (!data) return
      const { data: sp } = await supabase.from('profiles').select('full_name').eq('id', data.sender_id).maybeSingle()
      if (currentUserIdRef.current !== userId || selectedConvIdRef.current !== data.conversation_id) return
      const enriched = normalizeMsg({ ...data, sender: { full_name: sp?.full_name ?? null } })
      setMessages(prev => prev.some(x => x.id === enriched.id)
        ? prev.map(x => x.id === enriched.id ? enriched : x)
        : mergeMessage(prev, enriched))
    })()
  }

  // Live-update the conversation LIST: any new message (in any of my conversations)
  // moves it to the top, refreshes the preview, and lights up the unread dot.
  // ONE realtime channel for the whole screen: it updates the conversation list
  // (move to top, preview, unread dot) AND appends to the currently-open thread.
  // A single postgres_changes binding on `messages` avoids the conflict that arose
  // when a list-level and a conversation-level subscription both bound the table.
  async function subscribeToList(userId: string) {
    // Guard against the two near-simultaneous calls on load (getUser + onAuthStateChange):
    // two channels with the same 'messages-stream' topic conflict, the second one never
    // really subscribes, and live delivery into the open conversation breaks. One channel only.
    if (subscribingListRef.current) return
    subscribingListRef.current = true
    try {
      if (listChannelRef.current) { supabase.removeChannel(listChannelRef.current); listChannelRef.current = null }
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token)
      const channel = supabase.channel('messages-stream')
      listChannelRef.current = channel
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          if (currentUserIdRef.current !== userId) return
          const m = payload.new as any
          const convId = m.conversation_id

          // (1) Conversation list: move to top, refresh preview, light the unread dot.
          let isNew = false
          setConvs(prev => {
            const idx = prev.findIndex(c => c.id === convId)
            if (idx === -1) { isNew = true; return prev }
            const updated = {
              ...prev[idx],
              lastMsgBody: m.body,
              lastMsgSenderId: m.sender_id,
              lastMsgIsRequest: !!m.request_id,
              hasRequest: prev[idx].hasRequest || !!m.request_id,
              last_message_at: m.created_at,
            }
            return [updated, ...prev.filter((_, i) => i !== idx)]
          })
          if (isNew && currentUserIdRef.current === userId) void loadConvs(userId)

          // (2) Append straight into the open thread (independent per message, so two
          // rapid messages can't cancel each other).
          appendRealtimeMessage(m)
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stay_requests' }, (payload) => {
          if (currentUserIdRef.current !== userId) return
          const r = payload.new as Partial<RequestData> & { id?: string; conversation_id?: string }
          if (r.id) {
            setMessages(prev => prev.map(msg =>
              msg.request?.id === r.id ? { ...msg, request: { ...msg.request, ...r } as RequestData } : msg))
          }
          if (r.conversation_id) {
            setConvs(prev => prev.map(c =>
              c.id === r.conversation_id ? { ...c, requestStatus: r.status ?? c.requestStatus, hasRequest: true } : c))
          }
        })
        .subscribe((status) => {
          // Recover from a dropped/failed channel so live updates resume on their own.
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && listChannelRef.current === channel) {
            setTimeout(() => {
              if (listChannelRef.current === channel && currentUserIdRef.current === userId) void subscribeToList(userId)
            }, 2000)
          }
        })
    } finally {
      subscribingListRef.current = false
    }
  }

  async function openConv(conv: ConvRow) {
    const userId = currentUserIdRef.current
    if (!userId || (conv.user_a !== userId && conv.user_b !== userId)) return
    setSelected(conv)
    selectedConvIdRef.current = conv.id
    // Open pinned to the bottom (newest message), and keep pinning while the
    // variable-height items (request cards, photos, review block) lay out.
    nearBottomRef.current = true
    autoStickRef.current = true
    openingRef.current = true
    setTimeout(() => { openingRef.current = false }, 800)
    void markRead(conv.id, conv.last_message_at)
    setActionError(null)
    setMessages([])
    const { data: msgData } = await supabase
      .from('messages')
      .select(`
	        id, conversation_id, sender_id, body, photo_url, request_id, created_at,
	        request:stay_requests!request_id(${REQUEST_SELECT})
	      `)
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })

    // Bail if a different conversation was opened (or the user changed) while we awaited,
    // so a slower fetch can't drop its messages into the wrong open thread.
    if (currentUserIdRef.current !== userId || selectedConvIdRef.current !== conv.id) return
    if (!msgData || msgData.length === 0) { setMessages([]); return }

    const senderIds = [...new Set(msgData.map((m: any) => m.sender_id))]
    const { data: senderProfiles } = await supabase
      .from('profiles').select('id, full_name').in('id', senderIds)
    if (currentUserIdRef.current !== userId || selectedConvIdRef.current !== conv.id) return
    const senderMap: Record<string, string | null> = {}
    senderProfiles?.forEach((p: any) => { senderMap[p.id] = p.full_name })

    const normalized = msgData.map((m: any) => normalizeMsg({ ...m, sender: { full_name: senderMap[m.sender_id] ?? null } }))
    setMessages(normalized)

    // Every completed (accepted + ended) stay in this conversation is independently
    // reviewable — repeat stays reuse the conversation but each is its own stay_request.
    // Derive these from stay_requests directly (NOT from messages): a conversation can
    // have a reviewable stay even when no message carries its request_id (seeded/bare chat,
    // or the request message was detached), so the message-only path missed them.
    const { data: stayRows } = await supabase
      .from('stay_requests')
      .select(REQUEST_SELECT)
      .eq('conversation_id', conv.id)
      .eq('status', 'ACCEPTED')
    if (currentUserIdRef.current !== userId || selectedConvIdRef.current !== conv.id) return
    const ended = Array.from(
      new Map(
        (((stayRows as unknown) as RequestData[]) ?? [])
          .filter((req): req is RequestData => !!req && req.status === 'ACCEPTED' && hasStayEnded(req))
          .map(r => [r.id, r])
      ).values()
    ).sort((a, b) => a.departure_date < b.departure_date ? -1 : a.departure_date > b.departure_date ? 1 : 0)
    setEndedStays(ended)
    setReviewDraftStars({}); setReviewDraftBody({}); setMyReviewsByStay({})
    if (ended.length && currentUser) {
      const { data: revs } = await supabase
        .from('reviews')
        .select('stay_request_id, rating, body, created_at')
        .eq('reviewer_id', currentUser.id)
        .in('stay_request_id', ended.map(r => r.id))
      if (currentUserIdRef.current !== userId || selectedConvIdRef.current !== conv.id) return
      const map: Record<string, { rating: number; body: string; created_at: string }> = {}
      revs?.forEach((r: any) => { map[r.stay_request_id] = { rating: r.rating, body: r.body ?? '', created_at: r.created_at } })
      setMyReviewsByStay(map)
    }

    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100)
  }

  // Strip obvious GPS coordinate pairs (e.g. "50.087, 14.421") so a review can't leak the
  // host's exact spot. Needs 3+ decimals, so prices like "20.50" are untouched. The DB has
  // the same backstop for direct API calls.
  function stripCoords(text: string): string {
    return text.replace(/\d{1,3}\.\d{3,}[\s,;]+\d{1,3}\.\d{3,}/g, '').replace(/\s{2,}/g, ' ').trim()
  }

  async function submitReview(stayId: string) {
    if (submittingReviewRef.current) return   // guard against a double-tap inserting twice
    const req = endedStays.find(r => r.id === stayId)
    const stars = reviewDraftStars[stayId] || 0
    if (!req || !currentUser || !stars) return
    const userId = currentUser.id
    if (currentUserIdRef.current !== userId) return
    const revieweeId = userId === req.host_id ? req.guest_id : req.host_id
    const body = stripCoords((reviewDraftBody[stayId] || '').trim())
    submittingReviewRef.current = true
    setSubmittingStayId(stayId)
    const { error } = await supabase.from('reviews').insert({
      stay_request_id: stayId,
      reviewer_id: userId,
      reviewee_id: revieweeId,
      rating: stars,
      body: body || null,
    })
    submittingReviewRef.current = false
    setSubmittingStayId(null)
    if (!error) {
      setMyReviewsByStay(prev => ({ ...prev, [stayId]: { rating: stars, body, created_at: new Date().toISOString() } }))
    }
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
      request: Array.isArray(m.request) ? (m.request[0] ?? null) : (m.request ?? null),
      created_at: m.created_at,
    }
  }


  async function sendMessage() {
    if (sendingMsgRef.current) return  // guard against a double-tap sending twice
    if (!text.trim() || !selected || !currentUser) return
    const userId = currentUser.id
    if (currentUserIdRef.current !== userId || (selected.user_a !== userId && selected.user_b !== userId)) return
    sendingMsgRef.current = true
    setSending(true)
    const body = text.trim()
    const conversationId = selected.id
    setText('')
    setInputHeight(INPUT_MIN_H)   // collapse the input back to one line after sending
    const { data: inserted, error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: userId,
      body,
    })
      .select(`
        id, conversation_id, sender_id, body, photo_url, request_id, created_at,
        request:stay_requests!request_id(${REQUEST_SELECT})
      `)
      .single()
    if (error) {
      setText(body)
      sendingMsgRef.current = false
      setSending(false)
      // Block (P0001) carries a clear server message; otherwise a generic hint.
      setActionError(error.code === 'P0001' && error.message
        ? error.message
        : "Couldn't send your message. Check your connection and try again.")
      return
    }
    if (currentUserIdRef.current !== userId) {
      sendingMsgRef.current = false
      setSending(false)
      return
    }
    if (inserted) {
      const normalizedInserted = normalizeMsg({ ...inserted, sender: { full_name: currentUser.user_metadata?.full_name ?? null } })
      setMessages(prev => prev.find(m => m.id === normalizedInserted.id) ? prev : [...prev, normalizedInserted])
      setConvs(prev => prev.map(c =>
        c.id === conversationId
          ? { ...c, lastMsgBody: body, lastMsgSenderId: userId, lastMsgIsRequest: false, last_message_at: normalizedInserted.created_at }
          : c
      ))
    }
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)
    sendingMsgRef.current = false
    setSending(false)
    // Sending always jumps to the bottom to show your own message.
    nearBottomRef.current = true
    autoStickRef.current = true
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 60)
  }

  function handleMessageKeyPress(e: any) {
    if (Platform.OS !== 'web') return
    const key = e?.nativeEvent?.key
    const shiftKey = !!(e?.shiftKey || e?.nativeEvent?.shiftKey)
    if (key === 'Enter' && !shiftKey) {
      e?.preventDefault?.()
      if (text.trim() && !sending) {
        void sendMessage()
      }
    }
  }

  async function sendCoordinates(req: RequestData) {
    if (sendingCoordsRef.current) return   // guard against a double-tap sending two pins
    if (!selected || !currentUser || currentUser.id !== req.host_id) return
    const userId = currentUser.id
    if (currentUserIdRef.current !== userId || (selected.user_a !== userId && selected.user_b !== userId)) return
    sendingCoordsRef.current = true
    setSendingCoordsFor(req.id)

    let loc: any = null
    if (req.location_id) {
      const { data } = await supabase
        .from('host_locations')
        .select('location_lat, location_lng, location_city, location_country, parking, parkings, sleep_types, amenities, pricing, pricings, max_guests')
        .eq('id', req.location_id)
        .eq('user_id', req.host_id)
        .maybeSingle()
      loc = data
    }
    if (loc?.location_lat != null && loc?.location_lng != null) {
      const coords = `${Number(loc.location_lat).toFixed(6)}, ${Number(loc.location_lng).toFixed(6)}`
      const place = [loc.location_city, loc.location_country].filter(Boolean).join(', ')
      const recap = summarizeLocation(loc)
      const body = [
        'Exact meeting point:',
        coords,
        Platform.OS === 'web' ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}` : null,
        place || null,
        recap.length ? '' : null,
        recap.length ? 'Agreed stay recap:' : null,
        ...recap,
      ].filter(Boolean).join('\n')

      const { data: inserted } = await supabase.from('messages').insert({
        conversation_id: selected.id,
        sender_id: userId,
        body,
        request_id: req.id,
      })
        .select(`
          id, conversation_id, sender_id, body, photo_url, request_id, created_at,
          request:stay_requests!request_id(${REQUEST_SELECT})
        `)
        .single()
      if (inserted) {
        setMessages(prev => prev.find(m => m.id === inserted.id)
          ? prev
          : [...prev, normalizeMsg({ ...inserted, sender: { full_name: null } })]
        )
      }
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selected.id)
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
    } else {
      // No coordinates on the location — tell the host instead of silently doing nothing.
      setActionError("This place has no map pin yet, so there's no exact point to send. Set its location in your listing first.")
    }

    sendingCoordsRef.current = false
    setSendingCoordsFor(null)
  }

  async function respondToRequest(requestId: string, status: 'ACCEPTED' | 'REJECTED') {
    if (respondingRef.current || respondingFor) return
    if (!currentUser || currentUserIdRef.current !== currentUser.id) return
    const userId = currentUser.id
    if (selected && selected.user_a !== userId && selected.user_b !== userId) return
    respondingRef.current = true
    setRespondingFor(requestId)
    setActionError(null)
    const { error } = await supabase.from('stay_requests').update({ status }).eq('id', requestId)
    if (error) {
      respondingRef.current = false
      setRespondingFor(null)
      // Host-bed protection: can't accept a second rider for a night already taken here.
      const doubleBooked = status === 'ACCEPTED'
        && (error.code === '23P01' || /no_double_booked_accepted|exclusion/i.test(error.message || ''))
      if (error.message) console.warn('respondToRequest error:', error.code, error.message)
      setActionError(doubleBooked
        ? "You've already accepted a rider for these nights at this place."
        : `Couldn't ${status === 'ACCEPTED' ? 'accept' : 'decline'} the request. Check your connection and try again.`)
      return
    }
    setMessages(prev => prev.map(m =>
      m.request?.id === requestId
        ? { ...m, request: { ...m.request!, status } }
        : m
    ))
    supabase.functions.invoke('notify-request', {
      body: { request_id: requestId, event: status === 'ACCEPTED' ? 'accepted' : 'rejected' },
    }).catch(() => {})

    // Auto-message in chat
    if (selected && currentUser) {
      const autoBody = status === 'ACCEPTED'
        ? ACCEPTED_AUTO_BODY
        : "Unfortunately it won't work this time. Have a great ride! 🤞"
      const { data: inserted } = await supabase.from('messages').insert({
        conversation_id: selected.id,
        sender_id: userId,
        body: autoBody,
        request_id: requestId,
      })
        .select(`
          id, conversation_id, sender_id, body, photo_url, request_id, created_at,
          request:stay_requests!request_id(${REQUEST_SELECT})
        `)
        .single()
      // Only append the real persisted auto-message — never a fake local-only one (the
      // status change itself already shows via the request card + realtime update).
      if (inserted) {
        const normalizedInserted = normalizeMsg({ ...inserted, sender: { full_name: null } })
        setMessages(prev => prev.find(m => m.id === normalizedInserted.id) ? prev : [...prev, normalizedInserted])
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', selected.id)
      }
    }

    setConvs(prev => prev.map(c =>
      c.id === selected?.id ? { ...c, requestStatus: status, hasRequest: true } : c
    ))
    respondingRef.current = false
    setRespondingFor(null)
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
  }

  // The guest withdraws their own still-pending request. Status -> CANCELLED frees
  // the date slot (it sits outside the exclusion constraint), so they can knock
  // again for the same nights. The conversation and its history stay intact.
  async function withdrawRequest(requestId: string) {
    if (withdrawingRef.current || withdrawingFor) return
    if (!currentUser || currentUserIdRef.current !== currentUser.id) return
    withdrawingRef.current = true
    setWithdrawingFor(requestId)
    setActionError(null)
    const { error } = await supabase
      .from('stay_requests')
      .update({ status: 'CANCELLED' })
      .eq('id', requestId)
      .eq('status', 'PENDING')
    if (error) {
      withdrawingRef.current = false
      setWithdrawingFor(null)
      setActionError("Couldn't withdraw the request. Check your connection and try again.")
      return
    }
    setMessages(prev => prev.map(m =>
      m.request?.id === requestId
        ? { ...m, request: { ...m.request!, status: 'CANCELLED' } }
        : m
    ))
    setConvs(prev => prev.map(c =>
      c.id === selected?.id ? { ...c, requestStatus: 'CANCELLED' } : c
    ))
    withdrawingRef.current = false
    setWithdrawingFor(null)
  }

  // The host calls off an ALREADY-ACCEPTED stay (life happens). ACCEPTED -> CANCELLED
  // drops the row out of the no_double_booked_accepted exclusion constraint, so the
  // booked nights free up. A short system note lands in chat so the guest sees why.
  async function cancelAcceptedStay(requestId: string) {
    if (cancellingRef.current || cancellingFor) return
    if (!currentUser || currentUserIdRef.current !== currentUser.id) return
    const userId = currentUser.id
    cancellingRef.current = true
    setCancellingFor(requestId)
    setActionError(null)
    const { error } = await supabase
      .from('stay_requests')
      .update({ status: 'CANCELLED' })
      .eq('id', requestId)
      .eq('status', 'ACCEPTED')
      .eq('host_id', userId)
    if (error) {
      cancellingRef.current = false
      setCancellingFor(null)
      setCancelStayTarget(null)
      if (error.message) console.warn('cancelAcceptedStay error:', error.code, error.message)
      setActionError("Couldn't cancel the stay. Check your connection and try again.")
      return
    }
    setMessages(prev => prev.map(m =>
      m.request?.id === requestId
        ? { ...m, request: { ...m.request!, status: 'CANCELLED' } }
        : m
    ))
    setConvs(prev => prev.map(c =>
      c.id === selected?.id ? { ...c, requestStatus: 'CANCELLED' } : c
    ))

    // Let the rider know their accepted stay fell through (email + push, prefs-aware).
    supabase.functions.invoke('notify-request', {
      body: { request_id: requestId, event: 'cancelled_by_host' },
    }).catch(() => {})

    // System note in the thread (plain bubble, no request_id so it doesn't render a card).
    if (selected) {
      const { data: inserted } = await supabase.from('messages').insert({
        conversation_id: selected.id,
        sender_id: userId,
        body: 'Host cancelled this stay. The booked nights are free again.',
      })
        .select(`
          id, conversation_id, sender_id, body, photo_url, request_id, created_at,
          request:stay_requests!request_id(${REQUEST_SELECT})
        `)
        .single()
      if (inserted) {
        const normalizedInserted = normalizeMsg({ ...inserted, sender: { full_name: null } })
        setMessages(prev => prev.find(m => m.id === normalizedInserted.id) ? prev : [...prev, normalizedInserted])
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selected.id)
      }
    }

    cancellingRef.current = false
    setCancellingFor(null)
    setCancelStayTarget(null)
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
  }

  // ── Chat view ────────────────────────────────────────────────────────────

  if (selected) {
    const otherName = selected.other.full_name || 'Rider'
    let coordinateRequest: RequestData | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      const req = messages[i]?.request
      if (!req || req.status !== 'ACCEPTED' || currentUser?.id !== req.host_id) continue
      const coordsSent = messages.some(msg =>
        msg.sender_id === currentUser?.id
        && isExactPointMessage(msg.body)
        && (!msg.request_id || msg.request_id === req.id)
      )
      if (!coordsSent) {
        coordinateRequest = req
        break
      }
    }

    // Merge the message timeline with the user's own submitted reviews, both ordered by
    // created_at, and inject a day-separator before the first item of each local day. The
    // submitted review thus behaves like a normal bubble (scrolls up as new messages come),
    // instead of a pinned footer. The footer keeps only the still-pending rating prompts.
    const chatItems: ChatItem[] = (() => {
      const content: Exclude<ChatItem, { kind: 'day' }>[] =
        messages.map((m): Exclude<ChatItem, { kind: 'day' }> => ({ kind: 'msg', id: m.id, created_at: m.created_at, msg: m }))
      for (const stay of endedStays) {
        const mine = myReviewsByStay[stay.id]
        if (mine?.created_at) {
          content.push({ kind: 'review', id: `review-${stay.id}`, created_at: mine.created_at, stay, review: mine, reviewingGuest: currentUser?.id === stay.host_id })
        }
      }
      content.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      const out: ChatItem[] = []
      let lastDay = ''
      for (const it of content) {
        const k = localDayKey(new Date(it.created_at))
        if (k !== lastDay) { out.push({ kind: 'day', id: `day-${k}`, label: dayHeaderLabel(it.created_at) }); lastDay = k }
        out.push(it)
      }
      return out
    })()

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <HeaderBackButton onPress={() => {
            setSelected(null)
            selectedConvIdRef.current = null
          }} />
          <TouchableOpacity
            style={styles.chatPeek}
            activeOpacity={0.7}
            disabled={!selected.other.id}
            onPress={() => {
              if (!selected.other.id) return
              keepChatOpenRef.current = true   // come back into this chat after viewing the profile
              router.push({ pathname: '/host/[id]', params: { id: selected.other.id } })
            }}
            accessibilityRole="button"
            accessibilityLabel={`View ${otherName}'s profile and reviews`}
          >
            <View style={styles.chatAvatar}>
              {selected.other.avatar_url ? (
                <Image source={{ uri: selected.other.avatar_url }} style={styles.chatAvatarImg} />
              ) : (
                <Text style={styles.chatAvatarText}>{otherName.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.chatIdentity}>
              <Text style={styles.chatName} numberOfLines={1}>{otherName}{selected.other.id ? '  ›' : ''}</Text>
              <Text style={styles.chatLocation} numberOfLines={1}>{selected.locationLabel}</Text>
            </View>
          </TouchableOpacity>
          <ReportButton targetType="conversation" targetId={selected.id} label="Report" style={{ marginRight: 4 }} />
          <UserChip />
        </View>

        {/* Host cancel-stay confirmation */}
        <Modal visible={!!cancelStayTarget} transparent animationType="fade" onRequestClose={() => setCancelStayTarget(null)}>
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmSheet}>
              <Text style={styles.confirmTitle}>Cancel this stay?</Text>
              <Text style={styles.confirmBody}>
                This calls off the accepted stay and frees the nights for other riders. {otherName} will see a note in this chat. This can’t be undone.
              </Text>
              <TouchableOpacity
                style={[styles.confirmDanger, cancellingFor && { opacity: 0.6 }]}
                onPress={() => { if (cancelStayTarget) void cancelAcceptedStay(cancelStayTarget) }}
                disabled={!!cancellingFor}
              >
                <Text style={styles.confirmDangerText}>{cancellingFor ? 'Cancelling…' : 'Yes, cancel the stay'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setCancelStayTarget(null)} disabled={!!cancellingFor}>
                <Text style={styles.confirmCancelText}>Keep the stay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Host accept-request confirmation (a tap shouldn't accidentally accept) */}
        <Modal visible={!!acceptTarget} transparent animationType="fade" onRequestClose={() => setAcceptTarget(null)}>
          <View style={styles.confirmOverlay}>
            <View style={[styles.confirmSheet, { borderColor: C.border }]}>
              <Text style={styles.confirmTitle}>Accept this rider?</Text>
              <Text style={styles.confirmBody}>
                Your exact meeting point stays hidden until you send it. You can share it from the chat once you’re set.
              </Text>
              <TouchableOpacity
                style={[styles.confirmPrimary, respondingFor && { opacity: 0.6 }]}
                onPress={() => { const id = acceptTarget; setAcceptTarget(null); if (id) void respondToRequest(id, 'ACCEPTED') }}
                disabled={!!respondingFor}
              >
                <Text style={styles.confirmPrimaryText}>Accept rider</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setAcceptTarget(null)}>
                <Text style={styles.confirmCancelText}>Not yet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Send exact coordinates confirmation (sensitive + one-way) */}
        <Modal visible={!!coordsTarget} transparent animationType="fade" onRequestClose={() => setCoordsTarget(null)}>
          <View style={styles.confirmOverlay}>
            <View style={[styles.confirmSheet, { borderColor: C.accentBorder }]}>
              <Text style={styles.confirmTitle}>Send exact meeting point to this rider?</Text>
              <Text style={styles.confirmBody}>
                Only do this once you’re comfortable hosting them — they’ll see your precise coordinates in the chat.
              </Text>
              <TouchableOpacity
                style={[styles.confirmPrimary, sendingCoordsFor && { opacity: 0.6 }]}
                onPress={() => { const req = coordsTarget; setCoordsTarget(null); if (req) void sendCoordinates(req) }}
                disabled={!!sendingCoordsFor}
              >
                <Text style={styles.confirmPrimaryText}>Send exact location</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setCoordsTarget(null)}>
                <Text style={styles.confirmCancelText}>Not yet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <FlatList
          ref={flatRef}
          data={chatItems}
          keyExtractor={it => it.id}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() => { if (autoStickRef.current) flatRef.current?.scrollToEnd({ animated: false }) }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
            const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
            const nearBottom = distanceFromBottom < 120
            nearBottomRef.current = nearBottom
            // While opening, ignore transient scroll positions so we stay pinned.
            if (!openingRef.current) autoStickRef.current = nearBottom
          }}
          scrollEventThrottle={16}
	          ListFooterComponent={(() => {
	            // Only still-pending rating prompts live in the footer. A submitted review is
	            // rendered inline in the timeline (see chatItems), not here.
	            const pending = endedStays.filter(stay => !myReviewsByStay[stay.id])
	            if (!pending.length) return null
	            return (
	              <View>
	                {pending.map(stay => {
	                  const isReviewingGuest = currentUser?.id === stay.host_id
	                  const dates = `${fmtDateStr(stay.arrival_date)}–${fmtDateStr(stay.departure_date)}`
	                  const stars = reviewDraftStars[stay.id] || 0
	                  return (
	                    <View key={stay.id} style={styles.reviewCard}>
	                      <Text style={styles.reviewTitle}>
	                        {isReviewingGuest ? '⭐ RATE THIS RIDER' : '⭐ RATE THIS STAY'} · {dates}
	                      </Text>
	                      <View style={styles.reviewStars}>
	                        {[1,2,3,4,5].map(n => (
	                          <TouchableOpacity key={n} onPress={() => setReviewDraftStars(p => ({ ...p, [stay.id]: n }))} hitSlop={8}>
	                            <Text style={[styles.reviewStar, n <= stars && styles.reviewStarActive]}>★</Text>
	                          </TouchableOpacity>
	                        ))}
	                      </View>
	                      <TextInput
	                        style={styles.reviewInput}
	                        placeholder={isReviewingGuest ? 'How was this rider? (optional)' : 'How was this stay? (optional)'}
	                        placeholderTextColor={C.placeholder}
	                        value={reviewDraftBody[stay.id] || ''}
	                        onChangeText={t => setReviewDraftBody(p => ({ ...p, [stay.id]: t }))}
	                        multiline
	                        maxLength={500}
	                      />
	                      <Text style={styles.reviewPrivacyHint}>🔒 Keep exact addresses and coordinates out of reviews.</Text>
	                      <TouchableOpacity
	                        style={[styles.reviewSubmit, (!stars || submittingStayId === stay.id) && styles.reviewSubmitDisabled]}
	                        onPress={() => submitReview(stay.id)}
	                        disabled={!stars || submittingStayId === stay.id}
	                      >
	                        <Text style={styles.reviewSubmitText}>{submittingStayId === stay.id ? 'Submitting...' : 'SUBMIT REVIEW'}</Text>
	                      </TouchableOpacity>
	                    </View>
	                  )
	                })}
	              </View>
	            )
	          })()}
	          renderItem={({ item }) => {
	            if (item.kind === 'day') {
	              return (
	                <View style={styles.dayDivider}>
	                  <Text style={styles.dayDividerText}>{item.label}</Text>
	                </View>
	              )
	            }
	            if (item.kind === 'review') {
	              const dates = `${fmtDateStr(item.stay.arrival_date)}–${fmtDateStr(item.stay.departure_date)}`
	              return (
	                <View style={styles.reviewDone}>
	                  <Text style={styles.reviewDoneText}>
	                    {'⭐'.repeat(item.review.rating)}{'☆'.repeat(5 - item.review.rating)}{'  '}{item.reviewingGuest ? 'You rated this rider' : 'You rated this stay'} · {dates}
	                  </Text>
	                  {item.review.body ? <Text style={styles.reviewDoneBody}>“{item.review.body}”</Text> : null}
	                  <Text style={styles.reviewDoneTime}>{fmtTime(item.review.created_at)}</Text>
	                </View>
	              )
	            }
	            const m = item.msg
	            const isMine = m.sender_id === currentUser?.id
	            const isHost = m.request ? currentUser?.id === m.request.host_id : false
	            const navCoords = extractCoords(m.body)
	            const acceptedAuto = isAcceptedAutoMessage(m.body)
	            const exactPoint = parseExactPointMessage(m.body)

	            if (m.request_id && m.request && !acceptedAuto && !isExactPointMessage(m.body)) {
              return (
                <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                  <RequestCard
                    req={m.request}
                    body={m.body}
	                    isHost={isHost}
	                    onRespond={(id, status) => status === 'ACCEPTED' ? setAcceptTarget(id) : respondToRequest(id, status)}
	                    responding={respondingFor === m.request.id}
	                    onWithdraw={withdrawRequest}
	                    withdrawing={withdrawingFor === m.request.id}
	                    onCancelStay={setCancelStayTarget}
	                    cancelling={cancellingFor === m.request.id}
	                    onShowMap={Platform.OS === 'web' && m.request.location_id ? showLocationOnMap : undefined}
	                  />
                </View>
              )
            }

            if (acceptedAuto) {
              return (
                <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                  <View style={styles.autoCard}>
                    <View style={styles.autoHeader}>
                      <Text style={styles.autoIcon}>✓</Text>
                      <Text style={styles.autoTitle}>Request accepted</Text>
                    </View>
                    <Text style={styles.autoText}>
                      {isMine
                        ? 'You accepted this stay. Share the exact meeting point when you are ready.'
                        : 'The stay is accepted. The host will share the exact meeting point here when you are set.'}
                    </Text>
                    <Text style={styles.autoTime}>{fmtTime(m.created_at)}</Text>
                  </View>
                </View>
              )
            }

            if (exactPoint) {
              return (
                <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                  <View style={styles.meetingCard}>
                    <View style={styles.meetingHeader}>
                      <View style={styles.meetingIcon}>
                        <Feather name="navigation" size={17} color={C.accent} />
                      </View>
                      <View style={styles.meetingHeaderText}>
                        <Text style={styles.meetingTitle}>Exact meeting point</Text>
                        <Text style={styles.meetingCoords}>
                          {exactPoint.coords.lat.toFixed(6)}, {exactPoint.coords.lng.toFixed(6)}
                        </Text>
                      </View>
                    </View>
                    {exactPoint.lines.length ? (
                      <View style={styles.meetingFacts}>
                        {exactPoint.lines.map(line => (
                          <View key={line.label} style={styles.meetingFact}>
                            <Feather name={MEETING_ICONS[line.label] ?? 'info'} size={16} color={C.accent} style={styles.meetingFactIcon} />
                            <Text style={styles.meetingFactValue}>{line.value}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={styles.meetingNavButton}
                      onPress={() => openNavigation(exactPoint.coords.lat, exactPoint.coords.lng)}
                    >
                      <Feather name="navigation" size={14} color={C.white} />
                      <Text style={styles.meetingNavText}>Open navigation</Text>
                    </TouchableOpacity>
                    <Text style={styles.autoTime}>{fmtTime(m.created_at)}</Text>
                  </View>
                </View>
              )
            }

            return (
              <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                  {m.body ? <Text selectable style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{m.body}</Text> : null}
                  {navCoords ? (
                    <TouchableOpacity
                      style={[styles.navAction, isMine && styles.navActionMine]}
                      onPress={() => openNavigation(navCoords.lat, navCoords.lng)}
                    >
                      <Text style={[styles.navActionText, isMine && styles.navActionTextMine]}>Open navigation</Text>
                    </TouchableOpacity>
                  ) : null}
                  {m.photo_url ? (
                    <RequestPhoto path={m.photo_url} style={styles.bubblePhoto} />
                  ) : null}
                  <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>{fmtTime(m.created_at)}</Text>
                </View>
              </View>
            )
          }}
        />

        {coordinateRequest ? (
          <View style={styles.coordinateTray}>
            <View style={styles.coordinateTrayCopy}>
              <Text style={styles.coordinateTrayTitle}>Ready with the meeting point?</Text>
              <Text style={styles.coordinateTrayText}>Send exact coordinates when you and the rider are set.</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.coordinateTrayButton,
                sendingCoordsFor === coordinateRequest.id && styles.coordinateTrayButtonDisabled,
              ]}
              onPress={() => setCoordsTarget(coordinateRequest!)}
              disabled={sendingCoordsFor === coordinateRequest.id}
            >
              <Text style={styles.coordinateTrayButtonText}>
                {sendingCoordsFor === coordinateRequest.id ? 'Sending...' : 'Send coordinates'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {actionError ? (
          <TouchableOpacity style={styles.actionError} onPress={() => setActionError(null)} accessibilityRole="button">
            <Text style={styles.actionErrorText}>⚠️ {actionError}</Text>
            <Text style={styles.actionErrorDismiss}>✕</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { height: Math.max(INPUT_MIN_H, Math.min(INPUT_MAX_H, inputHeight)) }]}
            value={text}
            onChangeText={(t) => { setText(t); if (t.length === 0) setInputHeight(INPUT_MIN_H) }}
            placeholder="Type a message..."
            placeholderTextColor={C.textDim}
            multiline
            maxLength={2000}
            onKeyPress={handleMessageKeyPress}
            onContentSizeChange={e => setInputHeight(e.nativeEvent.contentSize.height)}
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
  const filteredConvs = convs.filter(conv => {
    if (activeFilter === 'all') return true
    return conversationDirection(conv, currentUser?.id) === activeFilter
  })

  return (
    <View style={styles.container}>
      <AppHeader right={<UserChip />} />

      {loading ? (
        <View style={styles.center}>
          <Text style={{ color: C.textDim, fontSize: 14 }}>Loading...</Text>
        </View>
      ) : !currentUser ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyTitle}>Log in to see your knocks and chats.</Text>
          <Text style={styles.emptyText}>Your conversations with hosts and riders live here once you’re signed in.</Text>
          <TouchableOpacity style={styles.loginCtaBtn} onPress={() => router.push({ pathname: '/' })}>
            <Text style={styles.loginCtaText}>Log in</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ paddingVertical: 8 }} onPress={() => router.push({ pathname: '/', params: { signup: '1' } })}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700' }}>New here? Create a free account</Text>
          </TouchableOpacity>
        </View>
      ) : convs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏕️</Text>
          <Text style={styles.emptyTitle}>Safe night for your bike and you.</Text>
          <Text style={styles.emptyText}>From riders to riders.{'\n\n'}Find a host on the map and send them a request — the chat opens automatically.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.convList}>
          <View style={styles.listHeader}>
            <View style={styles.segmented}>
              {([
                ['all', 'All'],
                ['knocks', 'My knocks'],
                ['hosting', 'Hosting'],
              ] as [ConversationFilter, string][]).map(([key, label]) => {
                const active = activeFilter === key
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.segment, active && styles.segmentActive]}
                    onPress={() => setActiveFilter(key)}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {filteredConvs.length === 0 ? (
            <View style={styles.filteredEmpty}>
              <Text style={styles.filteredEmptyText}>
                {activeFilter === 'knocks'
                  ? 'No knocks sent yet.'
                  : activeFilter === 'hosting'
                    ? 'No hosting requests yet.'
                    : 'No messages yet.'}
              </Text>
            </View>
          ) : filteredConvs
            .map(conv => {
              const name = conv.other.full_name || 'Rider'
              const isUnread = isConvUnread(conv, currentUser?.id, readMap)
              const preview = conv.lastMsgIsRequest
                ? '🤞 Stay request'
                : (conv.lastMsgBody ?? '')
              const status = conversationStatus(C, conv, isUnread, currentUser?.id)
              return (
                <TouchableOpacity
                  key={conv.id}
                  style={styles.convRow}
                  onPress={() => openConv(conv)}
                >
                  <View style={[styles.convCard, isUnread && styles.convCardUnread]}>
                    <View style={styles.convAvatarWrap}>
                      {conv.other.avatar_url ? (
                        <Image source={{ uri: conv.other.avatar_url }} style={styles.convAvatarImg} />
                      ) : (
                        <View style={styles.convAvatar}>
                          <Text style={styles.convAvatarText}>{name.split(' ').map(part => part.charAt(0)).join('').slice(0, 2).toUpperCase()}</Text>
                        </View>
                      )}
                      {isUnread && <View style={styles.unreadDot} />}
                    </View>
                    <View style={styles.convInfo}>
                      <View style={styles.convTopRow}>
                        <Text style={[styles.convName, isUnread && styles.convNameUnread]}>{name}</Text>
                        <Text style={[styles.convTime, isUnread && styles.convTimeUnread]}>{fmtDate(conv.last_message_at)}</Text>
                      </View>
                      <Text style={styles.convLocation} numberOfLines={1}>📍 {conv.locationLabel}</Text>
                      {preview ? (
                        <Text style={[styles.convPreview, isUnread && styles.convPreviewUnread]} numberOfLines={1}>
                          {preview}
                        </Text>
                      ) : null}
                    </View>
                    {conv.hasRequest && (
                      <View style={[styles.convStatusBadge, { backgroundColor: status.bg, borderColor: status.border }]}>
                        <Text style={[styles.convStatusText, { color: status.color }]}>{status.label}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
        </ScrollView>
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 46, paddingBottom: 14,
    backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: 1, flex: 1 },
  titleAccent: { color: C.accent },

  // Host cancel-stay confirmation
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmSheet: { backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, gap: 12, borderWidth: 1, borderColor: C.errorBorder },
  confirmTitle: { color: C.text, fontSize: 20, fontWeight: '900' },
  confirmBody: { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  confirmDanger: { height: 50, borderRadius: 100, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmDangerText: { color: C.white, fontSize: 14, fontWeight: '800' },
  confirmPrimary: { height: 50, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmPrimaryText: { color: C.white, fontSize: 14, fontWeight: '800' },
  confirmCancel: { alignItems: 'center', paddingVertical: 8 },
  confirmCancelText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline' },
  chatAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.border, overflow: 'hidden',
  },
  chatAvatarText: { color: C.accent, fontWeight: '800', fontSize: 15 },
  chatAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  chatPeek: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatIdentity: { flex: 1, paddingHorizontal: 10 },
  chatName: { color: C.text, fontSize: 16, fontWeight: '700' },
  chatLocation: { color: C.textDim, fontSize: 11, marginTop: 1 },

  // Messages
  msgList: { padding: 16, gap: 8, paddingBottom: 8 },
  msgRow: { flexDirection: 'row' },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%', borderRadius: 20, padding: 12,
    backgroundColor: C.surface, gap: 4,
  },
  bubbleMine: { backgroundColor: C.accent },
  bubbleOther: { backgroundColor: C.surface },
  bubbleText: { color: C.text, fontSize: 14, lineHeight: 21 },
  bubbleTextMine: { color: C.white },
  navAction: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: C.accentSoft,
  },
  navActionMine: {
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  navActionText: { color: C.accent, fontSize: 12, fontWeight: '800' },
  navActionTextMine: { color: C.white },
  bubblePhoto: { width: 220, height: 160, borderRadius: 14 },
  bubbleTime: { color: C.textDim, fontSize: 10, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.55)' },
  autoCard: {
    maxWidth: '82%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.successBorder,
    backgroundColor: C.successSoft,
    padding: 12,
    gap: 6,
  },
  autoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  autoIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: C.success,
    color: C.white,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 13,
    fontWeight: '900',
  },
  autoTitle: {
    color: C.success,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  autoText: {
    color: C.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  autoTime: {
    color: C.textDim,
    fontSize: 10,
    alignSelf: 'flex-end',
  },
  // Matches the Stay request / Your knock card for a consistent look.
  meetingCard: {
    maxWidth: '90%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: 14,
    gap: 10,
  },
  meetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meetingIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  meetingTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '900',
  },
  meetingCoords: {
    color: C.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  meetingFacts: { gap: 11, paddingVertical: 2 },
  meetingFact: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  meetingFactIcon: { marginTop: 2, width: 18 },
  meetingFactValue: { flex: 1, color: C.text, fontSize: 14, lineHeight: 20 },
  meetingNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 100,
    backgroundColor: C.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  meetingNavText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '900',
  },

  // Input
  coordinateTray: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  coordinateTrayCopy: {
    flex: 1,
    minWidth: 180,
    gap: 2,
  },
  coordinateTrayTitle: {
    color: C.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  coordinateTrayText: {
    color: C.textDim,
    fontSize: 12,
    lineHeight: 16,
  },
  coordinateTrayButton: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
    backgroundColor: C.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 38,
  },
  coordinateTrayButtonDisabled: { opacity: 0.65 },
  coordinateTrayButtonText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '900',
  },
  actionError: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.errorSoft, borderTopWidth: 1, borderTopColor: C.errorBorder,
  },
  actionErrorText: { flex: 1, color: C.error, fontSize: 13, lineHeight: 18 },
  actionErrorDismiss: { color: C.error, fontSize: 14, fontWeight: '800' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  input: {
    flex: 1, backgroundColor: C.elevated, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    color: C.text, fontSize: 15, lineHeight: 20, textAlignVertical: 'top', minWidth: 0,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: C.border },
  sendBtnText: { color: C.white, fontSize: 18, fontWeight: '700', lineHeight: 20 },

  // Conversation list
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: C.textDim, fontSize: 13, textAlign: 'center', lineHeight: 21 },
  loginCtaBtn: { marginTop: 20, backgroundColor: C.accent, borderRadius: 100, paddingHorizontal: 32, paddingVertical: 13, minWidth: 200, alignItems: 'center' },
  loginCtaText: { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  convList: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 8,
  },
  listHeader: {
    paddingBottom: 8,
  },
  segmented: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 46,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: 4,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentActive: {
    backgroundColor: C.accent,
  },
  segmentText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  segmentTextActive: {
    color: C.white,
  },
  filteredEmpty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  filteredEmptyText: {
    color: C.textDim,
    fontSize: 13,
    lineHeight: 20,
  },
  convRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 0, paddingVertical: 0,
  },
  convCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 78,
    paddingVertical: 13,
    paddingLeft: 10,
    // A transparent left bar on read rows keeps content aligned with unread rows,
    // which add a coloured bar.
    borderLeftWidth: 3, borderLeftColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  // Unread: a clear tint over the whole row + a left accent bar, so a new message
  // is impossible to miss. Clears once read.
  convCardUnread: {
    backgroundColor: C.accentSoft,
    borderLeftColor: C.accent,
  },
  convAvatarWrap: { position: 'relative' },
  convAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  convAvatarImg: {
    width: 52, height: 52, borderRadius: 26,
  },
  convAvatarText: { color: C.white, fontWeight: '900', fontSize: 17 },
  unreadDot: {
    position: 'absolute', top: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg,
  },
  convInfo: { flex: 1, gap: 4, minWidth: 0 },
  convTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convName: { color: C.text, fontWeight: '800', fontSize: 16, flex: 1, paddingRight: 8 },
  convNameUnread: { fontWeight: '900' },
  convTime: { color: C.textDim, fontSize: 12 },
  convTimeUnread: { color: C.accent, fontWeight: '800' },
  convPreview: { color: C.textDim, fontSize: 13, lineHeight: 18 },
  convLocation: { color: C.textMuted, fontSize: 11, lineHeight: 16 },
  // Unread: dark + bold so a new message is obvious at a glance in the list.
  convPreviewUnread: { color: C.text, fontWeight: '800' },
  convStatusBadge: {
    borderRadius: 100,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    maxWidth: 104,
  },
  convStatusText: { fontSize: 11, fontWeight: '800' },

  reviewCard: {
    backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.accentBorder,
    padding: 16, gap: 12, marginTop: 16,
  },
  reviewTitle: { color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  reviewStars: { flexDirection: 'row', gap: 8 },
  reviewStar: { fontSize: 32, color: C.border },
  reviewStarActive: { color: C.accent },
  reviewInput: {
    backgroundColor: C.elevated, borderRadius: 14, padding: 12,
    color: C.text, fontSize: 16, minHeight: 60,
    borderWidth: 1, borderColor: C.border,
  },
  reviewPrivacyHint: { color: C.textDim, fontSize: 12, lineHeight: 17 },
  reviewSubmit: {
    backgroundColor: C.accent, borderRadius: 100, padding: 13, alignItems: 'center',
  },
  reviewSubmitDisabled: { backgroundColor: C.elevated },
  reviewSubmitText: { color: C.white, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  reviewDone: {
    backgroundColor: C.accentSoft, borderRadius: 14, borderWidth: 1, borderColor: C.accentBorder,
    padding: 12, alignItems: 'center', alignSelf: 'center', maxWidth: '92%',
  },
  reviewDoneText: { color: C.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  reviewDoneBody: { color: C.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
  reviewDoneTime: { color: C.textDim, fontSize: 10, marginTop: 6, textAlign: 'center' },
  // Day separator in the chat timeline.
  dayDivider: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  dayDividerText: {
    color: C.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4, overflow: 'hidden',
  },
}) }
