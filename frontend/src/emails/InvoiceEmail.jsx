import { Html, Head, Body, Section, Text, Button, Hr, Row, Column, Img, Font } from '@react-email/components';

export function InvoiceEmail({
  clientName, clientEmail, clientPhone, clientGstin,
  invoiceNumber, invoiceDate, invoiceMonth,
  amount, discount = 0, amountInWords,
  includeGst = false,
  paymentUrl, baseUrl = '',
}) {
  const subtotal = Number(String(amount || 0).replace(/,/g, '')) || 0;
  const gst = includeGst ? Math.round(subtotal * 0.18) : 0;
  const disc = Number(String(discount || 0).replace(/,/g, '')) || 0;
  const total = subtotal + gst - disc;
  const fmt = n => n.toLocaleString('en-IN');

  const metaLbl = { margin: '0 0 10px', fontSize: '9px', fontWeight: '600', color: '#aaaaaa', letterSpacing: '1.5px', textTransform: 'uppercase' };
  const metaVal = { margin: 0, fontSize: '13px', fontWeight: '600', color: '#111111', fontFamily: 'Inter,Helvetica,Arial,sans-serif' };
  const thStyle = { margin: 0, fontSize: '9px', fontWeight: '700', color: '#ffffff', letterSpacing: '1.5px', textTransform: 'uppercase' };
  const fromLbl = { margin: 0, fontSize: '10px', color: '#777777' };
  const fromVal = { margin: 0, fontSize: '10px', fontWeight: '700', color: '#ffffff', lineHeight: '16px' };

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
        <Section style={{ maxWidth: '640px', margin: '0 auto', backgroundColor: '#ffffff' }}>

          {/* ── HEADER ──────────────────────────────────────────────── */}
          <Section style={{ padding: '24px 32px', borderBottom: '2px solid #000000' }}>
            <Row>
              <Column style={{ width: '50%', verticalAlign: 'middle' }}>
                <Row>
                  <Column style={{ width: '48px', verticalAlign: 'middle' }}>
                    <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" width="40" height="40" style={{ display: 'block', borderRadius: '8px' }} />
                  </Column>
                  <Column style={{ paddingLeft: '10px', verticalAlign: 'middle' }}>
                    <Text style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#000000', lineHeight: '1.2' }}>Sleeping Creators</Text>
                  </Column>
                </Row>
              </Column>
              <Column style={{ width: '50%', textAlign: 'right', verticalAlign: 'middle' }}>
                <Text style={{ margin: '0 0 2px', fontSize: '26px', fontWeight: '700', color: '#000000', lineHeight: '1.1' }}>Invoice</Text>
                <Text style={{ margin: 0, fontSize: '11px', color: '#888888' }}>sleepingcreators.com</Text>
              </Column>
            </Row>
          </Section>

          {/* ── META CARDS ──────────────────────────────────────────── */}
          <Section style={{ padding: '20px 32px' }}>
            <Row>
              <Column style={{ width: '33.33%', paddingRight: '8px' }}>
                <Section style={{ border: '1px solid #dddddd', padding: '12px 14px' }}>
                  <Text style={metaLbl}>Invoice Number</Text>
                  <Text style={metaVal}>{invoiceNumber || '—'}</Text>
                  <Hr style={{ borderColor: '#eeeeee', margin: '8px 0 0' }} />
                </Section>
              </Column>
              <Column style={{ width: '33.33%', paddingLeft: '4px', paddingRight: '4px' }}>
                <Section style={{ border: '1px solid #dddddd', padding: '12px 14px' }}>
                  <Text style={metaLbl}>Invoice Date</Text>
                  <Text style={metaVal}>{invoiceDate || '—'}</Text>
                  <Hr style={{ borderColor: '#eeeeee', margin: '8px 0 0' }} />
                </Section>
              </Column>
              <Column style={{ width: '33.33%', paddingLeft: '8px' }}>
                <Section style={{ border: '1px solid #dddddd', padding: '12px 14px' }}>
                  <Text style={metaLbl}>Invoice Month</Text>
                  <Text style={metaVal}>{invoiceMonth || '—'}</Text>
                  <Hr style={{ borderColor: '#eeeeee', margin: '8px 0 0' }} />
                </Section>
              </Column>
            </Row>
          </Section>

          {/* ── FROM / BILLED TO ────────────────────────────────────── */}
          <Section style={{ padding: '0 32px 20px' }}>
            <Row style={{ verticalAlign: 'top' }}>
              <Column style={{ width: '50%', paddingRight: '8px', verticalAlign: 'top' }}>
                <Section style={{ backgroundColor: '#111111', padding: '16px 18px' }}>
                  <Text style={{ margin: '0 0 2px', fontSize: '10px', fontWeight: '700', color: '#ffffff', letterSpacing: '1.5px', textTransform: 'uppercase' }}>FROM</Text>
                  <Hr style={{ borderColor: '#333333', margin: '10px 0' }} />
                  <Row style={{ marginBottom: '8px' }}>
                    <Column style={{ width: '68px' }}><Text style={fromLbl}>Business</Text></Column>
                    <Column><Text style={fromVal}>Sleeping Creators</Text></Column>
                  </Row>
                  <Row style={{ marginBottom: '8px' }}>
                    <Column style={{ width: '68px' }}><Text style={fromLbl}>Email</Text></Column>
                    <Column><Text style={fromVal}>hello@sleepingcreators.com</Text></Column>
                  </Row>
                  <Row style={{ marginBottom: '8px' }}>
                    <Column style={{ width: '68px' }}><Text style={fromLbl}>Website</Text></Column>
                    <Column><Text style={fromVal}>sleepingcreators.com</Text></Column>
                  </Row>
                  <Row style={{ marginBottom: '8px' }}>
                    <Column style={{ width: '68px' }}><Text style={fromLbl}>Address</Text></Column>
                    <Column>
                      <Text style={fromVal}>801, B Block, Shubh Labh Heights</Text>
                      <Text style={fromVal}>Near Robot Square, Indore - 452010</Text>
                    </Column>
                  </Row>
                </Section>
              </Column>
              <Column style={{ width: '50%', paddingLeft: '8px', verticalAlign: 'top' }}>
                <Section style={{ border: '1px solid #dddddd', padding: '16px 18px' }}>
                  <Text style={{ margin: '0 0 2px', fontSize: '10px', fontWeight: '700', color: '#111111', letterSpacing: '1.5px', textTransform: 'uppercase' }}>BILLED TO</Text>
                  <Hr style={{ borderColor: '#eeeeee', margin: '10px 0' }} />
                  <Text style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: '#111111', borderBottom: '1px solid #eeeeee', paddingBottom: '8px', display: 'block' }}>{clientName || 'CLIENT NAME'}</Text>
                  <Text style={{ margin: '0 0 10px', fontSize: '11px', color: '#666666', borderBottom: '1px solid #eeeeee', paddingBottom: '8px', display: 'block' }}>{clientEmail || 'EMAIL'}</Text>
                  <Text style={{ margin: '0 0 10px', fontSize: '11px', color: '#666666', borderBottom: '1px solid #eeeeee', paddingBottom: '8px', display: 'block' }}>{clientPhone || 'PHONE / WHATSAPP'}</Text>
                  <Text style={{ margin: 0, fontSize: '11px', color: '#999999' }}>{clientGstin || 'GSTIN (if applicable)'}</Text>
                </Section>
              </Column>
            </Row>
          </Section>

          {/* ── LINE ITEMS TABLE ────────────────────────────────────── */}
          <Section style={{ padding: '0 32px' }}>
            <Section style={{ backgroundColor: '#111111', padding: '10px 16px' }}>
              <Row>
                <Column style={{ width: '50%' }}><Text style={thStyle}>Description</Text></Column>
                <Column style={{ width: '18%' }}><Text style={thStyle}>HSN Code</Text></Column>
                <Column style={{ width: '10%' }}><Text style={thStyle}>QTY</Text></Column>
                <Column style={{ width: '22%', textAlign: 'right' }}><Text style={{ ...thStyle, textAlign: 'right' }}>Amount</Text></Column>
              </Row>
            </Section>
            <Section style={{ border: '1px solid #eeeeee', borderTop: 'none', padding: '14px 16px' }}>
              <Row>
                <Column style={{ width: '50%' }}>
                  <Text style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: '700', color: '#111111' }}>Instagram Management (Monthly)</Text>
                  <Text style={{ margin: 0, fontSize: '10px', color: '#888888' }}>Social Media Marketing &amp; Content Management</Text>
                </Column>
                <Column style={{ width: '18%' }}><Text style={{ margin: 0, fontSize: '11px', color: '#333333' }}>998372</Text></Column>
                <Column style={{ width: '10%' }}><Text style={{ margin: 0, fontSize: '11px', color: '#333333' }}>1</Text></Column>
                <Column style={{ width: '22%', textAlign: 'right' }}><Text style={{ margin: 0, fontSize: '11px', color: '#333333', textAlign: 'right' }}>₹{fmt(subtotal)}</Text></Column>
              </Row>
            </Section>
          </Section>

          {/* ── TOTALS ──────────────────────────────────────────────── */}
          <Section style={{ padding: '0 32px 4px' }}>
            <Row>
              <Column style={{ width: '42%' }} />
              <Column style={{ width: '58%' }}>
                <Section style={{ borderBottom: '1px solid #eeeeee', padding: '8px 16px' }}>
                  <Row>
                    <Column><Text style={{ margin: 0, fontSize: '11px', color: '#555555' }}>Subtotal</Text></Column>
                    <Column style={{ textAlign: 'right' }}><Text style={{ margin: 0, fontSize: '11px', color: '#111111', textAlign: 'right' }}>₹{fmt(subtotal)}</Text></Column>
                  </Row>
                </Section>
                {includeGst && (
                <Section style={{ borderBottom: '1px solid #eeeeee', padding: '8px 16px' }}>
                  <Row>
                    <Column><Text style={{ margin: 0, fontSize: '11px', color: '#555555' }}>GST (18%)</Text></Column>
                    <Column style={{ textAlign: 'right' }}><Text style={{ margin: 0, fontSize: '11px', color: '#111111', textAlign: 'right' }}>₹{fmt(gst)}</Text></Column>
                  </Row>
                </Section>
                )}
                <Section style={{ borderBottom: '1px solid #eeeeee', padding: '8px 16px' }}>
                  <Row>
                    <Column><Text style={{ margin: 0, fontSize: '11px', color: '#555555' }}>Discount</Text></Column>
                    <Column style={{ textAlign: 'right' }}><Text style={{ margin: 0, fontSize: '11px', color: '#111111', textAlign: 'right' }}>{disc > 0 ? `₹${fmt(disc)}` : '0'}</Text></Column>
                  </Row>
                </Section>
                <Section style={{ backgroundColor: '#111111', padding: '10px 16px' }}>
                  <Row>
                    <Column><Text style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: '#ffffff', letterSpacing: '1px', textTransform: 'uppercase' }}>Total Due</Text></Column>
                    <Column style={{ textAlign: 'right' }}><Text style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#ffffff', textAlign: 'right', fontFamily: 'Inter,Helvetica,Arial,sans-serif' }}>₹{fmt(total)}</Text></Column>
                  </Row>
                </Section>
              </Column>
            </Row>
          </Section>

          {/* ── FOOTNOTES ───────────────────────────────────────────── */}
          <Section style={{ padding: '12px 32px 0' }}>
            <Text style={{ margin: '0 0 2px', fontSize: '10px', color: '#999999', fontStyle: 'italic' }}>* HSN 998372 — Social Media Marketing Services</Text>
            {includeGst && (
              <Text style={{ margin: 0, fontSize: '10px', color: '#999999', fontStyle: 'italic' }}>* GST applicable as per government norms</Text>
            )}
          </Section>

          {/* ── AMOUNT IN WORDS ─────────────────────────────────────── */}
          <Section style={{ padding: '16px 32px' }}>
            <Section style={{ border: '1px solid #dddddd', padding: '12px 16px' }}>
              <Text style={{ margin: '0 0 4px', fontSize: '9px', fontWeight: '600', color: '#aaaaaa', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Amount Chargeable (in words)</Text>
              <Text style={{ margin: 0, fontSize: '12px', color: '#111111' }}>
                INR {amountInWords || '___________________________________________________'} Only
              </Text>
            </Section>
          </Section>

          {/* ── NOTE ────────────────────────────────────────────────── */}
          <Section style={{ padding: '0 32px 20px' }}>
            <Text style={{ margin: 0, fontSize: '10px', color: '#888888', fontStyle: 'italic', lineHeight: '1.7' }}>
              * Note: Delayed payments may result in temporary suspension of services. Kindly ensure timely payment to avoid interruptions.
            </Text>
          </Section>

          {/* ── CTA ─────────────────────────────────────────────────── */}
          {paymentUrl && (
            <Section style={{ padding: '0 32px 40px', textAlign: 'center' }}>
              <Button href={paymentUrl}
                style={{ backgroundColor: '#111111', color: '#ffffff', fontSize: '14px', fontWeight: '600', padding: '14px 40px', textDecoration: 'none', borderRadius: '6px', display: 'inline-block' }}>
                Click here to Pay Now →
              </Button>
            </Section>
          )}

          {/* ── FOOTER LOGO ─────────────────────────────────────────── */}
          <Section style={{ padding: '24px 0 16px', textAlign: 'center' }}>
            <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" width="56" height="56" style={{ display: 'block', margin: '0 auto 8px', borderRadius: '12px' }} />
            <Text style={{ margin: 0, fontSize: '11px', color: '#aaaaaa' }}>Sleeping Creators</Text>
          </Section>

          {/* ── FOOTER BAR ──────────────────────────────────────────── */}
          <Section style={{ backgroundColor: '#111111', padding: '14px 32px' }}>
            <Row>
              <Column style={{ width: '60%' }}>
                <Text style={{ margin: 0, fontSize: '10px', color: '#666666', lineHeight: '1.5' }}>
                  Sleeping Creators · sleepingcreators.com
                </Text>
              </Column>
              <Column style={{ width: '40%', textAlign: 'right' }}>
                <Text style={{ margin: 0, fontSize: '10px', color: '#666666', textAlign: 'right' }}>Thank you for your business.</Text>
              </Column>
            </Row>
          </Section>

        </Section>
      </Body>
    </Html>
  );
}
