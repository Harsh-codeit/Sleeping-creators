import LegalDocument from "../components/LegalDocument";

const sections = [
  {
    heading: "Acceptance of Terms",
    paragraphs: [
      "By accessing or using the Sleeping Creators service, you agree to these Terms of Service. If you do not agree, do not use the service.",
      "This Sleeping Creators deployment is a private agency-operated application, not a public self-serve SaaS offering. Access is intended only for authorized internal users and permitted client-related workflows.",
      "If you use the system on behalf of a business or other entity, you represent that you are authorized to bind that entity to these terms.",
    ],
  },
  {
    heading: "Service Description",
    paragraphs: [
      "Sleeping Creators is an internal agency content operations system used to manage clients, organize assets, connect social media accounts, schedule content, publish posts, and review related analytics and automation activity.",
    ],
  },
  {
    heading: "Account Responsibilities",
    bullets: [
      "You are responsible for maintaining the confidentiality of your login credentials and connected platform accounts.",
      "You are responsible for all activity that occurs under your account or through your authorized integrations.",
      "You must provide accurate information and keep your connected platform permissions current and lawful.",
      "You may not give access to unauthorized third parties or use the system outside approved agency or client operations.",
    ],
  },
  {
    heading: "Acceptable Use",
    bullets: [
      "You may not use the service for unlawful, deceptive, fraudulent, infringing, abusive, or harmful activity.",
      "You may not interfere with the service, bypass security controls, scrape unauthorized data, or attempt to access accounts or systems without permission.",
      "You may not use the service in violation of Meta Platform Terms or the rules of any connected third-party service.",
    ],
  },
  {
    heading: "User Content and Permissions",
    paragraphs: [
      "You retain responsibility for the text, media, prompts, account information, and other materials you upload or submit through the service.",
      "You grant the operator of this Sleeping Creators deployment a limited license to host, process, format, transmit, and display that content solely as needed to carry out agency services and operate or improve this internal system.",
    ],
  },
  {
    heading: "Third-Party Services",
    paragraphs: [
      "The system may depend on third-party platforms, infrastructure providers, analytics tools, storage systems, and APIs. Availability of those services may affect Sleeping Creators functionality.",
      "Your use of third-party services, including Meta products, is also governed by the terms and policies of those third parties.",
    ],
  },
  {
    heading: "Disclaimers and Limitation of Liability",
    paragraphs: [
      "The system is provided on an as-is and as-available basis to the maximum extent permitted by law. We do not guarantee uninterrupted availability, error-free operation, or specific business outcomes from use of the platform.",
      "To the maximum extent permitted by law, the operator of this Sleeping Creators deployment is not liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenues, data, or goodwill arising from use of the service.",
    ],
  },
  {
    heading: "Termination",
    paragraphs: [
      "We may suspend or terminate access to the system if we reasonably believe a user has violated these terms, created security or legal risk, or misused the platform or connected integrations.",
      "Because this is a private agency-operated application, access may also be removed when a user no longer has a legitimate business need or authorization. Provisions that by their nature should survive termination will remain in effect after access ends.",
    ],
  },
  {
    heading: "Changes and Contact",
    paragraphs: [
      "We may update these terms from time to time by posting a revised version on this page. Continued use of the service after an update becomes effective constitutes acceptance of the revised terms.",
      "For questions about these terms, contact the business operating this Sleeping Creators deployment using the contact details provided on its website, app listing, or account onboarding materials.",
    ],
  },
];

export default function TermsOfService() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms of Service"
      summary="These terms govern access to this private agency-operated Sleeping Creators system and the use of its dashboard, automations, publishing workflows, and third-party integrations."
      lastUpdated="March 30, 2026"
      sections={sections}
    />
  );
}
