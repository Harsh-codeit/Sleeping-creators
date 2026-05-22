import { Html, Head, Body, Section, Text, Hr } from '@react-email/components';

export function ContentStrategyOnboardingEmail({ clientName, platforms, frequency, contentPillars, brandVoice, startDate }) {
  const pillars = typeof contentPillars === 'string'
    ? contentPillars.split('\n').filter(Boolean)
    : (contentPillars || []);
  return (
    <Html>
      <Head />
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
        <Section style={{ maxWidth: '600px', margin: '0 auto' }}>

          {/* Header */}
          <Section style={{ backgroundColor: '#000000', padding: '32px 40px 28px' }}>
            <Text style={{ color: '#ffffff', fontSize: '11px', letterSpacing: '3px', margin: '0 0 6px', fontWeight: '600' }}>SLEEPING CREATORS</Text>
            <Text style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', margin: '0', letterSpacing: '-0.5px' }}>Welcome Aboard</Text>
          </Section>

          {/* Personal intro */}
          <Section style={{ padding: '40px 40px 32px' }}>
            <Text style={{ fontSize: '22px', fontWeight: '700', color: '#000000', margin: '0 0 12px', lineHeight: '1.3' }}>
              Hi {clientName}, here's how we'll create your content.
            </Text>
            <Text style={{ fontSize: '14px', color: '#666666', margin: '0', lineHeight: '1.7' }}>
              We've put together your content strategy below. This is the foundation we'll build from — everything is designed around your brand and goals.
            </Text>
          </Section>

          <Hr style={{ borderColor: '#eeeeee', margin: '0 40px' }} />

          {/* Strategy details */}
          <Section style={{ backgroundColor: '#F7F7F7', margin: '0 40px', padding: '24px' }}>
            <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '2px', margin: '0 0 16px', fontWeight: '600' }}>YOUR STRATEGY</Text>
            {[
              ['PLATFORMS', (platforms || []).join(', ')],
              ['POSTING FREQUENCY', frequency],
              ['BRAND VOICE', brandVoice],
              ['START DATE', startDate],
            ].filter(([, v]) => v).map(([label, value]) => (
              <Section key={label} style={{ marginBottom: '12px' }}>
                <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0 0 2px', fontWeight: '600' }}>{label}</Text>
                <Text style={{ fontSize: '14px', color: '#111111', margin: '0', fontWeight: '500' }}>{value}</Text>
              </Section>
            ))}
          </Section>

          {/* Content pillars */}
          {pillars.length > 0 && (
            <Section style={{ padding: '32px 40px 0' }}>
              <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '2px', margin: '0 0 20px', fontWeight: '600' }}>CONTENT PILLARS</Text>
              {pillars.map((p, i) => (
                <Section key={i} style={{ marginBottom: '16px', borderLeft: '3px solid #000000', paddingLeft: '16px' }}>
                  <Text style={{ fontSize: '11px', color: '#999999', margin: '0 0 2px', fontWeight: '600' }}>0{i + 1}</Text>
                  <Text style={{ fontSize: '15px', color: '#111111', margin: '0', fontWeight: '600' }}>{p}</Text>
                </Section>
              ))}
            </Section>
          )}

          {/* Footer */}
          <Section style={{ backgroundColor: '#F7F7F7', padding: '24px 40px', marginTop: '32px' }}>
            <Text style={{ fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.6' }}>
              Questions about your strategy? Reply directly to this email.<br />
              Sleeping Creators · sleeeping.creators@gmail.com
            </Text>
          </Section>

        </Section>
      </Body>
    </Html>
  );
}
