import { Html, Head, Body, Section, Text, Hr } from '@react-email/components';

export function ContentStrategyMonthlyEmail({ clientName, month, platforms, totalScheduled, topics }) {
  const topicList = typeof topics === 'string'
    ? topics.split('\n').filter(Boolean).map(t => ({ title: t, postCount: null }))
    : (topics || []);
  return (
    <Html>
      <Head />
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
        <Section style={{ maxWidth: '600px', margin: '0 auto' }}>

          {/* Header */}
          <Section style={{ backgroundColor: '#000000', padding: '32px 40px 28px' }}>
            <Text style={{ color: '#ffffff', fontSize: '11px', letterSpacing: '3px', margin: '0 0 6px', fontWeight: '600' }}>SLEEPING CREATORS</Text>
            <Text style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', margin: '0 0 4px', letterSpacing: '-0.5px' }}>{month}</Text>
            <Text style={{ color: '#888888', fontSize: '13px', margin: '0' }}>Content Plan · {clientName}</Text>
          </Section>

          {/* Post count hero */}
          <Section style={{ padding: '40px 40px 0' }}>
            <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' }}>TOTAL POSTS SCHEDULED</Text>
            <Text style={{ fontSize: '64px', fontWeight: '900', color: '#000000', margin: '0 0 4px', letterSpacing: '-3px', lineHeight: '1' }}>{totalScheduled}</Text>
            <Text style={{ fontSize: '13px', color: '#666666', margin: '0 0 0' }}>across {(platforms || []).join(', ')}</Text>
          </Section>

          <Hr style={{ borderColor: '#eeeeee', margin: '32px 40px' }} />

          {/* Topics */}
          {topicList.length > 0 && (
            <Section style={{ padding: '0 40px 0' }}>
              <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '2px', margin: '0 0 20px', fontWeight: '600' }}>THIS MONTH WE'RE COVERING</Text>
              {topicList.map((t, i) => (
                <Section key={i} style={{ marginBottom: '16px', borderLeft: '3px solid #000000', paddingLeft: '16px' }}>
                  <Text style={{ fontSize: '11px', color: '#999999', margin: '0 0 2px', fontWeight: '600' }}>
                    {String(i + 1).padStart(2, '0')}{t.postCount ? ` · ${t.postCount} posts` : ''}
                  </Text>
                  <Text style={{ fontSize: '15px', color: '#111111', margin: '0', fontWeight: '600' }}>{t.title}</Text>
                </Section>
              ))}
            </Section>
          )}

          {/* Footer */}
          <Section style={{ backgroundColor: '#F7F7F7', padding: '24px 40px', marginTop: '32px' }}>
            <Text style={{ fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.6' }}>
              Questions about this month's plan? Reply directly to this email.<br />
              Sleeping Creators · sleeeping.creators@gmail.com
            </Text>
          </Section>

        </Section>
      </Body>
    </Html>
  );
}
