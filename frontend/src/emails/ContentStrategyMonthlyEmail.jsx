import { Html, Head, Body, Section, Text, Hr } from '@react-email/components';

export function ContentStrategyMonthlyEmail({ clientName, month, platforms, totalScheduled, topics }) {
  const topicList = typeof topics === 'string'
    ? topics.split('\n').filter(Boolean).map(t => ({ title: t, postCount: null }))
    : (topics || []);
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#ffffff', color: '#111111', maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
        <Text style={{ fontSize: '13px', color: '#888', margin: '0 0 4px 0' }}>SLEEPING CREATORS</Text>
        <Text style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>{month} Content Plan</Text>
        <Text style={{ fontSize: '14px', color: '#555', margin: '0 0 24px 0' }}>{clientName}</Text>
        <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px 0' }} />
        <Section style={{ backgroundColor: '#f9f9f9', padding: '16px', marginBottom: '24px' }}>
          <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Total scheduled: <strong>{totalScheduled} posts</strong></Text>
          <Text style={{ margin: '0', fontSize: '14px' }}>Platforms: <strong>{(platforms || []).join(', ')}</strong></Text>
        </Section>
        <Text style={{ fontSize: '13px', fontWeight: '600', color: '#888', margin: '0 0 12px 0' }}>THIS MONTH WE'RE COVERING</Text>
        <Section style={{ backgroundColor: '#f9f9f9', padding: '16px', marginBottom: '24px' }}>
          {topicList.map((t, i) => (
            <Text key={i} style={{ margin: '0 0 6px 0', fontSize: '14px' }}>
              • {t.title}{t.postCount ? ` (${t.postCount} posts)` : ''}
            </Text>
          ))}
        </Section>
        <Hr style={{ borderColor: '#eeeeee', margin: '0 0 16px 0' }} />
        <Text style={{ fontSize: '12px', color: '#aaa' }}>Questions? Reply to this email.</Text>
      </Body>
    </Html>
  );
}
