import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

const CONTACT_EMAIL = 'privacy@twowheelcome.com'

export default function TermsScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>TWOWHEELCOME</Text>
        <Text style={styles.title}>Terms of Use</Text>
        <Text style={styles.updated}>Last updated: 17 June 2026</Text>

        <Text style={styles.body}>
          TWOWHEELCOME is a rider-to-rider community for finding and offering safe overnight spots. It is not a hotel, booking agency, travel operator or emergency service.
        </Text>

        <Section title="Community use">
          <Bullet>Use the app honestly and respectfully.</Bullet>
          <Bullet>Only offer places you are allowed to offer.</Bullet>
          <Bullet>Do not share false listings, spam, abusive messages or unsafe instructions.</Bullet>
          <Bullet>Guests and hosts are responsible for agreeing on timing, access, house rules and any contribution.</Bullet>
        </Section>

        <Section title="Stay requests">
          <Text style={styles.body}>
            A stay request starts a conversation. A stay is only agreed when the host accepts and both sides are comfortable with the details. Hosts decide when to share the exact meeting point.
          </Text>
        </Section>

        <Section title="Safety">
          <Text style={styles.body}>
            Riders and hosts must use their own judgement. Check details before travelling, meet safely and do not continue with a stay if something feels wrong.
          </Text>
        </Section>

        <Section title="Reviews">
          <Text style={styles.body}>
            Reviews should describe real experiences. Do not post threats, private contact details, hate speech or information you do not have the right to share.
          </Text>
        </Section>

        <Section title="Accounts">
          <Bullet>You are responsible for keeping your login secure.</Bullet>
          <Bullet>You can delete your account from Profile.</Bullet>
          <Bullet>We may remove accounts, listings or content that abuse the service or put riders at risk.</Bullet>
        </Section>

        <Section title="Contact">
          <Text style={styles.body}>
            Questions about these terms or privacy can be sent to {CONTACT_EMAIL}.
          </Text>
        </Section>
      </ScrollView>
    </View>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Bullet({ children }: { children: ReactNode }) {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletMark}>-</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, paddingBottom: 60, gap: 16 },
    kicker: { color: C.accent, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
    title: { color: C.text, fontSize: 30, fontWeight: '900', lineHeight: 36 },
    updated: { color: C.textDim, fontSize: 13, marginTop: -8 },
    body: { color: C.textMuted, fontSize: 15, lineHeight: 23 },
    section: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, gap: 9 },
    sectionTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bulletMark: { color: C.accent, fontSize: 15, lineHeight: 22, fontWeight: '900' },
    bulletText: { flex: 1, color: C.textMuted, fontSize: 15, lineHeight: 22 },
  })
}
