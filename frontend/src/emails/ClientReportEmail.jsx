import { Html, Head, Body, Section, Text, Hr, Row, Column, Img } from '@react-email/components';

export function ClientReportEmail({ clientName, period, postsPublished, platforms, likes, comments, reach, queuePending, queueApproved, topPostImageUrl, topPostCaption, baseUrl = '' }) {
  const fmt = (n) => n != null ? Number(n).toLocaleString() : '—';
  return (
    <Html>
      <Head />
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
        <Section style={{ maxWidth: '600px', margin: '0 auto' }}>

          {/* Header */}
          <Section style={{ backgroundColor: '#000000', padding: '32px 40px 28px' }}>
            <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" height="36" style={{ display: 'block', marginBottom: '12px' }} />
            <Text style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', margin: '0 0 6px', letterSpacing: '-0.5px' }}>Monthly Report</Text>
            <Text style={{ color: '#888888', fontSize: '13px', margin: '0' }}>{period} · {clientName}</Text>
          </Section>

          {/* Key stats */}
          <Section style={{ padding: '40px 40px 0' }}>
            <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '2px', margin: '0 0 20px', fontWeight: '600' }}>PERFORMANCE</Text>
            <Row>
              <Column style={{ textAlign: 'center', paddingRight: '8px' }}>
                <Text style={{ fontSize: '36px', fontWeight: '900', color: '#000000', margin: '0', letterSpacing: '-1px' }}>{postsPublished ?? '—'}</Text>
                <Text style={{ fontSize: '11px', color: '#999999', margin: '4px 0 0', letterSpacing: '1px', fontWeight: '600' }}>POSTS</Text>
              </Column>
              <Column style={{ textAlign: 'center', paddingRight: '8px' }}>
                <Text style={{ fontSize: '36px', fontWeight: '900', color: '#000000', margin: '0', letterSpacing: '-1px' }}>{fmt(likes)}</Text>
                <Text style={{ fontSize: '11px', color: '#999999', margin: '4px 0 0', letterSpacing: '1px', fontWeight: '600' }}>LIKES</Text>
              </Column>
              <Column style={{ textAlign: 'center' }}>
                <Text style={{ fontSize: '36px', fontWeight: '900', color: '#000000', margin: '0', letterSpacing: '-1px' }}>{fmt(reach)}</Text>
                <Text style={{ fontSize: '11px', color: '#999999', margin: '4px 0 0', letterSpacing: '1px', fontWeight: '600' }}>REACH</Text>
              </Column>
            </Row>
          </Section>

          <Hr style={{ borderColor: '#eeeeee', margin: '32px 40px' }} />

          {/* Secondary stats */}
          <Section style={{ backgroundColor: '#F7F7F7', margin: '0 40px', padding: '24px' }}>
            <Row style={{ marginBottom: '12px' }}>
              <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>COMMENTS</Text></Column>
              <Column><Text style={{ fontSize: '14px', color: '#111111', margin: '0', fontWeight: '600', textAlign: 'right' }}>{fmt(comments)}</Text></Column>
            </Row>
            <Row style={{ marginBottom: '12px' }}>
              <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>PLATFORMS</Text></Column>
              <Column><Text style={{ fontSize: '14px', color: '#111111', margin: '0', textAlign: 'right' }}>{(platforms || []).join(', ')}</Text></Column>
            </Row>
            <Row style={{ marginBottom: '12px' }}>
              <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>QUEUE — PENDING</Text></Column>
              <Column><Text style={{ fontSize: '14px', color: '#111111', margin: '0', textAlign: 'right' }}>{queuePending ?? 0}</Text></Column>
            </Row>
            <Row>
              <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>QUEUE — APPROVED</Text></Column>
              <Column><Text style={{ fontSize: '14px', color: '#111111', margin: '0', textAlign: 'right' }}>{queueApproved ?? 0}</Text></Column>
            </Row>
          </Section>

          {/* Top post */}
          {topPostCaption && (
            <Section style={{ padding: '32px 40px 0' }}>
              <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '2px', margin: '0 0 16px', fontWeight: '600' }}>★ TOP POST THIS MONTH</Text>
              {topPostImageUrl && <Img src={topPostImageUrl} alt="Top post" style={{ width: '100%', maxHeight: '320px', objectFit: 'cover', display: 'block' }} />}
              <Text style={{ fontSize: '14px', color: '#555555', fontStyle: 'italic', margin: '12px 0 0', lineHeight: '1.6' }}>"{topPostCaption}"</Text>
            </Section>
          )}

          {/* Footer */}
          <Section style={{ backgroundColor: '#F7F7F7', padding: '24px 40px', marginTop: '32px' }}>
            <Text style={{ fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.6' }}>
              Questions about your report? Reply directly to this email.<br />
              Sleeping Creators · sleeeping.creators@gmail.com
            </Text>
          </Section>

        </Section>
      </Body>
    </Html>
  );
}
