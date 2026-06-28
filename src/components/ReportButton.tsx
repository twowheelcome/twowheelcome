import { useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, Modal, StyleSheet } from 'react-native'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'

type TargetType = 'user' | 'listing' | 'message' | 'conversation'

// Minimal DSA notice mechanism: a "Report" affordance that captures the report (stored +
// emailed to the admin via the `report` edge function). No moderation UI, no auto-hide.
export function ReportButton({
  targetType,
  targetId,
  label = 'Report',
  style,
  controlledOpen,
  onRequestClose,
}: {
  targetType: TargetType
  targetId: string
  label?: string
  style?: object
  // Controlled mode: when `controlledOpen` is provided, the default trigger is hidden and
  // the modal's visibility is driven by the parent (e.g. from a "⋯" menu item).
  controlledOpen?: boolean
  onRequestClose?: () => void
}) {
  const C = useTheme()
  const s = useMemo(() => makeStyles(C), [C])
  const controlled = controlledOpen !== undefined
  const [openState, setOpenState] = useState(false)
  const open = controlled ? !!controlledOpen : openState
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset on close so the next open (controlled or not) starts fresh.
  const close = () => {
    setReason(''); setDone(false); setError(null)
    if (controlled) onRequestClose?.(); else setOpenState(false)
  }

  async function submit() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Please log in to report.'); setBusy(false); return }
      const res = await supabase.functions.invoke('report', {
        body: { target_type: targetType, target_id: targetId, reason: reason.trim() || undefined },
      })
      if (res.error) throw res.error
      setDone(true)
    } catch (e: unknown) {
      console.warn('report error:', e instanceof Error ? e.message : e)
      setError("Couldn't send your report. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!controlled && (
        <TouchableOpacity onPress={() => { setReason(''); setDone(false); setError(null); setOpenState(true) }} hitSlop={8} style={style}>
          <Text style={s.link}>🚩 {label}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            {done ? (
              <>
                <Text style={s.title}>Thanks — we&apos;ve received your report.</Text>
                <Text style={s.body}>Our team will take a look. You won&apos;t get an automatic reply.</Text>
                <TouchableOpacity style={s.primary} onPress={close}>
                  <Text style={s.primaryText}>Close</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.title}>Report this {targetType}</Text>
                <Text style={s.body}>Tell us what&apos;s wrong (optional). This goes to the TWOWHEELCOME team.</Text>
                <TextInput
                  style={s.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="What's the problem?"
                  placeholderTextColor={C.placeholder}
                  multiline
                  maxLength={2000}
                />
                {error ? <Text style={s.error}>{error}</Text> : null}
                <TouchableOpacity style={[s.primary, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
                  <Text style={s.primaryText}>{busy ? 'Sending…' : 'Send report'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancel} onPress={close} disabled={busy}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    link: { color: C.textDim, fontSize: 13, fontWeight: '600' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    sheet: { backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, gap: 12, borderWidth: 1, borderColor: C.border },
    title: { color: C.text, fontSize: 19, fontWeight: '900' },
    body: { color: C.textMuted, fontSize: 14, lineHeight: 21 },
    input: { backgroundColor: C.elevated, borderRadius: 12, padding: 12, color: C.text, fontSize: 15, lineHeight: 21, minHeight: 80, borderWidth: 1, borderColor: C.border, textAlignVertical: 'top' },
    error: { color: C.error, fontSize: 13 },
    primary: { height: 48, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryText: { color: C.white, fontSize: 14, fontWeight: '800' },
    cancel: { alignItems: 'center', paddingVertical: 8 },
    cancelText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline' },
  })
}
