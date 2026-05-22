import { Html, Head, Body, Section, Text, Button, Hr } from '@react-email/components';

export function InvoiceEmail({ clientName, period, postsPublished, platforms, amount, serviceDescription, paymentUrl }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#ffffff', color: '#111111', maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
        <Text style={{ fontSize: '13px', color: '#888', margin: '0 0 4px 0' }}>SLEEPING CREATORS</Text>
        <Text style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 24px 0' }}>Invoice — {period}</Text>
        <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px 0' }} />
        <Text style={{ fontSize: '14px', color: '#555', margin: '0 0 4px 0' }}>Client</Text>
        <Text style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 16px 0' }}>{clientName}</Text>
        <Text style={{ fontSize: '14px', color: '#555', margin: '0 0 4px 0' }}>Service</Text>
        <Text style={{ fontSize: '16px', margin: '0 0 16px 0' }}>{serviceDescription}</Text>
        <Section style={{ backgroundColor: '#f9f9f9', padding: '16px', margin: '0 0 24px 0' }}>
          <Text style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#555' }}>Posts published: <strong>{postsPublished}</strong></Text>
          <Text style={{ margin: '0', fontSize: '13px', color: '#555' }}>Platforms: <strong>{(platforms || []).join(', ')}</strong></Text>
        </Section>
        <Hr style={{ borderColor: '#eeeeee', margin: '0 0 16px 0' }} />
        <Text style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 24px 0' }}>Amount Due: {amount}</Text>
        {paymentUrl && (
          <Button href={paymentUrl} style={{ backgroundColor: '#000000', color: '#ffffff', padding: '12px 24px', fontSize: '14px', fontWeight: '600', textDecoration: 'none', display: 'inline-block' }}>
            Pay Now →
          </Button>
        )}
        <Hr style={{ borderColor: '#eeeeee', margin: '32px 0 16px 0' }} />
        <Text style={{ fontSize: '12px', color: '#aaa' }}>Thank you for trusting Sleeping Creators with your content.</Text>
      </Body>
    </Html>
  );
}
