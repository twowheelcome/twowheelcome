import { useMemo } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { MAP_APPS, openMapApp } from '../lib/mapApps'

// Shared map-app picker used by both navigate buttons (approximate area + exact
// "Address unlocked" point). Open it by passing a coordinate target; close clears it.
export function MapAppPicker({
  target,
  onClose,
  message = 'Pick an app to navigate there.',
}: {
  target: { lat: number; lng: number } | null
  onClose: () => void
  message?: string
}) {
  const C = useTheme()
  const s = useMemo(() => makeStyles(C), [C])
  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>Open in maps</Text>
          <Text style={s.body}>{message}</Text>
          {MAP_APPS.map(app => (
            <TouchableOpacity
              key={app.key}
              style={s.option}
              onPress={() => { const t = target; onClose(); if (t) openMapApp(app.url(t.lat, t.lng)) }}
              accessibilityRole="button"
            >
              <Feather name={app.icon} size={16} color={C.accent} />
              <Text style={s.optionText}>{app.label}</Text>
              <Feather name="external-link" size={15} color={C.textDim} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.cancel} onPress={onClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, gap: 12, borderWidth: 1, borderColor: C.border },
  title: { color: C.text, fontSize: 20, fontWeight: '900' },
  body: { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  optionText: { flex: 1, color: C.text, fontSize: 15, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline' },
}) }
