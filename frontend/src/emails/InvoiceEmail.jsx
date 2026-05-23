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

          {/* Greeting */}
          <Section style={{ padding: '36px 40px 0' }}>
            <Text style={{ fontSize: '16px', color: '#111111', margin: '0 0 16px', lineHeight: '1.7' }}>
              Hey {clientName},
            </Text>
            <Text style={{ fontSize: '15px', color: '#444444', margin: '0 0 16px', lineHeight: '1.7' }}>
              Hope things are going well on your end!
            </Text>
            <Text style={{ fontSize: '15px', color: '#444444', margin: '0 0 24px', lineHeight: '1.7' }}>
              Just sending over the invoice for this month's social media management. Everything's running — content going out, strategy on track, and we're keeping things moving on our end.
            </Text>
          </Section>

          {/* Amount hero */}
          <Section style={{ backgroundColor: '#F7F7F7', margin: '0 40px', padding: '24px' }}>
            <Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' }}>AMOUNT DUE · {period}</Text>
            <Text style={{ fontSize: '48px', fontWeight: '900', color: '#000000', margin: '0', letterSpacing: '-2px', lineHeight: '1' }}>{amount}</Text>
          </Section>

          {/* Details */}
          {(serviceDescription || postsPublished || (platforms || []).length > 0) && (
            <Section style={{ margin: '0 40px', padding: '16px 24px', borderLeft: '3px solid #eeeeee' }}>
              {serviceDescription && (
                <Row style={{ marginBottom: '8px' }}>
                  <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>SERVICE</Text></Column>
                  <Column><Text style={{ fontSize: '13px', color: '#111111', margin: '0', textAlign: 'right' }}>{serviceDescription}</Text></Column>
                </Row>
              )}
              {postsPublished > 0 && (
                <Row style={{ marginBottom: '8px' }}>
                  <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>POSTS PUBLISHED</Text></Column>
                  <Column><Text style={{ fontSize: '13px', color: '#111111', margin: '0', textAlign: 'right' }}>{postsPublished}</Text></Column>
                </Row>
              )}
              {(platforms || []).length > 0 && (
                <Row>
                  <Column><Text style={{ fontSize: '11px', color: '#999999', letterSpacing: '1px', margin: '0', fontWeight: '600' }}>PLATFORMS</Text></Column>
                  <Column><Text style={{ fontSize: '13px', color: '#111111', margin: '0', textAlign: 'right' }}>{platforms.join(', ')}</Text></Column>
                </Row>
              )}
            </Section>
          )}

          {/* Payment notice */}
          <Section style={{ padding: '24px 40px 0' }}>
            <Text style={{ fontSize: '15px', color: '#444444', margin: '0 0 16px', lineHeight: '1.7' }}>
              Please make sure the payment is done within <strong style={{ color: '#000000' }}>3–4 days</strong>. If it doesn't come through by then, we'll have to pause posting until it's cleared. Don't want any gap in your content calendar, so just sort it when you get a moment!
            </Text>
            <Text style={{ fontSize: '15px', color: '#444444', margin: '0 0 24px', lineHeight: '1.7' }}>
              Once done, just reply to this email with <strong style={{ color: '#000000' }}>"Done"</strong> and we'll confirm from our end.
            </Text>
          </Section>

          {/* CTA */}
          {paymentUrl && (
            <Section style={{ padding: '0 40px 32px' }}>
              <Button href={paymentUrl} style={{ backgroundColor: '#000000', color: '#ffffff', fontSize: '14px', fontWeight: '700', letterSpacing: '1px', padding: '16px 32px', textDecoration: 'none', display: 'block', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
                PAY NOW →
              </Button>
            </Section>
          )}

          <Hr style={{ borderColor: '#eeeeee', margin: '0 40px' }} />

          {/* Sign-off */}
          <Section style={{ padding: '28px 40px' }}>
            <Text style={{ fontSize: '15px', color: '#444444', margin: '0 0 4px', lineHeight: '1.7' }}>
              Any issues with the payment, just ping me on WhatsApp — happy to sort it out.
            </Text>
            <Text style={{ fontSize: '15px', color: '#444444', margin: '16px 0 4px', lineHeight: '1.7' }}>
              Thanks,
            </Text>
            <Text style={{ fontSize: '15px', fontWeight: '700', color: '#111111', margin: '0 0 2px' }}>Nikhil</Text>
            <Text style={{ fontSize: '13px', color: '#999999', margin: '0' }}>Sleeping Creators · sleepingcreators.com</Text>
          </Section>

        </Section>
      </Body>
    </Html>
  );
}
