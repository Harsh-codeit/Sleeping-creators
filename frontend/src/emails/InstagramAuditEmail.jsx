import { Html, Head, Body, Section, Text, Hr, Row, Column, Img, Font } from '@react-email/components';

// Matches the Sleeping Creators Instagram Audit Report PDF (3 pages, 9 sections)

const bodyFont = 'Inter, Helvetica, Arial, sans-serif';
const monoFont = 'Inter, Helvetica, Arial, sans-serif';

const sectionHeader = (num, title) => (
  <Section style={{ marginBottom: '16px' }}>
    <Text style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: '700', color: '#111111', letterSpacing: '0.3px', fontFamily: bodyFont }}>
      {num}{'  '}{title}
    </Text>
    <Hr style={{ borderColor: '#cccccc', margin: 0, borderTopWidth: '1px' }} />
  </Section>
);

const lightCard = { backgroundColor: '#f4f4f4', borderRadius: '10px', padding: '14px 16px 16px', border: '1px solid #ebebeb' };
const darkCard  = { backgroundColor: '#111111', borderRadius: '10px', padding: '14px 16px 16px' };

const cardLabel = { fontSize: '8px', fontWeight: '600', color: '#aaaaaa', letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 14px', display: 'block', fontFamily: bodyFont };
const cardLabelDark = { ...cardLabel, color: '#ffffff' };
const cardValue = { fontSize: '13px', fontWeight: '400', color: '#333333', margin: '0 0 2px', lineHeight: '1.5', fontFamily: bodyFont };
const cardValueDark = { ...cardValue, color: '#cccccc' };
const divLine = { borderColor: '#cccccc', margin: '10px 0 0', borderTopWidth: '1px' };
const divLineDark = { borderColor: '#333333', margin: '8px 0 4px', borderTopWidth: '1px' };

function LightCard({ label, value, height }) {
  return (
    <Section style={{ ...lightCard, minHeight: height }}>
      <Text style={cardLabel}>{label}</Text>
      <Text style={cardValue}>{value || '—'}</Text>
      <Hr style={divLine} />
    </Section>
  );
}

function BulletList({ items, dark }) {
  const lines = (items || '').split('\n').filter(Boolean);
  return lines.map((line, i) => (
    <Text key={i} style={{ margin: '4px 0 0', fontSize: '11px', color: dark ? '#cccccc' : '#555555', fontFamily: bodyFont }}>
      · {line}
    </Text>
  ));
}

function SwotBox({ title, items }) {
  return (
    <Section style={{ ...lightCard }}>
      <Text style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: '#111111', fontFamily: bodyFont }}>{title}</Text>
      <BulletList items={items} />
    </Section>
  );
}

