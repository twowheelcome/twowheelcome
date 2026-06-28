import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, useThemeMode, type ThemeColors, type ThemeMode } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { LANGUAGES, useLanguage, type LangCode } from '../lib/i18n'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

export default function SettingsScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const { lang, setLang, t } = useLanguage()
  const { mode, setMode } = useThemeMode()
  const APPEARANCE: { value: ThemeMode; label: string; icon: ComponentProps<typeof Feather>['name'] }[] = [
    { value: 'system', label: 'System', icon: 'smartphone' },
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
  ]
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [showLangModal, setShowLangModal] = useState(false)
  const [tempLang, setTempLang] = useState<LangCode>(lang)
  const currentLangLabel = LANGUAGES.find(l => l.code === lang)?.label ?? 'English'
  // Read-only email of the signed-in account (shown in Account; not editable here).
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => { if (active) setEmail(data.user?.email ?? null) })
    return () => { active = false }
  }, [])

  async function deleteAccount() {
    setDeleting(true)
    setDeleteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke('delete-account', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      if (res.error) throw res.error
      await supabase.auth.signOut()
      router.replace('/')
    } catch (e: any) {
      console.warn('delete account error:', e?.message)
      setDeleteError('Could not delete your account right now. Please try again.')
      setDeleting(false)
    }
  }

  const accountRows: { icon: ComponentProps<typeof Feather>['name']; label: string; sub: string; onPress: () => void }[] = [
    { icon: 'bell', label: t('settings.notifications'), sub: t('settings.notificationsSub'), onPress: () => router.push('/notifications') },
    { icon: 'message-circle', label: t('settings.feedback'), sub: t('settings.feedbackSub'), onPress: () => router.push('/feedback' as never) },
    { icon: 'slash', label: t('settings.blocked'), sub: t('settings.blockedSub'), onPress: () => router.push('/blocked' as never) },
    { icon: 'shield', label: t('settings.privacy'), sub: t('settings.privacySub'), onPress: () => router.push('/privacy') },
    { icon: 'file-text', label: t('settings.terms'), sub: t('settings.termsSub'), onPress: () => router.push('/terms') },
  ]

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />}>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </AppHeader>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Appearance — Light / Dark / System */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
          <View style={styles.segRow}>
            {APPEARANCE.map(opt => {
              const active = mode === opt.value
              return (
                <TouchableOpacity key={opt.value} style={[styles.segBtn, active && styles.segBtnActive]} onPress={() => setMode(opt.value)} activeOpacity={0.7}>
                  <Feather name={opt.icon} size={16} color={active ? C.white : C.textMuted} />
                  <Text style={[styles.segText, active && styles.segTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Language — row shows the current choice; tap opens a picker */}
          <View style={styles.card}>
            <TouchableOpacity style={styles.menuRow} onPress={() => { setTempLang(lang); setShowLangModal(true) }} activeOpacity={0.6}>
              <View style={styles.menuRowIcon}><Feather name="globe" size={17} color={C.accent} /></View>
              <View style={styles.menuRowText}>
                <Text style={styles.menuRowTitle}>{t('settings.language')}</Text>
                <Text style={styles.menuRowSub}>{currentLangLabel}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={C.textDim} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>{t('settings.languageHint')}</Text>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
          <View style={styles.card}>
            {/* Signed-in email — read-only, no chevron (not editable from the app) */}
            {email ? (
              <View style={styles.menuRow}>
                <View style={styles.menuRowIcon}><Feather name="mail" size={17} color={C.accent} /></View>
                <View style={styles.menuRowText}>
                  <Text style={styles.menuRowTitle}>{t('settings.email')}</Text>
                  <Text style={styles.menuRowSub} numberOfLines={1}>{email}</Text>
                </View>
              </View>
            ) : null}
            {accountRows.map((it, i) => (
              <TouchableOpacity key={it.label} style={[styles.menuRow, (email || i > 0) && styles.rowBorder]} onPress={it.onPress} activeOpacity={0.6}>
                <View style={styles.menuRowIcon}><Feather name={it.icon} size={17} color={C.accent} /></View>
                <View style={styles.menuRowText}>
                  <Text style={styles.menuRowTitle}>{it.label}</Text>
                  <Text style={styles.menuRowSub} numberOfLines={1}>{it.sub}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={C.textDim} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={() => { setDeleteError(''); setShowDeleteConfirm(true) }}>
          <Text style={styles.deleteBtnText}>{t('settings.deleteAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showLangModal} transparent animationType="fade" onRequestClose={() => setShowLangModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('settings.language')}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {LANGUAGES.map((l, i) => {
                const active = l.code === tempLang
                return (
                  <TouchableOpacity key={l.code} style={[styles.langRow, i > 0 && styles.rowBorder]} onPress={() => setTempLang(l.code)} activeOpacity={0.6}>
                    <Text style={[styles.langLabel, active && styles.langLabelActive]}>{l.label}</Text>
                    {active ? <Feather name="check" size={18} color={C.accent} /> : null}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalDone} onPress={() => { setLang(tempLang); setShowLangModal(false) }}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowLangModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteSheet}>
            <Text style={styles.deleteSheetTitle}>Delete account?</Text>
            <Text style={styles.deleteSheetBody}>
              This permanently deletes your profile, listings, requests, your messages and reviews. Shared conversations may remain for the other person without your profile. This can&apos;t be undone.
            </Text>
            {deleteError ? <Text style={styles.deleteSheetError}>{deleteError}</Text> : null}
            <TouchableOpacity style={[styles.deleteConfirmBtn, deleting && { opacity: 0.6 }]} onPress={deleteAccount} disabled={deleting}>
              <Text style={styles.deleteConfirmBtnText}>{deleting ? 'Deleting...' : 'Yes, permanently delete'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteCancelBtn} onPress={() => setShowDeleteConfirm(false)} disabled={deleting}>
              <Text style={styles.deleteCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    headerTitle: { color: C.text, fontSize: 20, fontFamily: FONT.headBold, textAlign: 'center' },
    content: { padding: 18, gap: 18, maxWidth: 700, width: '100%', alignSelf: 'center' },
    section: { gap: 8 },
    sectionTitle: { color: C.textDim, fontSize: 11, fontFamily: FONT.head, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 4 },
    card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
    segRow: { flexDirection: 'row', gap: 8 },
    segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
    segBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
    segText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
    segTextActive: { color: C.white },
    rowBorder: { borderTopWidth: 1, borderTopColor: C.border },
    langRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
    langLabel: { color: C.textMuted, fontSize: 15, fontFamily: FONT.body },
    langLabelActive: { color: C.text, fontWeight: '700' },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    menuRowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },
    menuRowText: { flex: 1, gap: 1 },
    menuRowTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
    menuRowSub: { color: C.textDim, fontSize: 12, fontFamily: FONT.body },
    hint: { color: C.textDim, fontSize: 12, lineHeight: 17, fontFamily: FONT.body, marginLeft: 4 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    modalSheet: { backgroundColor: C.bg, borderRadius: 20, padding: 20, width: '100%', maxWidth: 400, gap: 8, borderWidth: 1, borderColor: C.border },
    modalTitle: { color: C.text, fontSize: 18, fontFamily: FONT.headBold, marginBottom: 4 },
    modalDone: { height: 48, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    modalDoneText: { color: C.white, fontSize: 15, fontFamily: FONT.head, letterSpacing: 0.5, textTransform: 'uppercase' },
    modalCancel: { alignItems: 'center', paddingVertical: 8 },
    modalCancelText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline' },
    deleteBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
    deleteBtnText: { color: C.error, fontSize: 13, textDecorationLine: 'underline' },
    deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    deleteSheet: { backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, gap: 12, borderWidth: 1, borderColor: C.errorBorder },
    deleteSheetTitle: { color: C.text, fontSize: 20, fontWeight: '900' },
    deleteSheetBody: { color: C.textMuted, fontSize: 14, lineHeight: 21 },
    deleteSheetError: { color: C.error, fontSize: 13 },
    deleteConfirmBtn: { height: 50, borderRadius: 100, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    deleteConfirmBtnText: { color: C.white, fontSize: 14, fontWeight: '800' },
    deleteCancelBtn: { alignItems: 'center', paddingVertical: 8 },
    deleteCancelBtnText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline' },
  })
}
