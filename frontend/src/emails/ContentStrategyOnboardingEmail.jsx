import { Html, Head, Body, Section, Text, Hr } from '@react-email/components';

export function ContentStrategyOnboardingEmail({ clientName, platforms, frequency, contentPillars, brandVoice, startDate }) {
  const pillars = typeof contentPillars === 'string'
    ? contentPillars.split('\n').filter(Boolean)
    : (contentPillars || []);
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#ffffff', color: '#111111', maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
        <Text style={{ fontSize: '13px', color: '#888', margin: '0 0 4px 0' }}>SLEEPING CREATORS</Text>
        <Text style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Welcome, {clientName}!</Text>
        <Text style={{ fontSize: '14px', color: '#555', margin: '0 0 24px 0' }}>Here's how we'll create your content.</Text>
        <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px 0' }} />
        <Section style={{ backgroundColor: '#f9f9f9', padding: '16px', marginBottom: '24px' }}>
          <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Platforms: <strong>{(platforms || []).join(', ')}</strong></Text>
          <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Posting frequency: <strong>{frequency}</strong></Text>
          <Text style={{ margin: '0', fontSize: '14px' }}>Brand voice: <strong>{brandVoice}</strong></Text>
        </Section>
        <Text style={{ fontSize: '13px', fontWeight: '600', color: '#888', margin: '0 0 12px 0' }}>CONTENT PILLARS</Text>
        <Section style={{ backgroundColor: '#f9f9f9', padding: '16px', marginBottom: '24px' }}>
          {pillars.map((p, i) => <Text key={i} style={{ margin: '0 0 6px 0', fontSize: '14px' }}>• {p}</Text>)}
        </Section>
        {startDate && <Text style={{ fontSize: '14px', margin: '0 0 24px 0' }}>We start: <strong>{startDate}</strong></Text>}
        <Hr style={{ borderColor: '#eeeeee', margin: '0 0 16px 0' }} />
        <Text style={{ fontSize: '12px', color: '#aaa' }}>Questions? Reply to this email.</Text>
      </Body>
    </Html>
  );
}
