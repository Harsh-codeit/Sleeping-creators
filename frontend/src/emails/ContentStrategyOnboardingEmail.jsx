import { Html, Head, Body, Section, Text, Hr, Row, Column, Img, Font } from '@react-email/components';

const F = 'Inter, Helvetica, Arial, sans-serif';

const body = { margin: '0 0 0', fontSize: '13px', color: '#555555', lineHeight: '1.8', fontFamily: F };
const sectionHeading = { margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#111111', letterSpacing: '0.08em', fontFamily: F };
const para = { margin: '0 0 10px', fontSize: '13px', color: '#555555', lineHeight: '1.8', fontFamily: F };

function Block({ title, children }) {
  return (
    <Section style={{ marginBottom: '24px' }}>
      <Text style={sectionHeading}>{title}</Text>
      {children}
    </Section>
  );
}

export function ContentStrategyOnboardingEmail({
  clientName, privacyPolicyUrl = '#', baseUrl = '',
}) {
  return (
    <Html lang="en">
      <Head>
        <Font fontFamily="Inter" fallbackFontFamily="Helvetica"
          webFont={{ url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2', format: 'woff2' }}
          fontWeight={400} fontStyle="normal" />
        <Font fontFamily="Inter" fallbackFontFamily="Helvetica"
          webFont={{ url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKZAZ9hiJ-Ek-_EeA.woff2', format: 'woff2' }}
          fontWeight={700} fontStyle="normal" />
      </Head>
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#ffffff', fontFamily: F }}>
        <Section style={{ maxWidth: '640px', margin: '0 auto', backgroundColor: '#ffffff' }}>

          {/* ── HEADER ──────────────────────────────────────────────── */}
          <Section style={{ backgroundColor: '#000000', padding: '20px 28px' }}>
            <Row>
              <Column style={{ width: '50%', verticalAlign: 'middle' }}>
                <Row>
                  <Column style={{ width: '48px', verticalAlign: 'middle' }}>
                    <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" width="40" height="40" style={{ display: 'block', borderRadius: '8px' }} />
                  </Column>
                  <Column style={{ verticalAlign: 'middle', paddingLeft: '10px' }}>
                    <Text style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#ffffff', lineHeight: '1.2', fontFamily: F }}>Sleeping Creators</Text>
                  </Column>
                </Row>
              </Column>
              <Column style={{ width: '50%', textAlign: 'right', verticalAlign: 'middle' }}>
                <Text style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: '700', color: '#ffffff', lineHeight: '1.2', fontFamily: F }}>Welcome Onboard</Text>
                <Text style={{ margin: 0, fontSize: '11px', color: '#888888', fontFamily: F }}>sleepingcreators.com</Text>
              </Column>
            </Row>
          </Section>

          {/* ── BODY ────────────────────────────────────────────────── */}
          <Section style={{ padding: '28px 28px 8px' }}>

            {/* Greeting */}
            <Text style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '700', color: '#111111', letterSpacing: '-0.3px', fontFamily: F }}>
              Hey {clientName || 'there'},
            </Text>
            <Text style={{ ...para, marginBottom: '20px' }}>
              We got your form and we are genuinely excited to get started with you.
            </Text>
            <Text style={{ ...para, marginBottom: '12px' }}>
              Here is exactly what the next few days look like.
            </Text>
            <Text style={para}>
              <strong style={{ color: '#111111' }}>1.</strong> Our team spends the first 48 hours doing a full audit on your niche and competitors analysis. We study what is working, what angles are getting traction. Once done, you will receive an audit report and content roadmap directly on this email.
            </Text>
            <Text style={{ ...para, marginBottom: '24px' }}>
              <strong style={{ color: '#111111' }}>2.</strong> After the audit, your first post goes live within 72 hours. So from today, expect your profile to start moving in about 4 to 5 days (if some technical glitches happen it can extend too).
            </Text>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px', borderTopWidth: '1px' }} />

            <Block title="WHAT WE NEED FROM YOU RIGHT NOW">
              <Text style={para}>
                <strong style={{ color: '#111111' }}>Be available on WhatsApp</strong> when we message you for the Instagram OTP. Any delay on that pushes everything back, so please keep an eye out and help us log in fast to start posting.
              </Text>
              <Text style={para}>
                <strong style={{ color: '#111111' }}>Get your profile ready</strong> before we begin. Clear profile picture, a bio that says what you do, your CTA link in bio, and highlights if needed. We don't manage profile setup — that part is yours.
              </Text>
              <Text style={para}>
                <strong style={{ color: '#111111' }}>If you want Reels,</strong> share your raw photos and videos as soon as possible through the Google Drive link. Without footage we will start with carousels, which works great too, but Reels always perform better — so earlier the better.
              </Text>
            </Block>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px', borderTopWidth: '1px' }} />

            <Block title="HOW WE WORK">
              <Text style={para}>
                <strong style={{ color: '#111111' }}>We don't take post approvals.</strong> Content goes live based on niche research and winning content patterns. If something doesn't feel right, just drop a message in the WhatsApp group and we will refine from there.
              </Text>
              <Text style={para}>
                <strong style={{ color: '#111111' }}>We don't add music to carousels.</strong> We use a scheduling tool and Meta doesn't give music library access to third party apps. We will let you know the posting time so you can add music yourself according to your brand vibe.
              </Text>
              <Text style={para}>
                <strong style={{ color: '#111111' }}>Lead automation</strong> will be switched ON once we start seeing real traction in your comment section. We don't put a fixed date on it because rushing automation before the content is pulling attention does more harm than good.
              </Text>
            </Block>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px', borderTopWidth: '1px' }} />

            <Block title="COMMUNICATION">
              <Text style={para}>
                Everything goes through the WhatsApp group only — voice notes or text. Different people on our team handle different domains, and the right person will get back to you within 24 hours. Please avoid calls unless it is genuinely urgent, and don't expect replies on holidays or after working hours.
              </Text>
            </Block>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px', borderTopWidth: '1px' }} />

            <Block title="FIRST WEEK">
              <Text style={para}>
                The first 7–10 days will feel a little rough on both sides. Strategy is still finding its direction and things may not feel perfectly aligned yet. That is completely normal. Your feedback in this window is what gets everything dialled in fast. Stay in the group, share what you think, and we will fix quickly.
              </Text>
            </Block>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px', borderTopWidth: '1px' }} />

            <Block title="ONE IMPORTANT THING">
              <Text style={para}>
                We are not responsible for account restrictions, shadowbans, or deactivations by Instagram or Meta. These are platform decisions completely outside our control. If anything like that happens, the liability sits with the platform.
              </Text>
            </Block>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px', borderTopWidth: '1px' }} />

            <Block title="ABOUT RESULTS">
              <Text style={para}>
                This is an affordable service and we don't make promises around specific follower counts, reach, or leads. What we promise is that we show up every single day with our best work. We only make real money when you grow through brand deals, so your growth is genuinely our priority. Please give it at least 3 months before drawing any conclusions.
              </Text>
              <Text style={para}>
                For full details on terms, refund policy, and everything else please read through this carefully before we begin:{' '}
                <a href={privacyPolicyUrl} style={{ color: '#111111', fontWeight: '600' }}>Privacy Policy and T&amp;C</a>
              </Text>
            </Block>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 20px', borderTopWidth: '1px' }} />

            {/* Sign-off */}
            <Text style={{ ...body, marginBottom: '4px' }}>
              We will be in touch on WhatsApp very soon. Let's build something worth watching.
            </Text>
            <Text style={{ ...body, marginBottom: '16px' }}>Talk soon,</Text>
            <Text style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: '700', color: '#111111', fontFamily: F }}>Nikhil and Team</Text>
            <Text style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: '700', color: '#111111', fontFamily: F }}>Sleeping Creators</Text>
            <Text style={{ margin: '0 0 24px', fontSize: '12px', color: '#aaaaaa', fontFamily: F }}>sleepingcreators.com</Text>

          </Section>

          {/* ── FOOTER LOGO BLOCK ───────────────────────────────────────── */}
          <Section style={{ padding: '16px 0 12px', textAlign: 'center' }}>
            <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" width="48" height="48" style={{ display: 'block', margin: '0 auto 8px', borderRadius: '10px' }} />
            <Text style={{ margin: 0, fontSize: '11px', color: '#aaaaaa', fontFamily: F }}>Sleeping Creators</Text>
          </Section>

          {/* ── FOOTER BAR ──────────────────────────────────────────────── */}
          <Section style={{ backgroundColor: '#111111', padding: '12px 24px' }}>
            <Row>
              <Column style={{ width: '60%' }}>
                <Text style={{ margin: 0, fontSize: '10px', color: '#777777', lineHeight: '1.5', fontFamily: F }}>
                  Sleeping Creators · sleepingcreators.com
                </Text>
              </Column>
              <Column style={{ width: '40%', textAlign: 'right' }}>
                <Text style={{ margin: 0, fontSize: '10px', color: '#777777', fontFamily: F }}>
                  Confidential — For Client Use Only
                </Text>
              </Column>
            </Row>
          </Section>

        </Section>
      </Body>
    </Html>
  );
}
