import { Html, Head, Body, Section, Text, Hr } from '@react-email/components';

export function ClientReportEmail({ clientName, period, postsPublished, platforms, likes, comments, reach, queuePending, queueApproved, topPostImageUrl, topPostCaption }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#ffffff', color: '#111111', maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
        <Text style={{ fontSize: '13px', color: '#888', margin: '0 0 4px 0' }}>SLEEPING CREATORS</Text>
        <Text style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0' }}>Monthly Report</Text>
        <Text style={{ fontSize: '14px', color: '#555', margin: '0 0 24px 0' }}>{period} · {clientName}</Text>
        <Hr style={{ borderColor: '#eeeeee', margin: '0 0 24px 0' }} />
        <Text style={{ fontSize: '13px', fontWeight: '600', color: '#888', margin: '0 0 12px 0' }}>CONTENT PUBLISHED</Text>
        <Section style={{ backgroundColor: '#f9f9f9', padding: '16px', marginBottom: '24px' }}>
          <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Posts: <strong>{postsPublished}</strong></Text>
          <Text style={{ margin: '0', fontSize: '14px' }}>Platforms: <strong>{(platforms || []).join(', ')}</strong></Text>
        </Section>
        <Text style={{ fontSize: '13px', fontWeight: '600', color: '#888', margin: '0 0 12px 0' }}>ENGAGEMENT</Text>
        <Section style={{ backgroundColor: '#f9f9f9', padding: '16px', marginBottom: '24px' }}>
          <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Likes: <strong>{likes?.toLocaleString() ?? '—'}</strong></Text>
          <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Comments: <strong>{comments?.toLocaleString() ?? '—'}</strong></Text>
          <Text style={{ margin: '0', fontSize: '14px' }}>Reach: <strong>{reach?.toLocaleString() ?? '—'}</strong></Text>
        </Section>
        <Text style={{ fontSize: '13px', fontWeight: '600', color: '#888', margin: '0 0 12px 0' }}>CONTENT QUEUE</Text>
        <Section style={{ backgroundColor: '#f9f9f9', padding: '16px', marginBottom: '24px' }}>
          <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Pending: <strong>{queuePending ?? 0}</strong></Text>
          <Text style={{ margin: '0', fontSize: '14px' }}>Approved: <strong>{queueApproved ?? 0}</strong></Text>
        </Section>
        {topPostCaption && <>
          <Text style={{ fontSize: '13px', fontWeight: '600', color: '#888', margin: '0 0 12px 0' }}>TOP POST ★</Text>
          {topPostImageUrl && <img src={topPostImageUrl} alt="Top post" style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', marginBottom: '8px' }} />}
          <Text style={{ fontSize: '13px', color: '#555', fontStyle: 'italic', margin: '0 0 24px 0' }}>"{topPostCaption}"</Text>
        </>}
        <Hr style={{ borderColor: '#eeeeee', margin: '0 0 16px 0' }} />
        <Text style={{ fontSize: '12px', color: '#aaa' }}>Questions? Reply to this email.</Text>
      </Body>
    </Html>
  );
}
