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

        <View style={styles.draft}>
          <Text style={styles.draftTitle}>⚠️ Předběžné znění</Text>
          <Text style={styles.draftText}>
            Toto je pracovní verze podmínek. Než aplikaci finálně spustíme, bude doplněna o údaje provozovatele a zkontrolována právníkem.
          </Text>
          <Text style={styles.draftSub}>Draft — to be finalized before launch.</Text>
        </View>

        <Text style={styles.body}>Effective date: [EFFECTIVE DATE]</Text>
        <Text style={styles.body}>
          This Privacy Policy explains what personal data we collect when you use twowheelcome (the website twowheelcome.com and our mobile apps — the &quot;Service&quot;), why we collect it, the legal basis for using it, who we share it with, and the rights you have under the General Data Protection Regulation (GDPR) and applicable data-protection law.
        </Text>
        <Text style={styles.body}>
          We have tried to write this in plain language. If anything is unclear, contact us using the details in Section 12.
        </Text>

        <Section title="1. Who is responsible for your data (the controller)">
          <Text style={styles.body}>The data controller responsible for your personal data is:</Text>
          <Bullet>[OPERATOR LEGAL NAME]</Bullet>
          <Bullet>Company ID / IČO: [COMPANY ID / IČO]</Bullet>
          <Bullet>Registered address: [REGISTERED ADDRESS]</Bullet>
          <Bullet>Contact email: [CONTACT EMAIL]</Bullet>
          <Text style={styles.body}>
            Data protection contact / DPO: [DPO OR DATA-PROTECTION CONTACT — name and email; state &quot;we have not appointed a DPO&quot; if one is not legally required]
          </Text>
        </Section>

        <Section title="2. What data we collect">
          <Text style={styles.body}>We collect only what we need to run twowheelcome as a connector between riders and hosts:</Text>
          <Text style={styles.label}>Account and profile data</Text>
          <Bullet>Email address (for your account / login)</Bullet>
          <Bullet>Display name</Bullet>
          <Bullet>Nationality</Bullet>
          <Bullet>Short bio</Bullet>
          <Bullet>Profile photo (avatar)</Bullet>
          <Text style={styles.label}>Host listing data</Text>
          <Bullet>Listing location — the host stores this precisely, but it is only ever shown publicly as an approximate area (coordinates rounded to roughly a 1 km radius); the exact location is shared only after a host accepts a stay request, and only in the private chat with that guest (see Section 4).</Bullet>
          <Bullet>Listing details and amenities.</Bullet>
          <Bullet>A self-declared parking-safety level.</Bullet>
          <Text style={styles.label}>Interaction data</Text>
          <Bullet>Private messages between users (in-app chat)</Bullet>
          <Bullet>Stay requests (&quot;knocks&quot;), including the requested dates</Bullet>
          <Bullet>Reviews and replies</Bullet>
          <Text style={styles.label}>Technical and operational data</Text>
          <Bullet>Device push-notification tokens</Bullet>
          <Bullet>Basic technical and usage data needed to run and secure the Service (e.g. log and diagnostic data)</Bullet>
          <Bullet>Optional feedback you send us, and any abuse / report submissions</Bullet>
          <Bullet>Your consent timestamp and the version of the Terms you accepted</Bullet>
          <Text style={styles.body}>
            We do not intentionally collect special-category data (such as health, religion, or political views). Please do not put such data into free-text fields.
          </Text>
        </Section>

        <Section title="3. How and why we use your data, and our legal basis">
          <Text style={styles.body}>
            We use your data for the purposes below; under GDPR we must have a legal basis for each. Each item is shown as: purpose — why — legal basis.
          </Text>
          <Bullet>Create and run your account; let you build a profile — to provide the Service you signed up for — Performance of a contract (Art. 6(1)(b)).</Bullet>
          <Bullet>Publish host listings; let riders send stay requests; let hosts accept/decline; enable in-app chat between matched users — core function of the connector service — Performance of a contract (Art. 6(1)(b)).</Bullet>
          <Bullet>Show host locations only as an approximate area, and reveal exact location only after acceptance — to deliver the service safely as designed — Performance of a contract (Art. 6(1)(b)) and legitimate interests in protecting users (Art. 6(1)(f)).</Bullet>
          <Bullet>Publish reviews and replies — part of the community trust feature you opted into — Performance of a contract (Art. 6(1)(b)).</Bullet>
          <Bullet>Send transactional/service emails and push notifications (e.g. a new knock, a reply, account messages) — to keep you informed — Performance of a contract (Art. 6(1)(b)); for push notifications also your consent where required (Art. 6(1)(a)).</Bullet>
          <Bullet>Record that you agreed to the Terms (consent timestamp + terms version) — to show you accepted, and which version — Legal obligation / legitimate interests (Art. 6(1)(c)/(f)).</Bullet>
          <Bullet>Keep the Service secure, prevent and investigate abuse, fraud, and rule-breaking, and act on reports — to protect users and the platform — Legitimate interests (Art. 6(1)(f)).</Bullet>
          <Bullet>Fix problems, analyse basic usage, and improve the Service — Legitimate interests (Art. 6(1)(f)).</Bullet>
          <Bullet>Respond to your feedback or support requests — Legitimate interests / performance of a contract.</Bullet>
          <Text style={styles.body}>
            Where we rely on consent (e.g. push notifications), you can withdraw it at any time — see Section 7. Where we rely on legitimate interests, we only proceed where our interest is not overridden by your rights; you can object (Section 7).
          </Text>
        </Section>

        <Section title="4. Privacy by design — how we protect location and contact details">
          <Bullet>Approximate location by default. A host&apos;s location is shown publicly only as an approximate area, coordinates rounded to roughly a 1 km radius. The precise location is never shown on the public map.</Bullet>
          <Bullet>Exact location shared only after acceptance. A host&apos;s exact address/location is revealed only after the host accepts a stay request, and only inside the private in-app chat between that host and that guest.</Bullet>
          <Bullet>Automatic stripping of contact details. The app attempts to remove obvious contact details and coordinate strings from public free-text fields (such as listing descriptions and bios). This is a best-effort safeguard, not a guarantee — please still avoid posting personal contact details publicly.</Bullet>
          <Bullet>Deletion that cascades. When you delete your account, the deletion cascades to remove your associated personal data from the active Service (see Section 6 for limits and backups).</Bullet>
        </Section>

        <Section title="5. Who we share your data with">
          <Text style={styles.body}>
            We do not sell your personal data. We do not handle any payments, so we do not share payment data.
          </Text>
          <Text style={styles.label}>Other users</Text>
          <Text style={styles.body}>
            Some of your data is shown to other users by design — for example, your display name, nationality, bio, avatar, host listings (with approximate location), reviews, and the messages you send in chat. Your exact host location is shared with a guest only after you accept their request.
          </Text>
          <Text style={styles.label}>Service providers (processors / sub-processors)</Text>
          <Text style={styles.body}>These process data on our behalf and under our instructions, and currently include:</Text>
          <Bullet>Supabase — Database, user authentication, and file storage hosting.</Bullet>
          <Bullet>Resend — Delivery of transactional and notification emails.</Bullet>
          <Bullet>Vercel — Hosting of the web application.</Bullet>
          <Bullet>Push-notification delivery services (e.g. Expo, Apple Push Notification service, Google / Firebase Cloud Messaging) — delivering push notifications using your device push token.</Bullet>
          <Text style={styles.note}>
            [Operator note (remove before publishing): Confirm a data-processing agreement (DPA) is in place with each provider, verify each provider&apos;s actual data-storage region, and confirm the correct push-notification providers for your build. Update this list to match production.]
          </Text>
          <Text style={styles.body}>
            We may also disclose data where required by law, to enforce our Terms, or to protect the rights, safety, or property of users or the public.
          </Text>
          <Text style={styles.label}>International transfers</Text>
          <Text style={styles.body}>
            Some of these providers may process or store data outside the European Economic Area (EEA) (for example, in the United States). Where data is transferred outside the EEA, we rely on appropriate safeguards such as the European Commission&apos;s Standard Contractual Clauses (SCCs) and/or an adequacy decision, as applicable. You can request more information using the contact details in Section 12.
          </Text>
          <Text style={styles.note}>
            [Operator note (remove before publishing): Confirm the actual hosting region of each provider and which transfer mechanism applies, then state it accurately here.]
          </Text>
        </Section>

        <Section title="6. How long we keep your data">
          <Bullet>We keep your account and profile data for as long as your account is active.</Bullet>
          <Bullet>When you delete your account, we delete or anonymise your associated personal data from the active Service, except where we need to keep limited information longer (e.g. to comply with a legal obligation, resolve disputes, prevent abuse or fraud, or because the data is part of another user&apos;s records — such as a review you left or a chat the other party still relies on).</Bullet>
          <Bullet>Backups are retained for a limited period and then overwritten or deleted on a rolling basis.</Bullet>
          <Bullet>Consent records (your consent timestamp and accepted terms version) are kept for as long as needed to demonstrate compliance.</Bullet>
          <Bullet>Where we cannot give a fixed period, we keep data only for as long as necessary for the purpose it was collected for, and then delete or anonymise it.</Bullet>
          <Text style={styles.note}>
            [Operator note (remove before publishing): Set concrete retention periods (e.g. backups retained for X days; abuse/report records kept for Y months) once decided, and state them here.]
          </Text>
        </Section>

        <Section title="7. Your rights under GDPR">
          <Text style={styles.body}>
            If you are in the EEA (and in many other places), you have the following rights; exercise them by contacting us (Section 12). We respond within the legal time limits (generally one month).
          </Text>
          <Bullet>Access — get a copy of the personal data we hold about you (Art. 15).</Bullet>
          <Bullet>Rectification — have inaccurate or incomplete data corrected (Art. 16).</Bullet>
          <Bullet>Erasure — ask us to delete your data (&quot;right to be forgotten&quot;); you can also delete your account in-app (Art. 17).</Bullet>
          <Bullet>Restriction — ask us to limit how we use your data in certain cases (Art. 18).</Bullet>
          <Bullet>Portability — receive certain data in a structured, commonly used, machine-readable format, or have it sent to another provider where technically feasible (Art. 20).</Bullet>
          <Bullet>Objection — object to processing based on our legitimate interests, on grounds relating to your situation (Art. 21).</Bullet>
          <Bullet>Withdraw consent — where we rely on consent (such as push notifications), withdraw it at any time, without affecting processing done before withdrawal (Art. 7(3)).</Bullet>
          <Text style={styles.body}>
            You also have the right to lodge a complaint with a data-protection supervisory authority — for example [SUPERVISORY AUTHORITY — e.g. Úřad pro ochranu osobních údajů (Office for Personal Data Protection), Czech Republic, www.uoou.cz], or the supervisory authority in your country of residence. We&apos;d appreciate the chance to address your concern first, but you can complain to the authority at any time.
          </Text>
        </Section>

        <Section title="8. Cookies and local storage">
          <Text style={styles.body}>twowheelcome aims to keep tracking to a minimum.</Text>
          <Bullet>The Service uses local storage / device storage to keep you logged in (session) and to remember your preferences and settings. This is essential to making the Service work.</Bullet>
          <Bullet>[State here whether you use any analytics or non-essential cookies. If you use only essential/functional storage, say so. If you add analytics or marketing cookies later, you must update this section and — for non-essential cookies — obtain consent where required.]</Bullet>
          <Text style={styles.note}>
            [Operator note (remove before publishing): Confirm exactly what cookies / local storage / analytics the web app and mobile apps use, and whether a consent banner is required, before finalising this section.]
          </Text>
        </Section>

        <Section title="9. Children">
          <Text style={styles.body}>
            twowheelcome is intended only for users who are at least 18 years old. The Service is not directed at children and we do not knowingly collect personal data from anyone under 18. If you believe a minor has provided us data, please contact us and we will delete it.
          </Text>
        </Section>

        <Section title="10. How we protect your data">
          <Text style={styles.body}>
            We use reasonable technical and organisational measures to protect your data — including encrypted connections, authenticated access through our hosting provider, access controls, and the privacy-by-design measures described in Section 4. No system is completely secure, so we cannot guarantee absolute security, but we work to protect your data and to handle any incident responsibly and in line with our legal obligations.
          </Text>
        </Section>

        <Section title="11. Changes to this policy">
          <Text style={styles.body}>
            We may update this Privacy Policy from time to time. If we make material changes, we will give reasonable notice (e.g. by in-app notice or email) before they take effect. The &quot;Effective date&quot; at the top shows when the current version applies. Please review it periodically.
          </Text>
        </Section>

        <Section title="12. Contact">
          <Text style={styles.body}>To exercise your rights, ask a question, or raise a privacy concern, contact us:</Text>
          <Bullet>Email: [CONTACT EMAIL]</Bullet>
          <Bullet>Data protection contact / DPO: [DPO OR DATA-PROTECTION CONTACT]</Bullet>
          <Bullet>Post: [OPERATOR LEGAL NAME], [REGISTERED ADDRESS]</Bullet>
          <Text style={styles.body}>You can also complain to your data-protection supervisory authority (see Section 7).</Text>
          <Text style={styles.bodyDim}>(Current working contact: {CONTACT_EMAIL})</Text>
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
    draft: { backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentBorder, borderRadius: 16, padding: 16, gap: 6 },
    draftTitle: { color: C.accent, fontSize: 15, fontWeight: '900' },
    draftText: { color: C.text, fontSize: 14, lineHeight: 21, fontFamily: FONT.body },
    draftSub: { color: C.textMuted, fontSize: 13, lineHeight: 19, fontStyle: 'italic', fontFamily: FONT.body },
    body: { color: C.textMuted, fontSize: 15, lineHeight: 23, fontFamily: FONT.body },
    bodyDim: { color: C.textDim, fontSize: 13, lineHeight: 19, fontFamily: FONT.body },
    label: { color: C.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
    note: { color: C.textDim, fontSize: 13, lineHeight: 19, fontStyle: 'italic', fontFamily: FONT.body },
    section: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, gap: 9 },
    sectionTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bulletMark: { color: C.accent, fontSize: 15, lineHeight: 22, fontWeight: '900' },
    bulletText: { flex: 1, color: C.textMuted, fontSize: 15, lineHeight: 22, fontFamily: FONT.body },
  })
}
