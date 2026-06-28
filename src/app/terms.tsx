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

        <View style={styles.draft}>
          <Text style={styles.draftTitle}>⚠️ Předběžné znění</Text>
          <Text style={styles.draftText}>
            Toto je pracovní verze podmínek. Než aplikaci finálně spustíme, bude doplněna o údaje provozovatele a zkontrolována právníkem.
          </Text>
          <Text style={styles.draftSub}>Draft — to be finalized before launch.</Text>
        </View>

        <Text style={styles.body}>Effective date: [EFFECTIVE DATE]</Text>
        <Text style={styles.body}>
          Operator: [OPERATOR LEGAL NAME], [COMPANY ID / IČO], [REGISTERED ADDRESS] (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;)
        </Text>
        <Text style={styles.body}>
          Service: the twowheelcome platform, available at twowheelcome.com and via the twowheelcome mobile applications (together, the &quot;Service&quot;)
        </Text>
        <Text style={styles.body}>
          By creating an account or using the Service, you agree to these Terms of Use (&quot;Terms&quot;). If you do not agree, do not use the Service.
        </Text>

        <Section title="1. Who we are and what twowheelcome is (and is NOT)">
          <Text style={styles.body}>
            twowheelcome is a free, community platform that connects motorcycle travellers (&quot;riders&quot; or &quot;guests&quot;) with people (&quot;hosts&quot;) who offer secure overnight motorcycle parking and, optionally, a place to sleep.
          </Text>
          <Text style={styles.body}>Please read this carefully, because it defines the limits of what we do:</Text>
          <Bullet>We are a connector / introduction service — a noticeboard and matchmaker. We help riders and hosts find each other and communicate.</Bullet>
          <Bullet>We are NOT a booking platform, NOT an accommodation provider, NOT a travel agency, and NOT a payment processor.</Bullet>
          <Bullet>We handle no money and take no commission. Any money, gift, or arrangement between users is entirely between them and is none of our doing.</Bullet>
          <Bullet>We do not vet, verify, endorse, employ, supervise, insure, or guarantee any host, guest, property, parking spot, or sleeping arrangement.</Bullet>
          <Bullet>All hosting and all stays are arranged directly between users, entirely at their own risk.</Bullet>
          <Bullet>We are a neutral venue. We are not a party to any arrangement, agreement, stay, or dispute between users.</Bullet>
          <Text style={styles.body}>
            The relationship created when a host and a guest agree to a stay is directly between those two users. We are not part of it.
          </Text>
        </Section>

        <Section title="2. Eligibility (18+)">
          <Text style={styles.body}>
            You must be at least 18 years old to create an account or use the Service. The Service is not directed at, and may not be used by, anyone under 18. By using the Service you confirm that you are 18 or older and legally able to enter into these Terms.
          </Text>
          <Text style={styles.body}>
            You are also responsible for complying with all laws that apply to you — including, where relevant, residency, insurance, vehicle, tax, and short-term-accommodation rules in your own and your host&apos;s location.
          </Text>
        </Section>

        <Section title="3. The Service is a connector, not a booking / accommodation / payment service">
          <Text style={styles.body}>To remove any doubt:</Text>
          <Bullet>A host listing is an invitation to make contact, not an offer that we guarantee or that you can &quot;book.&quot;</Bullet>
          <Bullet>A rider&apos;s stay request (a &quot;knock&quot;) is a request to the host, which the host is free to accept or decline for any reason or no reason.</Bullet>
          <Bullet>We do not set, collect, hold, or refund any payment. We do not provide insurance.</Bullet>
          <Bullet>We do not promise that any host, parking spot, or sleeping place exists, is available, is safe, is lawful, or matches its description.</Bullet>
          <Text style={styles.body}>
            If you want guarantees, insurance, or recourse, you should arrange those yourself before relying on a stay.
          </Text>
        </Section>

        <Section title="4. Accounts">
          <Bullet>To use most features you must create an account with a valid email address and a display name.</Bullet>
          <Bullet>You are responsible for keeping your login credentials secure and for all activity under your account.</Bullet>
          <Bullet>You must provide accurate information and keep it up to date.</Bullet>
          <Bullet>You may not create an account for anyone else, impersonate another person, or use the Service if we have previously suspended or removed your account.</Bullet>
          <Bullet>You can delete your account at any time from within the app. Deleting your account removes your associated personal data (see the Privacy Policy for what this includes).</Bullet>
        </Section>

        <Section title="5. Host and guest responsibilities">
          <Text style={styles.body}>All users must:</Text>
          <Bullet>Be honest and accurate in everything they post (profile, listing, messages, reviews).</Bullet>
          <Bullet>Communicate respectfully and in good faith.</Bullet>
          <Bullet>Make their own checks and use their own judgement before agreeing to, or going ahead with, any stay.</Bullet>
          <Text style={styles.body}>Hosts are responsible for:</Text>
          <Bullet>The accuracy of their listing, including the parking-safety information and any self-declared parking-safety level.</Bullet>
          <Bullet>Ensuring they are legally allowed to offer the parking and/or accommodation they describe (including any landlord, building, insurance, zoning, tax, or local-law requirements).</Bullet>
          <Bullet>Their own property, premises, and the conduct of anyone present there.</Bullet>
          <Text style={styles.body}>Guests are responsible for:</Text>
          <Bullet>Their own safety, belongings, motorcycle, and decisions.</Bullet>
          <Bullet>Treating a host&apos;s property and neighbours with respect, and following any reasonable house rules.</Bullet>
          <Bullet>Their own insurance, documents, and legal status.</Bullet>
          <Text style={styles.body}>
            You acknowledge that you, not us, decide whether to host or to stay, and you accept the consequences of that decision.
          </Text>
        </Section>

        <Section title="6. Safety, assumption of risk, and our no-vetting statement">
          <Text style={styles.body}>
            We do not vet, verify, background-check, or screen any user, host, guest, or property. A profile, listing, review, or rating on twowheelcome is not a safety endorsement by us.
          </Text>
          <Text style={styles.body}>You understand and agree that:</Text>
          <Bullet>Meeting strangers, travelling, staying in someone&apos;s property, and leaving a motorcycle in someone&apos;s care all carry inherent risks.</Bullet>
          <Bullet>You assume those risks yourself. You are responsible for your own safety and security and for protecting your property.</Bullet>
          <Bullet>You should take sensible precautions: check listings and reviews, communicate through the in-app chat, share your plans with someone you trust, verify details before you arrive, and stop or leave if something feels wrong.</Bullet>
          <Text style={styles.body}>
            We may provide safety tips, reporting tools, or guidance, but doing so does not make us responsible for your safety or for any user&apos;s conduct.
          </Text>
        </Section>

        <Section title="7. Acceptable use">
          <Text style={styles.body}>When using the Service, you must not:</Text>
          <Bullet>Harass, threaten, abuse, defame, or discriminate against anyone.</Bullet>
          <Bullet>Use the Service for anything illegal, fraudulent, or harmful.</Bullet>
          <Bullet>Post false, misleading, or deceptive information (including fake listings, fake reviews, or a false safety level).</Bullet>
          <Bullet>Use the Service for commercial exploitation unrelated to genuine community hosting — including running a paid accommodation business through it, advertising, spam, or solicitation, where this is inconsistent with the community, free, non-commercial nature of the platform.</Bullet>
          <Bullet>Scrape, crawl, harvest, or bulk-collect data or content from the Service, or attempt to extract other users&apos; data.</Bullet>
          <Bullet>Attempt to circumvent, defeat, or reverse-engineer the approximate-location protection (see Section 8).</Bullet>
          <Bullet>Try to move users off-platform in a way that undermines the safety model (for example, pressuring someone to share an exact address or personal contact details before a stay is accepted).</Bullet>
          <Bullet>Interfere with, overload, or attempt to gain unauthorised access to the Service, other accounts, or our systems.</Bullet>
          <Bullet>Upload malware, or content that infringes others&apos; rights (including intellectual-property or privacy rights).</Bullet>
        </Section>

        <Section title="8. Location privacy rules — do not circumvent approximate location">
          <Text style={styles.body}>Protecting where people live is central to how twowheelcome works.</Text>
          <Bullet>Host locations are shown publicly only as an approximate area — map coordinates are deliberately rounded to roughly a 1 km radius.</Bullet>
          <Bullet>A host&apos;s exact address or location is shared only after the host accepts a stay request, and only inside the private in-app chat between that host and that guest.</Bullet>
          <Bullet>You must not attempt to discover, derive, publish, or share another user&apos;s exact location outside this flow, and you must not try to bypass the rounding or the &quot;share only after acceptance&quot; rule.</Bullet>
          <Bullet>If a host shares their exact address with you, it is only for the purpose of that stay. Do not publish it, pass it on, or reuse it for any other purpose.</Bullet>
          <Text style={styles.body}>
            Breaking these rules is a serious violation and may lead to immediate suspension or removal.
          </Text>
        </Section>

        <Section title="9. Reviews and user content (licence)">
          <Bullet>After a stay, users may leave honest reviews, and the reviewed user may reply.</Bullet>
          <Bullet>Reviews must be truthful, based on genuine experience, and fair. Do not post reviews that are fake, retaliatory, defamatory, or designed to manipulate ratings.</Bullet>
          <Bullet>You are responsible for everything you post (your &quot;User Content&quot;), including listings, profile details, messages, reviews, and replies. You confirm you have the right to post it.</Bullet>
          <Bullet>You retain ownership of your User Content. By posting it, you grant us a worldwide, non-exclusive, royalty-free licence to host, store, display, reproduce, and distribute that content within the Service for the purpose of operating, promoting, and improving twowheelcome. This licence lasts as long as the content is on the platform (and reasonably afterwards for backups, legal records, and content others have relied upon, such as reviews).</Bullet>
          <Bullet>We may remove or moderate User Content that breaks these Terms, but we are not obliged to monitor or pre-screen content.</Bullet>
        </Section>

        <Section title="10. Suspension and termination">
          <Bullet>We may suspend, restrict, or remove your account or any content if we reasonably believe you have broken these Terms, created a safety or legal risk, or harmed other users or the Service — including, where appropriate, without prior notice.</Bullet>
          <Bullet>You may stop using the Service and delete your account at any time.</Bullet>
          <Bullet>Sections that by their nature should survive termination (for example, content licences already granted, disclaimers, limitations of liability, and dispute provisions) continue to apply after your account ends.</Bullet>
        </Section>

        <Section title="11. Disclaimers and limitation of liability">
          <Text style={styles.body}>Please read this section carefully.</Text>
          <Bullet>The Service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, to the fullest extent permitted by law. We do not warrant that the Service will be uninterrupted, error-free, secure, or that listings, users, or content are accurate, lawful, safe, or reliable.</Bullet>
          <Bullet>We are not responsible for the acts, omissions, conduct, listings, property, safety, or honesty of any user, host, or guest. Any stay, parking arrangement, or interaction is between users; we are not a party to it.</Bullet>
          <Bullet>To the fullest extent permitted by law, we are not liable for any property damage, theft, loss, personal injury, death, financial loss, or any dispute arising between users, or from your use of (or inability to use) the Service.</Bullet>
          <Bullet>To the fullest extent permitted by law, our total aggregate liability to you is limited as set out here, and we are not liable for indirect, incidental, special, or consequential losses.</Bullet>
          <Text style={styles.body}>
            Consumer-rights carve-out. Nothing in these Terms excludes or limits any liability or right that cannot be excluded or limited under the mandatory law that applies to you — including mandatory consumer-protection rights and liability for death or personal injury caused by negligence, fraud, or anything else that the law does not allow us to exclude. Where any limitation in these Terms is not permitted by law, it applies only to the extent that the law allows.
          </Text>
        </Section>

        <Section title="12. Intellectual property">
          <Bullet>The Service itself — including the twowheelcome name, logo, design, software, and content we provide — is owned by us or our licensors and is protected by intellectual-property laws.</Bullet>
          <Bullet>You may use the Service only as permitted by these Terms. You may not copy, modify, distribute, sell, or create derivative works of the Service, except as the law allows.</Bullet>
          <Bullet>The licence you grant us over your User Content is described in Section 9.</Bullet>
        </Section>

        <Section title="13. Changes to these Terms">
          <Bullet>We may update these Terms from time to time — for example, to reflect changes to the Service or the law.</Bullet>
          <Bullet>If we make material changes, we will give reasonable notice (for example, by in-app notice or email to your account address) before they take effect.</Bullet>
          <Bullet>We record the version of the Terms you accepted and the date you accepted them. Continuing to use the Service after changes take effect means you accept the updated Terms. If you do not agree, you should stop using the Service and may delete your account.</Bullet>
        </Section>

        <Section title="14. Governing law and disputes">
          <Bullet>These Terms, and any dispute arising from them or from your use of the Service, are governed by [GOVERNING LAW / JURISDICTION], without affecting any mandatory consumer-protection rules of the country where you live.</Bullet>
          <Bullet>The courts of [GOVERNING LAW / JURISDICTION] have jurisdiction, except where mandatory law gives you the right to bring proceedings in your home country.</Bullet>
          <Bullet>[OPTIONAL: describe any informal dispute-resolution step, mediation, or online dispute-resolution (ODR) option you wish to offer.]</Bullet>
        </Section>

        <Section title="15. Contact">
          <Text style={styles.body}>
            Questions about these Terms? Contact us at [CONTACT EMAIL], or by post at [REGISTERED ADDRESS].
          </Text>
          <Text style={styles.bodyDim}>(Current working contact: {CONTACT_EMAIL})</Text>
        </Section>

        <Text style={styles.body}>
          twowheelcome connects riders and hosts. It does not host, book, insure, or pay for anything. Ride safe, host kindly, and look out for each other.
        </Text>
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
    section: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 16, gap: 9 },
    sectionTitle: { color: C.text, fontSize: 17, fontWeight: '900' },
    bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bulletMark: { color: C.accent, fontSize: 15, lineHeight: 22, fontWeight: '900' },
    bulletText: { flex: 1, color: C.textMuted, fontSize: 15, lineHeight: 22, fontFamily: FONT.body },
  })
}
