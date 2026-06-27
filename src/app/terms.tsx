import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
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
        <Text style={styles.updated}>Last updated: 26 June 2026</Text>

        <Text style={styles.body}>
          TWOWHEELCOME is a small rider-built community tool. It helps riders find each other, ask for a safe overnight spot, and agree on details directly in chat. We do not provide, inspect or guarantee any place, host, rider or stay. Use your own judgement, protect yourself and your bike, and only meet or host when it feels right.
        </Text>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTitle}>⚠️ Important — please read</Text>
          <Text style={styles.disclaimerText}>
            TWOWHEELCOME is a rider-to-rider directory and messaging tool, not a booking service, hotel, travel operator or emergency service. Any stay, payment, meeting point or arrangement is strictly between the rider and the host. You are responsible for your own safety, belongings, bike, insurance and local legal compliance. To the maximum extent permitted by law, TWOWHEELCOME is not liable for losses, disputes or harm arising from user-to-user arrangements.
          </Text>
        </View>

        <Section title="What TWOWHEELCOME is — and is not">
          <Bullet>It is a directory and messaging tool that connects riders with hosts.</Bullet>
          <Bullet>It does not own, run, inspect, endorse or guarantee any place, host, rider or listing.</Bullet>
          <Bullet>It is not a party to any stay. Any stay, payment or arrangement is strictly between the rider and the host.</Bullet>
          <Bullet>You decide whether to meet, stay, host or pay, and you remain responsible for your own safety, belongings, insurance and legal compliance.</Bullet>
        </Section>

        <Section title="Community use">
          <Bullet>Use the app honestly and respectfully.</Bullet>
          <Bullet>Only offer places you are allowed to offer.</Bullet>
          <Bullet>Do not share false listings, spam, abusive messages or unsafe instructions.</Bullet>
          <Bullet>Riders and hosts are responsible for agreeing on timing, access, house rules and any contribution.</Bullet>
        </Section>

        <Section title="Stay requests">
          <Text style={styles.body}>
            A stay request starts a conversation. A stay is only agreed when the host accepts and both sides are comfortable with the details. Hosts decide when to share the exact meeting point.
          </Text>
        </Section>

        <Section title="Safety">
          <Text style={styles.body}>
            Riders and hosts must use their own judgement and look after their own safety. Check details before travelling, meet safely, tell someone where you are going, and do not continue with a stay if anything feels wrong. TWOWHEELCOME does not vet, background-check or verify any user, place or claim — that is up to you.
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

        <Section title="Governing law & changes">
          <Text style={styles.body}>
            These terms are governed by the law of the operator’s country of establishment (see Operator). We may update them; continued use after a change means you accept the updated terms. If any part is found unenforceable, the rest still applies.
          </Text>
        </Section>

        <Section title="Operator">
          <Text style={styles.body}>
            TWOWHEELCOME is operated by [OPERATOR LEGAL NAME], [LEGAL FORM], [REGISTERED ADDRESS], [COUNTRY], ID/registration no. [ID]. These details must be completed before public launch.
          </Text>
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
    kicker: { color: C.accent, fontSize: 11, fontFamily: FONT.head, letterSpacing: 2, textTransform: 'uppercase' },
    title: { color: C.text, fontSize: 30, fontFamily: FONT.headBold, lineHeight: 36 },
    disclaimer: { backgroundColor: C.warningSoft, borderWidth: 1, borderColor: C.warningBorder, borderRadius: 16, padding: 16, gap: 8 },
    disclaimerTitle: { color: C.warning, fontSize: 15, fontWeight: '900' },
    disclaimerText: { color: C.text, fontSize: 14, lineHeight: 21 },
    updated: { color: C.textDim, fontSize: 13, marginTop: -8 },
    body: { color: C.textMuted, fontSize: 15, lineHeight: 23 },
    section: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, gap: 9 },
    sectionTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bulletMark: { color: C.accent, fontSize: 15, lineHeight: 22, fontWeight: '900' },
    bulletText: { flex: 1, color: C.textMuted, fontSize: 15, lineHeight: 22 },
  })
}
