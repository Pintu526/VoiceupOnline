import { Megaphone } from "lucide-react";

type LegalPageType = "privacy" | "terms" | "refund" | "data-deletion";

interface LegalPageProps {
  page: LegalPageType;
}

const legalContent: Record<LegalPageType, { title: string; body: string[] }> = {
  privacy: {
    title: "Privacy Policy",
    body: [
      "Voiceup Bharat helps campaign organizations collect supporter information for public campaigns.",
      "Campaign organizers are responsible for collecting valid consent and using supporter data only for the stated campaign purpose.",
      "Production deployments should configure secure authentication, tenant isolation, audit logs, and data deletion workflows before collecting sensitive data."
    ]
  },
  terms: {
    title: "Terms of Service",
    body: [
      "Organizations must use Voiceup Bharat only for lawful campaigns and public-interest engagement.",
      "Campaign owners are responsible for the accuracy of campaign content, authority targeting, consent language, and legal compliance.",
      "The current MVP requires production hardening before high-volume or legally sensitive campaigns."
    ]
  },
  refund: {
    title: "Refund and Cancellation Policy",
    body: [
      "Subscription billing should be connected through Razorpay or another approved provider before paid launch.",
      "Refund windows, cancellation terms, and invoice handling must be configured by the SaaS operator.",
      "Enterprise plans may use custom contracts and custom support terms."
    ]
  },
  "data-deletion": {
    title: "Data Deletion Request",
    body: [
      "Supporters may request export or deletion of their personal data through the campaign organizer.",
      "Production deployments should include authenticated data export, delete, and retention controls.",
      "Campaign organizations should maintain an audit trail for consent, submissions, and deletion requests."
    ]
  }
};

export function LegalPage({ page }: LegalPageProps) {
  const content = legalContent[page];

  return (
    <main className="marketing-home">
      <header className="marketing-nav">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>{content.title}</span>
          </div>
        </div>
        <a className="secondary-link-button" href="/">
          Back home
        </a>
      </header>
      <section className="empty-state public-not-found">
        <span className="eyebrow">Legal</span>
        <h1>{content.title}</h1>
        {content.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
    </main>
  );
}
