import { Html, Head, Body, Section, Text, Button, Hr, Row, Column, Img, Font } from '@react-email/components';

// Wise design system
// Canvas soft (sage): #e8ebe6 · Canvas (white): #ffffff · Ink: #0e0f0c
// Primary (lime-green): #9fe870 · Body text: #454745 · Mute: #868685
// Radius: 24px cards/buttons · Typography: Inter 900 display / 400 body

export function InvoiceEmail({ clientName, period, postsPublished, platforms, amount, serviceDescription, paymentUrl, baseUrl = '' }) {
  const hasDetails = serviceDescription || postsPublished > 0 || (platforms || []).length > 0;

  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{ url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2', format: 'woff2' }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{ url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKZAZ9hiJ-Ek-_EeA.woff2', format: 'woff2' }}
          fontWeight={900}
          fontStyle="normal"
        />
        <Font
          fontFamily="IBM Plex Mono"
          fallbackFontFamily="Courier New"
          webFont={{ url: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F63fjptAgt5VM-kVkqdyU8n3oQIwlBFhA.woff2', format: 'woff2' }}
          fontWeight={600}
          fontStyle="normal"
        />
      </Head>
      <Body style={{ margin: 0, padding: 0, backgroundColor: '#e8ebe6', fontFamily: 'Inter, Helvetica, Arial, sans-serif' }}>

        {/* Outer container */}
        <Section style={{ maxWidth: '600px', margin: '0 auto', padding: '0 0 40px' }}>

          {/* ── HEADER BAND (sage) ───────────────────────────────────── */}
          <Section style={{ backgroundColor: '#e8ebe6', padding: '32px 32px 0' }}>
            <Row>
              <Column>
                <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" height="32" style={{ display: 'block' }} />
              </Column>
              <Column style={{ textAlign: 'right' }}>
                <Text style={{ margin: 0, fontSize: '11px', fontWeight: '600', letterSpacing: '2px', color: '#868685', textTransform: 'uppercase' }}>
                  Invoice
                </Text>
              </Column>
            </Row>
          </Section>

          {/* ── AMOUNT HERO (sage → white card transition) ──────────── */}
          <Section style={{ backgroundColor: '#e8ebe6', padding: '28px 32px 0' }}>
            <Section style={{ backgroundColor: '#ffffff', borderRadius: '24px', overflow: 'hidden', border: '1px solid #d4d8d1' }}>
              {/* Lime-green accent stripe */}
              <Section style={{ backgroundColor: '#9fe870', padding: '6px 32px' }}>
                <Text style={{ margin: 0, fontSize: '11px', fontWeight: '700', letterSpacing: '2px', color: '#0e0f0c', textTransform: 'uppercase' }}>
                  Amount Due{period ? ` · ${period}` : ''} · Pay within 3–4 days
                </Text>
              </Section>
              <Section style={{ padding: '28px 32px 28px' }}>
                <Text style={{ margin: '0 0 20px', fontSize: '64px', fontWeight: '600', color: '#0e0f0c', letterSpacing: '-3px', lineHeight: '1', fontFamily: '"IBM Plex Mono", "Courier New", monospace' }}>
                  ₹{amount || '—'}
                </Text>
                {paymentUrl && (
                  <Button
                    href={paymentUrl}
                    style={{
                      backgroundColor: '#9fe870', color: '#0e0f0c',
                      fontSize: '15px', fontWeight: '700', letterSpacing: '0.2px',
                      padding: '14px 32px', textDecoration: 'none',
                      borderRadius: '24px', display: 'inline-block',
                    }}
                  >
                    Pay Now →
                  </Button>
                )}
              </Section>
            </Section>
          </Section>

          {/* ── WHITE CONTENT AREA ──────────────────────────────────── */}
          <Section style={{ backgroundColor: '#e8ebe6', padding: '12px 32px 0' }}>
            <Section style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '32px 32px 28px', border: '1px solid #d4d8d1' }}>

              {/* Greeting */}
              <Text style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: '900', color: '#0e0f0c', letterSpacing: '-0.5px', lineHeight: '1.2', fontFamily: 'Inter, Helvetica, Arial, sans-serif' }}>
                Hey {clientName},
              </Text>
              <Text style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: '400', color: '#454745', lineHeight: '1.7' }}>
                Hope things are going well on your end!
              </Text>
              <Text style={{ margin: '0', fontSize: '15px', fontWeight: '400', color: '#454745', lineHeight: '1.7' }}>
                Just sending over the invoice for this month's social media management. Everything's running — content going out, strategy on track, and we're keeping things moving on our end.
              </Text>

              {/* Line items */}
              {hasDetails && (
                <>
                  <Hr style={{ borderColor: '#e8ebe6', margin: '24px 0' }} />
                  <Section style={{ backgroundColor: '#e8ebe6', borderRadius: '16px', padding: '20px 20px 8px' }}>
                    {serviceDescription && (
                      <Row style={{ marginBottom: '14px' }}>
                        <Column style={{ width: '40%' }}>
                          <Text style={{ margin: 0, fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', color: '#868685', textTransform: 'uppercase' }}>Service</Text>
                        </Column>
                        <Column>
                          <Text style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0e0f0c', textAlign: 'right' }}>{serviceDescription}</Text>
                        </Column>
                      </Row>
                    )}
                    {period && (
                      <Row style={{ marginBottom: '14px' }}>
                        <Column style={{ width: '40%' }}>
                          <Text style={{ margin: 0, fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', color: '#868685', textTransform: 'uppercase' }}>Period</Text>
                        </Column>
                        <Column>
                          <Text style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0e0f0c', textAlign: 'right' }}>{period}</Text>
                        </Column>
                      </Row>
                    )}
                    {postsPublished > 0 && (
                      <Row style={{ marginBottom: '14px' }}>
                        <Column style={{ width: '40%' }}>
                          <Text style={{ margin: 0, fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', color: '#868685', textTransform: 'uppercase' }}>Posts Published</Text>
                        </Column>
                        <Column>
                          <Text style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0e0f0c', textAlign: 'right' }}>{postsPublished}</Text>
                        </Column>
                      </Row>
                    )}
                    {(platforms || []).length > 0 && (
                      <Row style={{ marginBottom: '14px' }}>
                        <Column style={{ width: '40%' }}>
                          <Text style={{ margin: 0, fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', color: '#868685', textTransform: 'uppercase' }}>Platforms</Text>
                        </Column>
                        <Column>
                          <Text style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0e0f0c', textAlign: 'right' }}>{platforms.join(', ')}</Text>
                        </Column>
                      </Row>
                    )}
                  </Section>
                </>
              )}

              {/* Payment notice */}
              <Hr style={{ borderColor: '#e8ebe6', margin: '24px 0' }} />
              <Text style={{ margin: '0 0 14px', fontSize: '15px', color: '#454745', lineHeight: '1.7' }}>
                Please make sure the payment is done within{' '}
                <strong style={{ color: '#0e0f0c', fontWeight: '700' }}>3–4 days</strong>.
                If it doesn't come through by then, we'll have to pause posting until it's cleared.
                Don't want any gap in your content calendar — just sort it when you get a moment!
              </Text>
              <Text style={{ margin: '0', fontSize: '15px', color: '#454745', lineHeight: '1.7' }}>
                Once done, just reply to this email with{' '}
                <strong style={{ color: '#0e0f0c', fontWeight: '700' }}>"Done"</strong>{' '}
                and we'll confirm from our end.
              </Text>

            </Section>
          </Section>

          {/* ── SIGN-OFF CARD ────────────────────────────────────────── */}
          <Section style={{ backgroundColor: '#e8ebe6', padding: '12px 32px 0' }}>
            <Section style={{ backgroundColor: '#ffffff', borderRadius: '24px', padding: '28px 32px', border: '1px solid #d4d8d1' }}>
              <Text style={{ margin: '0 0 4px', fontSize: '15px', color: '#454745', lineHeight: '1.7' }}>
                Any issues with the payment, just ping me on WhatsApp — happy to sort it out.
              </Text>
              <Text style={{ margin: '16px 0 4px', fontSize: '15px', color: '#454745', lineHeight: '1.7' }}>Thanks,</Text>
              <Text style={{ margin: '0 0 2px', fontSize: '16px', fontWeight: '700', color: '#0e0f0c' }}>Nikhil</Text>
              <Text style={{ margin: '0', fontSize: '13px', color: '#868685' }}>Sleeping Creators</Text>
            </Section>
          </Section>

          {/* ── FOOTER (ink) ─────────────────────────────────────────── */}
          <Section style={{ backgroundColor: '#e8ebe6', padding: '12px 32px 0' }}>
            <Section style={{ backgroundColor: '#0e0f0c', borderRadius: '24px', padding: '24px 32px' }}>
              <Row>
                <Column>
                  <Text style={{ margin: 0, fontSize: '13px', color: '#e8ebe6', lineHeight: '1.6' }}>
                    Sleeping Creators · sleepingcreators.com
                  </Text>
                  <Text style={{ margin: '4px 0 0', fontSize: '12px', color: '#454745', lineHeight: '1.5' }}>
                    Questions? Reply to this email or WhatsApp us directly.
                  </Text>
                </Column>
              </Row>
            </Section>
          </Section>

        </Section>
      </Body>
    </Html>
  );
}
