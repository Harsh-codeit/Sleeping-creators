import { Html, Head, Body, Section, Text, Hr, Row, Column, Img, Font } from '@react-email/components';

const F = 'Inter, Helvetica, Arial, sans-serif';

const heading = { margin: '0 0 8px', fontSize: '13px', fontWeight: '700', color: '#111111', fontFamily: F };
const body = { margin: '0', fontSize: '13px', color: '#555555', lineHeight: '1.75', fontFamily: F };
const bullet = { margin: '4px 0 0', fontSize: '13px', color: '#555555', lineHeight: '1.75', fontFamily: F };

function Section2({ title, children }) {
  return (
    <Section style={{ marginBottom: '20px' }}>
      <Text style={heading}>{title}</Text>
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
                    <Text style={{ margin: 0, fontSize: '10px', color: '#888888', lineHeight: '1.4', fontFamily: F }}>You Sleep. Your Profile Doesn't.</Text>
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
              Hey {clientName || 'there'}!
            </Text>
            <Text style={{ ...body, marginBottom: '24px' }}>
              Welcome to Sleeping Creators — genuinely excited to have you on board. You've taken the first step, and now we get to work. Before we dive in, here's a quick rundown of how the next few days will look so there are zero surprises.
            </Text>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 20px', borderTopWidth: '1px' }} />

            <Section2 title="First, we do our homework (48 hrs)">
              <Text style={body}>
                We spend the first 48 hours doing a full research and competitor analysis on your niche. We study what's working, what's not, and build a content direction tailored to your profile. No guesswork, just strategy.
              </Text>
            </Section2>

            <Section2 title="Then your first posts go live (within 72–84 hrs after that)">
              <Text style={body}>
                Once the research is done, your content will be live within 72–84 hours. So from today, expect your first post within roughly 4–5 days.
              </Text>
            </Section2>

            <Section2 title="Send us your photos &amp; videos ASAP">
              <Text style={body}>
                If you want Reels, we need your raw content — photos and videos — as soon as possible. Without them, we'll start with carousels, which is totally fine, but Reels will always perform better. So the sooner you share, the sooner we can hit the ground running.
              </Text>
            </Section2>

            <Section2 title="Get your profile ready">
              <Text style={{ ...body, marginBottom: '6px' }}>Before we start posting, please make sure:</Text>
              <Text style={bullet}>· Your profile photo is up-to-date and clear</Text>
              <Text style={{ ...bullet, marginBottom: '8px' }}>· Your bio reflects what you do (we can help if needed)</Text>
              <Text style={body}>A polished profile makes every post land better.</Text>
            </Section2>

            <Section2 title="The first week — let's be real">
              <Text style={body}>
                The first week is always a little rough. We're learning your audience, testing content, and figuring out what clicks. Please be patient with us, and more importantly share your feedback. The more you tell us what you like or don't like, the faster we improve and find your groove.
              </Text>
            </Section2>

            <Section2 title="One rule for communication">
              <Text style={body}>
                All queries, feedback, and updates — please drop a voice note or message in the group only. This keeps everything in one place and makes sure nothing gets missed. No DMs/calls on the side, please!
              </Text>
            </Section2>

            <Section2 title="A quick but important note">
              <Text style={{ ...body, marginBottom: '10px' }}>
                We're an affordable service and we genuinely give it our all — but we don't make any promises around follower growth or specific results. Social media takes time and consistency. We're here to do our best work, and we will.
              </Text>
              <Text style={body}>
                Also, please take a few minutes to read through our{' '}
                <a href={privacyPolicyUrl} style={{ color: '#111111', fontWeight: '600' }}>Privacy Policy</a>
                {' '}so everything stays smooth and transparent on both ends.
              </Text>
            </Section2>

            <Hr style={{ borderColor: '#eeeeee', margin: '0 0 20px', borderTopWidth: '1px' }} />

            {/* Sign-off */}
            <Text style={{ ...body, marginBottom: '4px' }}>
              That's it — you're all set. Drop any questions in the group and let's make something great together.
            </Text>
            <Text style={{ ...body, marginBottom: '4px' }}>Talk soon,</Text>
            <Text style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '700', color: '#111111', fontFamily: F }}>The Sleeping Creators Team</Text>
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
                  Sleeping Creators · sleepingcreators.com · You Sleep. Your Profile Doesn't.
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
