import { Html, Head, Body, Section, Text, Hr, Row, Column, Img, Font } from '@react-email/components';

const F = 'Inter, Helvetica, Arial, sans-serif';

const card = { backgroundColor: '#f4f4f4', borderRadius: '10px', padding: '14px 16px 12px', border: '1px solid #ebebeb' };
const darkCard = { backgroundColor: '#111111', borderRadius: '10px', padding: '14px 16px 16px' };

const labelStyle = {
  fontSize: '8px', fontWeight: '600', color: '#aaaaaa',
  letterSpacing: '1.5px', textTransform: 'uppercase',
  margin: '0 0 10px', display: 'block', fontFamily: F,
};
const valueStyle = { fontSize: '13px', fontWeight: '400', color: '#333333', margin: '0', lineHeight: '1.6', fontFamily: F };
const dividerStyle = { borderColor: '#cccccc', margin: '10px 0 0', borderTopWidth: '1px' };

function StatCard({ label, value }) {
  return (
    <Section style={card}>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{value || '—'}</Text>
      <Hr style={dividerStyle} />
    </Section>
  );
}

export function ContentStrategyOnboardingEmail({
  clientName, platforms, frequency, contentPillars, brandVoice, startDate, baseUrl = '',
}) {
  const pillars = typeof contentPillars === 'string'
    ? contentPillars.split('\n').filter(Boolean)
    : (contentPillars || []);
  const platformStr = Array.isArray(platforms) ? platforms.join(', ') : (platforms || '—');

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
                <Text style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: '700', color: '#ffffff', lineHeight: '1.2', fontFamily: F }}>Content Strategy</Text>
                <Text style={{ margin: 0, fontSize: '11px', color: '#888888', fontFamily: F }}>sleepingcreators.com</Text>
              </Column>
            </Row>
          </Section>

          <Section style={{ padding: '24px 24px 0' }}>

            {/* ── WELCOME ─────────────────────────────────────────────── */}
            <Section style={{ ...darkCard, marginBottom: '16px' }}>
              <Text style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.3px', fontFamily: F }}>
                Welcome aboard, {clientName || 'there'}.
              </Text>
              <Text style={{ margin: 0, fontSize: '13px', color: '#aaaaaa', lineHeight: '1.7', fontFamily: F }}>
                Here's your content strategy — designed around your brand and goals. This is the foundation we'll build from.
              </Text>
            </Section>

            {/* ── STRATEGY DETAILS ────────────────────────────────────── */}
            <Row style={{ marginBottom: '10px' }}>
              <Column style={{ width: '50%', paddingRight: '5px' }}>
                <StatCard label="Platforms" value={platformStr} />
              </Column>
              <Column style={{ width: '50%', paddingLeft: '5px' }}>
                <StatCard label="Posting Frequency" value={frequency} />
              </Column>
            </Row>
            <Row style={{ marginBottom: '16px' }}>
              <Column style={{ width: '50%', paddingRight: '5px' }}>
                <StatCard label="Start Date" value={startDate} />
              </Column>
              <Column style={{ width: '50%', paddingLeft: '5px' }}>
                <StatCard label="Brand Voice" value={brandVoice} />
              </Column>
            </Row>

            {/* ── CONTENT PILLARS ─────────────────────────────────────── */}
            {pillars.length > 0 && (
              <>
                <Text style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#111111', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: F }}>
                  Content Pillars
                </Text>
                {pillars.map((p, i) => (
                  <Section key={i} style={{ ...card, marginBottom: i < pillars.length - 1 ? '8px' : '24px' }}>
                    <Row>
                      <Column style={{ width: '28px', verticalAlign: 'middle' }}>
                        <Text style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: '#aaaaaa', fontFamily: F }}>0{i + 1}</Text>
                      </Column>
                      <Column style={{ verticalAlign: 'middle', borderLeft: '2px solid #111111', paddingLeft: '12px' }}>
                        <Text style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#111111', fontFamily: F }}>{p}</Text>
                      </Column>
                    </Row>
                  </Section>
                ))}
              </>
            )}

          </Section>

          {/* ── NOTE ────────────────────────────────────────────────────── */}
          <Section style={{ padding: '0 24px 24px' }}>
            <Section style={{ backgroundColor: '#f9f9f9', borderRadius: '10px', padding: '18px 20px', border: '1px solid #eeeeee' }}>
              <Text style={{ margin: 0, fontSize: '13px', color: '#555555', lineHeight: '1.75', fontStyle: 'italic', fontFamily: F }}>
                Questions about your strategy? Reply directly to this email and our team will get back to you within 24 hours.
              </Text>
            </Section>
          </Section>

          {/* ── FOOTER LOGO BLOCK ───────────────────────────────────────── */}
          <Section style={{ padding: '16px 0 12px', textAlign: 'center' }}>
            <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" width="48" height="48" style={{ display: 'block', margin: '0 auto 8px', borderRadius: '10px' }} />
            <Text style={{ margin: '0 0 2px', fontSize: '18px', fontWeight: '700', color: '#111111', letterSpacing: '-0.3px', fontFamily: F }}>
              You Sleep...
            </Text>
            <Text style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: '700', color: '#111111', letterSpacing: '-0.3px', fontFamily: F }}>
              Your Profile Doesn't.
            </Text>
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