export function InstagramAuditEmail({
  clientName, instagramHandle, reportDate,
  niche, targetAudience,
  tam, marketNotes, avgEngagementRate, topContentFormat, peakPostingTime,
  comp1Handle, comp1Followers, comp1Working, comp1Gap,
  comp2Handle, comp2Followers, comp2Working, comp2Gap,
  comp3Handle, comp3Followers, comp3Working, comp3Gap,
  contentTrends,
  pillar1Topic, pillar1Format,
  pillar2Topic, pillar2Format,
  pillar3Topic, pillar3Format,
  pillar4Topic, pillar4Format,
  strategyOverview,
  month1Items, month2Items, month3Items, month4Items,
  strengths, weaknesses, opportunities, threats,
  profilePhotoRating, bioRating, highlightsRating,
  contentConsistencyRating, postingFrequencyRating, engagementRateRating,
  totalPosts, avgLikes, avgComments, avgReach, avgSaves,
  baseUrl = '',
}) {
  const auditRows = [
    ['Profile Photo',        'Is it clear, on-brand and recognizable?',             profilePhotoRating],
    ['Bio',                  'CTA present? Keyword-rich? Clear value prop?',         bioRating],
    ['Highlights',           'Organized, labeled and active?',                       highlightsRating],
    ['Content Consistency',  'Visual theme, fonts and colors consistent?',           contentConsistencyRating],
    ['Posting Frequency',    'How often? Any visible gaps?',                         postingFrequencyRating],
    ['Engagement Rate',      'Likes and comments relative to followers?',            engagementRateRating],
  ];

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
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#ffffff', fontFamily: bodyFont }}>
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
                    <Text style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#ffffff', lineHeight: '1.2' }}>Sleeping Creators</Text>
                  </Column>
                </Row>
              </Column>
              <Column style={{ width: '50%', textAlign: 'right', verticalAlign: 'middle' }}>
                <Text style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: '700', color: '#ffffff' }}>Instagram Audit Report</Text>
                <Text style={{ margin: 0, fontSize: '11px', color: '#888888' }}>sleepingcreators.com</Text>
              </Column>
            </Row>
          </Section>

          <Section style={{ padding: '24px 24px 0' }}>

            {/* ── 01 CLIENT OVERVIEW ──────────────────────────────── */}
            {sectionHeader('01', 'CLIENT OVERVIEW')}
            <Row style={{ marginBottom: '10px' }}>
              <Column style={{ width: '33.33%', paddingRight: '5px' }}><LightCard label="Client Name" value={clientName} /></Column>
              <Column style={{ width: '33.33%', paddingRight: '5px', paddingLeft: '5px' }}><LightCard label="Instagram Handle" value={instagramHandle} /></Column>
              <Column style={{ width: '33.33%', paddingLeft: '5px' }}><LightCard label="Report Date" value={reportDate} /></Column>
            </Row>
            <Row style={{ marginBottom: '24px' }}>
              <Column style={{ width: '50%', paddingRight: '5px' }}><LightCard label="Niche / Industry" value={niche} /></Column>
              <Column style={{ width: '50%', paddingLeft: '5px' }}><LightCard label="Target Audience" value={targetAudience} /></Column>
            </Row>

            {/* ── 02 MARKET & TAM OVERVIEW ────────────────────────── */}
            {sectionHeader('02', 'MARKET & TAM OVERVIEW')}
            <Row style={{ marginBottom: '10px' }}>
              <Column style={{ width: '35%', paddingRight: '5px' }}><LightCard label="Total Addressable Market (TAM)" value={tam} /></Column>
              <Column style={{ width: '65%', paddingLeft: '5px' }}><LightCard label="Market Notes & Opportunity" value={marketNotes} /></Column>
            </Row>
            <Row style={{ marginBottom: '24px' }}>
              <Column style={{ width: '33.33%', paddingRight: '5px' }}><LightCard label="Avg. Engagement Rate in Niche" value={avgEngagementRate} /></Column>
              <Column style={{ width: '33.33%', paddingRight: '5px', paddingLeft: '5px' }}><LightCard label="Top Content Format" value={topContentFormat} /></Column>
              <Column style={{ width: '33.33%', paddingLeft: '5px' }}><LightCard label="Peak Posting Time" value={peakPostingTime} /></Column>
            </Row>

            {/* ── 03 COMPETITOR ANALYSIS ──────────────────────────── */}
            {sectionHeader('03', 'COMPETITOR ANALYSIS')}
            <Row style={{ marginBottom: '24px' }}>
              {[
                ['COMPETITOR 1', comp1Handle, comp1Followers, comp1Working, comp1Gap],
                ['COMPETITOR 2', comp2Handle, comp2Followers, comp2Working, comp2Gap],
                ['COMPETITOR 3', comp3Handle, comp3Followers, comp3Working, comp3Gap],
              ].map(([label, handle, followers, working, gap], i) => (
                <Column key={i} style={{ width: '33.33%', paddingRight: i < 2 ? '8px' : '0', paddingLeft: i > 0 ? '8px' : '0', verticalAlign: 'top' }}>
                  <Section style={{ ...darkCard, minHeight: '220px' }}>
                    <Text style={{ margin: '0 0 12px', fontSize: '10px', fontWeight: '700', color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>{label}</Text>
                    <Hr style={divLineDark} />
                    <Text style={{ margin: '6px 0 2px', fontSize: '9px', color: '#888888', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>Handle</Text>
                    <Text style={{ margin: '0 0 6px', fontSize: '12px', color: '#ffffff', fontFamily: bodyFont }}>{handle || '—'}</Text>
                    <Hr style={divLineDark} />
                    <Text style={{ margin: '6px 0 2px', fontSize: '9px', color: '#888888', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>Followers</Text>
                    <Text style={{ margin: '0 0 6px', fontSize: '12px', color: '#ffffff', fontFamily: monoFont }}>{followers || '—'}</Text>
                    <Hr style={divLineDark} />
                    <Text style={{ margin: '6px 0 2px', fontSize: '9px', color: '#888888', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>What's Working</Text>
                    <Text style={{ margin: '0 0 6px', fontSize: '11px', color: '#cccccc', lineHeight: '1.5', fontFamily: bodyFont }}>{working || '—'}</Text>
                    <Hr style={divLineDark} />
                    <Text style={{ margin: '6px 0 2px', fontSize: '9px', color: '#888888', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>Gap / Weakness</Text>
                    <Text style={{ margin: 0, fontSize: '11px', color: '#cccccc', lineHeight: '1.5', fontFamily: bodyFont }}>{gap || '—'}</Text>
                  </Section>
                </Column>
              ))}
            </Row>

            {/* ── 04 WHAT'S WORKING ───────────────────────────────── */}
            {sectionHeader('04', "WHAT'S WORKING ON INSTAGRAM (YOUR NICHE)")}
            <Section style={{ ...lightCard, marginBottom: '24px' }}>
              <Text style={cardLabel}>Content Trends &amp; Insights</Text>
              <Text style={{ ...cardValue, lineHeight: '1.7' }}>{contentTrends || '—'}</Text>
            </Section>

            {/* ── 05 CONTENT STRATEGY ─────────────────────────────── */}
            {sectionHeader('05', 'OUR CONTENT STRATEGY FOR YOU')}
            <Row style={{ marginBottom: '10px' }}>
              {[
                ['CONTENT PILLAR 1', pillar1Topic, pillar1Format],
                ['CONTENT PILLAR 2', pillar2Topic, pillar2Format],
                ['CONTENT PILLAR 3', pillar3Topic, pillar3Format],
                ['CONTENT PILLAR 4', pillar4Topic, pillar4Format],
              ].map(([label, topic, format], i) => (
                <Column key={i} style={{ width: '25%', paddingRight: i < 3 ? '4px' : '0', paddingLeft: i > 0 ? '4px' : '0', verticalAlign: 'top' }}>
                  <Section style={darkCard}>
                    <Text style={{ margin: '0 0 10px', fontSize: '9px', fontWeight: '700', color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>{label}</Text>
                    <Hr style={divLineDark} />
                    <Text style={{ margin: '6px 0 2px', fontSize: '8px', color: '#888888', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>Topic / Theme</Text>
                    <Text style={{ margin: '0 0 6px', fontSize: '11px', color: '#ffffff', lineHeight: '1.4', fontFamily: bodyFont }}>{topic || '—'}</Text>
                    <Hr style={divLineDark} />
                    <Text style={{ margin: '6px 0 2px', fontSize: '8px', color: '#888888', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>Format</Text>
                    <Text style={{ margin: 0, fontSize: '11px', color: '#cccccc', fontFamily: bodyFont }}>{format || '—'}</Text>
                  </Section>
                </Column>
              ))}
            </Row>
            <Section style={{ ...lightCard, marginBottom: '24px' }}>
              <Text style={cardLabel}>Strategy Overview</Text>
              <Text style={{ ...cardValue, lineHeight: '1.7' }}>{strategyOverview || '—'}</Text>
            </Section>

            {/* ── 06 ROADMAP ──────────────────────────────────────── */}
            {sectionHeader('06', '3–4 MONTH ROADMAP')}
            {[
              ['MONTH 1', 'Foundation & Testing', month1Items],
              ['MONTH 2', 'Refine & Grow',        month2Items],
              ['MONTH 3', 'Double Down',           month3Items],
              ['MONTH 4', 'Scale & Review',        month4Items],
            ].map(([label, sub, items], i) => (
              <Section key={i} style={{ ...darkCard, marginBottom: i < 3 ? '8px' : '24px' }}>
                <Row>
                  <Column style={{ width: '120px', verticalAlign: 'middle' }}>
                    <Text style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: '700', color: '#ffffff', letterSpacing: '0.5px', fontFamily: bodyFont }}>{label}</Text>
                    <Text style={{ margin: 0, fontSize: '9px', color: '#888888', fontStyle: 'italic', fontFamily: bodyFont }}>{sub}</Text>
                  </Column>
                  <Column style={{ verticalAlign: 'top', paddingLeft: '12px', borderLeft: '1px solid #333333' }}>
                    <BulletList items={items} dark />
                  </Column>
                </Row>
              </Section>
            ))}

            {/* ── 07 SWOT ─────────────────────────────────────────── */}
            {sectionHeader('07', 'SWOT ANALYSIS')}
            <Row style={{ marginBottom: '10px' }}>
              <Column style={{ width: '50%', paddingRight: '5px' }}><SwotBox title="S — Strengths" items={strengths} /></Column>
              <Column style={{ width: '50%', paddingLeft: '5px' }}><SwotBox title="W — Weaknesses" items={weaknesses} /></Column>
            </Row>
            <Row style={{ marginBottom: '24px' }}>
              <Column style={{ width: '50%', paddingRight: '5px' }}><SwotBox title="O — Opportunities" items={opportunities} /></Column>
              <Column style={{ width: '50%', paddingLeft: '5px' }}><SwotBox title="T — Threats" items={threats} /></Column>
            </Row>

            {/* ── 08 PROFILE AUDIT TABLE ──────────────────────────── */}
            {sectionHeader('08', 'CURRENT PROFILE AUDIT')}
            <Section style={{ marginBottom: '24px', border: '1px solid #ebebeb', borderRadius: '10px', overflow: 'hidden' }}>
              <Row style={{ backgroundColor: '#111111', padding: '10px 16px' }}>
                <Column style={{ width: '25%' }}><Text style={{ margin: 0, fontSize: '9px', fontWeight: '700', color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>Element</Text></Column>
                <Column style={{ width: '50%' }}><Text style={{ margin: 0, fontSize: '9px', fontWeight: '700', color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>What We Check</Text></Column>
                <Column style={{ width: '25%' }}><Text style={{ margin: 0, fontSize: '9px', fontWeight: '700', color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: bodyFont }}>Rating / Note</Text></Column>
              </Row>
              {auditRows.map(([element, check, rating], i) => (
                <Row key={i} style={{ backgroundColor: i % 2 === 0 ? '#fafafa' : '#f4f4f4', padding: '10px 16px', borderTop: '1px solid #ebebeb' }}>
                  <Column style={{ width: '25%' }}><Text style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#111111', fontFamily: bodyFont }}>{element}</Text></Column>
                  <Column style={{ width: '50%' }}><Text style={{ margin: 0, fontSize: '12px', color: '#666666', fontFamily: bodyFont }}>{check}</Text></Column>
                  <Column style={{ width: '25%' }}><Text style={{ margin: 0, fontSize: '12px', color: '#333333', fontFamily: bodyFont }}>{rating || '—'}</Text></Column>
                </Row>
              ))}
            </Section>

          </Section>

          {/* ── FOOTER LOGO BLOCK ───────────────────────────────────── */}
          <Section style={{ padding: '16px 0 12px', textAlign: 'center' }}>
            <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" width="48" height="48" style={{ display: 'block', margin: '0 auto 8px', borderRadius: '10px' }} />
            <Text style={{ margin: 0, fontSize: '11px', color: '#aaaaaa', fontFamily: bodyFont }}>Sleeping Creators</Text>
          </Section>

          {/* ── FOOTER BAR ──────────────────────────────────────────── */}
          <Section style={{ backgroundColor: '#111111', padding: '12px 24px' }}>
            <Row>
              <Column style={{ width: '60%' }}>
                <Text style={{ margin: 0, fontSize: '10px', color: '#777777', fontFamily: bodyFont }}>
                  Sleeping Creators · sleepingcreators.com
                </Text>
              </Column>
              <Column style={{ width: '40%', textAlign: 'right' }}>
                <Text style={{ margin: 0, fontSize: '10px', color: '#777777', fontFamily: bodyFont }}>
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
