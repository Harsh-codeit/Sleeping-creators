import LegalDocument from "../components/LegalDocument";

const sections = [
  {
    heading: "Scope",
    paragraphs: [
      "This Privacy Policy explains how the agency operating this Sleeping Creators deployment collects, uses, stores, and discloses information in connection with its internal content operations system and related social media integrations.",
      "It applies to information processed through the dashboard, connected Meta products, scheduling workflows, analytics features, and support or operational interactions tied to this private agency tool.",
    ],
  },
  {
    heading: "Information We Collect",
    paragraphs: [
      "We may collect team account information, client profile details, connected social account identifiers, onboarding information, uploaded media, scheduling preferences, analytics data, and messages or records needed to operate this internal system for agency work.",
    ],
    bullets: [
      "Contact and account details such as names, usernames, email addresses, and business information submitted by users.",
      "Content assets and operational data such as captions, media files, templates, publishing schedules, and workflow settings.",
      "Integration data from Meta and other connected platforms, including page or profile identifiers, access tokens, permissions granted, and publishing status information.",
      "Technical and usage information such as log data, IP address, browser details, device information, and app activity needed for security, diagnostics, and product improvement.",
    ],
  },
  {
    heading: "How We Use Information",
    bullets: [
      "To operate, maintain, and secure the agency's internal Sleeping Creators workflow system.",
      "To connect and manage social media accounts, including Meta pages and Instagram accounts, on behalf of agency-managed clients.",
      "To create, schedule, publish, analyze, and improve client content workflows.",
      "To communicate with authorized users about operational updates, support requests, security notices, and administrative matters.",
      "To monitor abuse, enforce our terms, comply with legal obligations, and protect the rights of users and third parties.",
    ],
  },
  {
    heading: "Meta Platform Data",
    paragraphs: [
      "If you connect a Meta account or page, we process the data and permissions required to complete the actions you authorize, such as authentication, page selection, publishing, and performance reporting.",
      "We do not use Meta data for purposes that are inconsistent with Meta's Platform Terms or the permissions granted by the user.",
    ],
  },
  {
    heading: "Sharing of Information",
    paragraphs: [
      "We do not sell personal information. We may share data with service providers and infrastructure partners that help us host this system, store media, process analytics, support internal operations, or maintain security.",
      "We may also disclose information when required by law, to respond to valid legal requests, to investigate fraud or abuse, or as part of a merger, acquisition, or asset transfer.",
    ],
  },
  {
    heading: "Data Retention and Security",
    paragraphs: [
      "We keep information for as long as needed to support agency operations, comply with legal obligations, resolve disputes, and enforce agreements. Retention periods may vary depending on the type of data and the purpose for which it was collected.",
      "We use reasonable administrative, technical, and organizational measures to protect data. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "Your Choices and Rights",
    bullets: [
      "You may request access to, correction of, or deletion of your information, subject to applicable law and legitimate business needs.",
      "You may disconnect Meta or other third-party integrations at any time through the service where available.",
      "Because this is a private agency-operated application, access is limited to authorized users and client-related workflows rather than open public registration.",
      "Use of the system may stop at any time, though some information may be retained for legal, audit, backup, or security purposes.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      "For questions, privacy requests, or data deletion inquiries, contact the business operating this Sleeping Creators deployment using the contact details provided on its website, app listing, or account onboarding materials.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      eyebrow="Privacy"
      title="Privacy Policy"
      summary="This page describes how the agency-operated Sleeping Creators system handles information in connection with internal content operations, client management, and Meta-linked publishing workflows."
      lastUpdated="March 30, 2026"
      sections={sections}
    />
  );
}
