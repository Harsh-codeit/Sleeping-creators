import { Html, Head, Body, Section, Text, Hr, Row, Column, Img, Font } from '@react-email/components';

const card = {
  backgroundColor: '#f4f4f4',
  borderRadius: '10px',
  padding: '14px 16px 12px',
};

const F = 'Inter, Helvetica, Arial, sans-serif';

const labelStyle = {
  fontSize: '8px', fontWeight: '600', color: '#aaaaaa',
  letterSpacing: '1.5px', textTransform: 'uppercase',
  margin: '0 0 18px', display: 'block', fontFamily: F,
};

const valueStyle = {
  fontSize: '22px', fontWeight: '700', color: '#111111',
  margin: '0', letterSpacing: '-0.5px', lineHeight: '1', fontFamily: F,
};

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

export function ClientReportEmail({
  clientName, instagramHandle, period, platform,
  followers, impressions, views,
  likes, comments, engagementRate,
  following, impressionsUnique, viewsUnique,
  posts,
  notes,
  baseUrl = '',
}) {
  const fmt = n => (n != null && n !== '') ? Number(n).toLocaleString() : '—';
  const defaultNotes = 'Based on this month\'s performance, we have identified winning content patterns that are clearly resonating with your audience. We are refining the strategy around them for upcoming posts — doubling down on what works and improving what doesn\'t. Thank you for your patience and feedback. We will keep iterating until we achieve the best possible outcome for your profile.';

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
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#ffffff', fontFamily: 'Inter,Helvetica,Arial,sans-serif' }}>
        <Section style={{ maxWidth: '620px', margin: '0 auto', backgroundColor: '#ffffff' }}>

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
                <Text style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: '700', color: '#ffffff', lineHeight: '1.2', fontFamily: F }}>Monthly Performance Report</Text>
                <Text style={{ margin: 0, fontSize: '11px', color: '#888888', fontFamily: F }}>sleepingcreators.com</Text>
              </Column>
            </Row>
          </Section>

          <Section style={{ padding: '24px 24px 0' }}>

            {/* ── CLIENT INFO (3-col) ──────────────────────────────── */}
            <Row style={{ marginBottom: '10px' }}>
              <Column style={{ width: '33.33%', paddingRight: '5px' }}>
                <StatCard style={{ fontSize: '16px' }} label="Client Name" value={clientName} />
              </Column>
              <Column style={{ width: '33.33%', paddingRight: '5px', paddingLeft: '5px' }}>
                <StatCard style={{ fontSize: '16px' }} label="Instagram Handle" value={instagramHandle} />
              </Column>
              <Column style={{ width: '33.33%', paddingLeft: '5px' }}>
                <StatCard style={{ fontSize: '16px' }} label="Report Period" value={period} />
              </Column>
            </Row>

            {/* ── ROW 1: Followers | Impressions | Views ───────────── */}
            <Row style={{ marginBottom: '10px' }}>
              <Column style={{ width: '33.33%', paddingRight: '5px' }}>
                <StatCard label="Followers" value={fmt(followers)} />
              </Column>
              <Column style={{ width: '33.33%', paddingRight: '5px', paddingLeft: '5px' }}>
                <StatCard label="Impressions" value={fmt(impressions)} />
              </Column>
              <Column style={{ width: '33.33%', paddingLeft: '5px' }}>
                <StatCard label="Views" value={fmt(views)} />
              </Column>
            </Row>

            {/* ── ROW 2: Likes | Comments | Eng. Rate ─────────────── */}
            <Row style={{ marginBottom: '10px' }}>
              <Column style={{ width: '33.33%', paddingRight: '5px' }}>
                <StatCard label="Likes" value={fmt(likes)} />
              </Column>
              <Column style={{ width: '33.33%', paddingRight: '5px', paddingLeft: '5px' }}>
                <StatCard label="Comments" value={fmt(comments)} />
              </Column>
              <Column style={{ width: '33.33%', paddingLeft: '5px' }}>
                <StatCard label="Eng. Rate" value={engagementRate ? `${engagementRate}%` : '—'} />
              </Column>
            </Row>

            {/* ── ROW 3: Following | Uniq. Impressions | Uniq. Views ─ */}
            <Row style={{ marginBottom: '10px' }}>
              <Column style={{ width: '33.33%', paddingRight: '5px' }}>
                <StatCard label="Following" value={fmt(following)} />
              </Column>
              <Column style={{ width: '33.33%', paddingRight: '5px', paddingLeft: '5px' }}>
                <StatCard label="Uniq. Impressions" value={fmt(impressionsUnique)} />
              </Column>
              <Column style={{ width: '33.33%', paddingLeft: '5px' }}>
                <StatCard label="Uniq. Views" value={fmt(viewsUnique)} />
              </Column>
            </Row>

            {/* ── ROW 4: Posts | Platform ──────────────────────────── */}
            <Row style={{ marginBottom: '24px' }}>
              <Column style={{ width: '50%', paddingRight: '5px' }}>
                <StatCard label="Posts" value={fmt(posts)} />
              </Column>
              <Column style={{ width: '50%', paddingLeft: '5px' }}>
                <StatCard label="Platform" value={platform || '—'} />
              </Column>
            </Row>

          </Section>

          {/* ── NOTES & STRATEGY UPDATE ─────────────────────────────── */}
          <Section style={{ padding: '0 24px 24px' }}>
            <Text style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#111111', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: F }}>
              Notes &amp; Strategy Update
            </Text>
            <Section style={{ backgroundColor: '#f9f9f9', borderRadius: '10px', padding: '18px 20px', border: '1px solid #eeeeee' }}>
              <Text style={{ margin: 0, fontSize: '13px', color: '#555555', lineHeight: '1.75', fontStyle: 'italic', fontFamily: F }}>
                {notes || defaultNotes}
              </Text>
            </Section>
          </Section>

          {/* ── FOOTER LOGO BLOCK ───────────────────────────────────── */}
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

          {/* ── FOOTER BAR ──────────────────────────────────────────── */}
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
