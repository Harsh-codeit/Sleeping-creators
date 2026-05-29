import {
  Html, Head, Body, Container, Section, Text, Button, Hr, Img
} from "@react-email/components";

export function InstagramConnectEmail({ clientName = "there", connectUrl = "#", baseUrl = "" }) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#09090b", fontFamily: "sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 24px" }}>
          {baseUrl && (
            <Section style={{ marginBottom: "32px" }}>
              <Img src={`${baseUrl}/logo.png`} alt="Sleeping Creators" height="32" />
            </Section>
          )}
          <Section>
            <Text style={{ color: "#ffffff", fontSize: "22px", fontWeight: "700", margin: "0 0 8px" }}>
              Connect your Instagram, {clientName}
            </Text>
            <Text style={{ color: "#a1a1aa", fontSize: "15px", lineHeight: "1.6", margin: "0 0 28px" }}>
              Your Sleeping Creators account is ready. One last step — connect your Instagram
              so we can start publishing your content automatically.
            </Text>
            <Button
              href={connectUrl}
              style={{
                backgroundColor: "#ffffff",
                color: "#000000",
                padding: "14px 28px",
                borderRadius: "6px",
                fontWeight: "600",
                fontSize: "15px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Connect your Instagram
            </Button>
          </Section>
          <Hr style={{ borderColor: "#27272a", margin: "40px 0 24px" }} />
          <Text style={{ color: "#52525b", fontSize: "12px", margin: 0 }}>
            Sleeping Creators — automated content engine
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InstagramConnectEmail;
