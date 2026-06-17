import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
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
        <Text style={styles.updated}>Last updated: 17 June 2026</Text>

        <Text style={styles.body}>
          TWOWHEELCOME helps riders find a safe overnight spot for their bike and themselves. We keep privacy simple: public map pins are approximate, and exact meeting points are shared by the host only when both sides agree in chat.
        </Text>

        <Section title="Data we collect">
          <Bullet>Email address and authentication data, used to create and protect your account.</Bullet>
          <Bullet>Profile details you add, such as name, bike model, avatar and public host profile information.</Bullet>
          <Bullet>Host listing details, including approximate public location, parking type, sleep options, amenities and notes.</Bullet>
          <Bullet>Stay requests, messages, reviews, push tokens and account activity needed to run the service.</Bullet>
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
        </Section>

        <Section title="Your choices">
          <Bullet>You can edit your profile and listing details in the app.</Bullet>
          <Bullet>You can delete your account from Profile. This removes your account data from the app.</Bullet>
          <Bullet>You can contact us about access, correction, deletion or other privacy rights at {CONTACT_EMAIL}.</Bullet>
        </Section>

        <Section title="Legal note">
          <Text style={styles.body}>
            This is a practical privacy summary for the current app. It should be reviewed before public launch, especially if the operator details, email provider, analytics or paid features change.
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
