import { Html, Head, Body, Section, Text, Button, Hr, Row, Column } from '@react-email/components';

export function InvoiceEmail({ clientName, period, postsPublished, platforms, amount, serviceDescription, paymentUrl }) {
  return (
    <Html>
      <Head />
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>
        <Section style={{ maxWidth: '600px', margin: '0 auto' }}>

          {/* Header */}
          <Section style={{ backgroundColor: '#000000', padding: '32px 40px 28px' }}>
            <Text style={{ color: '#ffffff', fontSize: '11px', letterSpacing: '3px', margin: '0 0 6px', fontWeight: '600' }}>SLEEPING CREATORS</Text>
            <Text style={{ color: '#ffffff', fontSize: '28px', fontWeight: '900', margin: '0', letterSpacing: '-0.5px' }}>Invoice</Text>
          </Section>

          {/* Amount hero */}
          <Section style={{ backgroundColor: '#ffffff', padding: '40px 40px 0' }}>
            <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' }}>AMOUNT DUE</Text>
            <Text style={{ fontSize: '52px', fontWeight: '900', color: '#000000', margin: '0 0 4px', letterSpacing: '-2px', lineHeight: '1' }}>{amount}</Text>
            <Text style={{ fontSize: '14px', color: '#666666', margin: '0 0 32px' }}>{period}</Text>
          </Section>

          <Hr style={{ borderColor: '#eeeeee', margin: '0 40px' }} />

          {/* Details */}
          <Section style={{ backgroundColor: '#F7F7F7', margin: '0 40px', padding: '24px' }}>
            <Row style={{ marginBottom: '12px' }}>
              <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>CLIENT</Text></Column>
              <Column><Text style={{ fontSize: '14px', color: '#111111', margin: '0', fontWeight: '600', textAlign: 'right' }}>{clientName}</Text></Column>
            </Row>
            <Row style={{ marginBottom: '12px' }}>
              <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>SERVICE</Text></Column>
              <Column><Text style={{ fontSize: '14px', color: '#111111', margin: '0', textAlign: 'right' }}>{serviceDescription}</Text></Column>
            </Row>
            <Row style={{ marginBottom: '12px' }}>
              <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>POSTS PUBLISHED</Text></Column>
              <Column><Text style={{ fontSize: '14px', color: '#111111', margin: '0', textAlign: 'right' }}>{postsPublished}</Text></Column>
            </Row>
            <Row>
              <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>PLATFORMS</Text></Column>
              <Column><Text style={{ fontSize: '14px', color: '#111111', margin: '0', textAlign: 'right' }}>{(platforms || []).join(', ')}</Text></Column>
            </Row>
          </Section>

          {/* CTA */}
          {paymentUrl && (
            <Section style={{ padding: '32px 40px' }}>
              <Button href={paymentUrl} style={{ backgroundColor: '#000000', color: '#ffffff', fontSize: '14px', fontWeight: '700', letterSpacing: '1px', padding: '16px 32px', textDecoration: 'none', display: 'block', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
                PAY NOW →
              </Button>
            </Section>
          )}

          {/* Footer */}
          <Section style={{ backgroundColor: '#F7F7F7', padding: '24px 40px', marginTop: paymentUrl ? '0' : '32px' }}>
            <Text style={{ fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.6' }}>
              Questions about this invoice? Reply directly to this email.<br />
              Sleeping Creators · sleeeping.creators@gmail.com
            </Text>
          </Section>

        </Section>
      </Body>
    </Html>
  );
}
