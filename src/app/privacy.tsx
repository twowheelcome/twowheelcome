import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

const CONTACT_EMAIL = 'privacy@twowheelcome.com'

export default function PrivacyScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>TWOWHEELCOME</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: 26 June 2026</Text>

        <Text style={styles.body}>
          TWOWHEELCOME helps riders find a safe overnight spot for their bike and themselves. We keep privacy simple: public map pins are approximate, and exact meeting points are shared by the host only when both sides agree in chat.
        </Text>

        <Text style={styles.body}>
          TWOWHEELCOME is only an intermediary that connects riders and hosts — it does not provide accommodation and is not a party to any stay. Using the app and arranging stays is at your own risk; see the Terms of Use for the full liability disclaimer.
        </Text>

        <Section title="Who controls your data">
          <Text style={styles.body}>
            The TWOWHEELCOME operator is the data controller: [OPERATOR LEGAL NAME], [LEGAL FORM], [REGISTERED ADDRESS], [COUNTRY], ID/registration no. [ID]. These details must be completed before public launch. Privacy requests can be sent to {CONTACT_EMAIL}, which is also the single point of contact for users and authorities under the Digital Services Act.
          </Text>
        </Section>

        <Section title="Data we collect">
          <Bullet>Email address and authentication data, used to create and protect your account.</Bullet>
          <Bullet>Profile details you add, such as name, avatar and public host profile information.</Bullet>
          <Bullet>Host listing details, including approximate public location, parking type, sleep options, amenities, public description and listing photos. Exact coordinates and private listing labels are not public.</Bullet>
          <Bullet>Stay requests, messages, reviews, push tokens and account activity needed to run the service.</Bullet>
        </Section>

        <Section title="Why we may process it">
          <Bullet>Contract: to create your account and provide stay requests, conversations and reviews.</Bullet>
          <Bullet>Legitimate interests: to secure the service, prevent abuse, diagnose failures and protect riders.</Bullet>
          <Bullet>Consent: for optional device permissions and notifications where the law requires it. You can withdraw consent in device settings.</Bullet>
          <Bullet>Legal obligation: where records must be retained or disclosed under applicable law.</Bullet>
        </Section>

        <Section title="How we use it">
          <Bullet>To let riders send stay requests and hosts respond.</Bullet>
          <Bullet>To show approximate host areas on the public map while protecting exact addresses.</Bullet>
          <Bullet>To send important emails about stay requests, account access and reviews.</Bullet>
          <Bullet>To keep the app safe, prevent abuse, debug problems and improve the product.</Bullet>
        </Section>

        <Section title="Location privacy">
          <Text style={styles.body}>
            Public host locations are intentionally approximate. Exact coordinates are not shown on the map. A host can send an exact meeting point inside a conversation after accepting a stay request.
          </Text>
        </Section>

        <Section title="Services we use">
          <Text style={styles.body}>
            We use Supabase for authentication, database, storage and edge functions. We may use Resend or a similar email provider for transactional emails. These providers process data only so TWOWHEELCOME can operate.
          </Text>
          <Text style={styles.body}>
            Providers may process data outside your country. Where data leaves the EEA, the operator must verify the configured processing regions and use an approved transfer safeguard, such as the European Commission&apos;s Standard Contractual Clauses.
          </Text>
        </Section>

        <Section title="How long we keep it">
          <Bullet>Account and listing data: while your account is active, then removed when you delete it.</Bullet>
          <Bullet>Uploaded avatars and request photos: removed with account deletion.</Bullet>
          <Bullet>Security and diagnostic logs: only as long as needed for security and troubleshooting, normally no more than 90 days.</Bullet>
          <Bullet>Backups: deleted data may remain in protected rolling backups for up to 30 days before automatic expiry.</Bullet>
          <Bullet>Data required for a legal claim or obligation may be retained longer, only for that purpose.</Bullet>
        </Section>

        <Section title="Your choices">
          <Bullet>You can edit your profile and listing details in the app.</Bullet>
          <Bullet>You can delete your account from Profile. This removes your profile, listings, requests, reviews, messages you sent and uploaded media. Messages sent by another rider remain as their data, with your identity removed.</Bullet>
          <Bullet>You may request access, correction, deletion, restriction, objection or a portable copy by emailing {CONTACT_EMAIL}. We may need to verify your identity and normally respond within one month.</Bullet>
          <Bullet>You may complain to the data protection authority where you live or work. The controller&apos;s lead supervisory authority must be named here once the operator&apos;s country is confirmed.</Bullet>
        </Section>

        <Section title="Before public launch">
          <Text style={styles.body}>
            The controller&apos;s legal identity, address, lead supervisory authority, actual provider regions and transfer safeguards still require confirmation and legal review before public launch.
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
    updated: { color: C.textDim, fontSize: 13, marginTop: -8 },
    body: { color: C.textMuted, fontSize: 15, lineHeight: 23 },
    section: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, gap: 9 },
    sectionTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bulletMark: { color: C.accent, fontSize: 15, lineHeight: 22, fontWeight: '900' },
    bulletText: { flex: 1, color: C.textMuted, fontSize: 15, lineHeight: 22 },
  })
}
