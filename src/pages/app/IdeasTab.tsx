import { ShieldCheck, Sparkles } from "lucide-react";
import { suggestedFeatures } from "../../data";
import { Panel } from "../../ui/Panel";

export function IdeasTab() {
  return (
    <section className="page-stack">
      <Panel title="Suggested next features" icon={<Sparkles />}>
        <div className="idea-grid">
          {suggestedFeatures.map((feature) => (
            <div className="idea-card" key={feature.title}>
              <span className="status-pill">{feature.tier}</span>
              <h3>{feature.title}</h3>
              <p>{feature.benefit}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Production readiness checklist" icon={<ShieldCheck />}>
        <ul className="checklist">
          <li>Connect a backend database such as Postgres before real customer use.</li>
          <li>
            Add secure login, roles, tenant isolation, and audit logs for SaaS customers.
          </li>
          <li>Use a payment processor such as Stripe for subscriptions and invoices.</li>
          <li>
            Review local laws for consent, privacy, scanned signatures, and official
            submissions.
          </li>
          <li>
            Add server-side OCR processing for large PDF batches and handwritten forms.
          </li>
        </ul>
      </Panel>
    </section>
  );
}
