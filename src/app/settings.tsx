import { useMemo, useState, type ComponentProps } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { LANGUAGES, useLanguage } from '../lib/i18n'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

export default function SettingsScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const { lang, setLang, t } = useLanguage()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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
        {/* Language */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Feather name="globe" size={16} color={C.accent} />
              <Text style={styles.cardHeadText}>{t('settings.language')}</Text>
            </View>
            {LANGUAGES.map((l, i) => {
              const active = l.code === lang
              return (
                <TouchableOpacity key={l.code} style={[styles.langRow, i > 0 && styles.rowBorder]} onPress={() => setLang(l.code)} activeOpacity={0.6}>
                  <Text style={[styles.langLabel, active && styles.langLabelActive]}>{l.label}</Text>
                  {active ? <Feather name="check" size={18} color={C.accent} /> : null}
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={styles.hint}>{t('settings.languageHint')}</Text>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
          <View style={styles.card}>
            {accountRows.map((it, i) => (
              <TouchableOpacity key={it.label} style={[styles.menuRow, i > 0 && styles.rowBorder]} onPress={it.onPress} activeOpacity={0.6}>
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
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    cardHeadText: { color: C.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
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
