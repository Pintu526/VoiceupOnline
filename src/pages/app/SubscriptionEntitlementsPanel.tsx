import { useMemo, useState } from "react";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  CalendarClock,
  History,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  ShieldCheck,
  ShoppingCart,
  Timer,
  XCircle
} from "lucide-react";
import type { BillingCadence, BillingPlan, Campaign, Organization, ScanReviewItem, Signer } from "../../types";
import { FEATURE_KEYS, getCampaignEntitlements, type AddOnPurchaseRequest } from "../../entitlements";
import {
  getActiveCampaignCount,
  getMonthlyScanCount,
  getMonthlySignerCount,
  getSubscriptionPlan
} from "../../utils/subscription";
import { subscriptionPlans } from "../../data";
import { Panel } from "../../ui/Panel";
import { Field } from "../../ui/Field";
import { UsageCard } from "../../ui/UsageCard";

export interface SubscriptionEntitlementsPanelProps {
  organization: Organization;
  campaigns: Campaign[];
  signers: Signer[];
  scanItems: ScanReviewItem[];
  onUpgradePlan: (plan: BillingPlan) => void;
  onDowngradePlan: (plan: BillingPlan, effective: "immediately" | "period_end") => void;
  onRenewSubscription: (periodDays: number) => void;
  onExtendSubscription: (extraDays: number) => void;
  onSuspendSubscription: (reason: string) => void;
  onReactivateSubscription: () => void;
  onCancelSubscription: (atPeriodEnd: boolean) => void;
  onChangeBillingCycle: (cadence: BillingCadence) => void;
  onPurchaseAddOn: (request: AddOnPurchaseRequest) => void;
}

const ADD_ON_QUICK_BUYS: Array<{
  label: string;
  request: AddOnPurchaseRequest;
}> = [
  { label: "+100 OCR pages", request: { kind: "ocr_pages", quantity: 100, priceInr: 299 } },
  { label: "+5 operator seats", request: { kind: "operator_seats", quantity: 5, priceInr: 999 } },
  { label: "+1,000 MB storage", request: { kind: "storage_mb", quantity: 1000, priceInr: 199 } },
  { label: "+500 AI credits", request: { kind: "ai_credits", quantity: 500, priceInr: 499 } },
  { label: "+1,000 SMS credits", request: { kind: "sms_credits", quantity: 1000, priceInr: 799 } },
  { label: "+1,000 WhatsApp credits", request: { kind: "whatsapp_credits", quantity: 1000, priceInr: 999 } },
  { label: "Crowdfunding module", request: { kind: "feature", featureKey: "crowdfunding", quantity: 1, priceInr: 1999 } },
  { label: "Premium analytics", request: { kind: "feature", featureKey: "advanced_reports", quantity: 1, priceInr: 1499 } }
];

const FEATURE_LABELS: Partial<Record<string, string>> = {
  campaign_admin_access: "Campaign admin access",
  field_collection: "Field collection",
  secure_upload: "Secure upload",
  bulk_import: "Bulk import",
  ocr_processing: "OCR processing",
  sms: "SMS",
  whatsapp: "WhatsApp",
  crowdfunding: "Crowdfunding",
  expense_tracking: "Expense tracking",
  advanced_reports: "Advanced reports",
  volunteer_management: "Volunteer management",
  crm: "CRM",
  api_access: "API access",
  public_signing: "Public signing",
  basic_reports: "Basic reports",
  advanced_templates: "Advanced templates",
  ai_copilot: "AI Copilot",
  authority_intelligence: "Authority intelligence",
  communication_hub: "Communication hub",
  movement_crm: "Movement CRM",
  growth_engine: "Growth Engine",
  command_center: "Command Center",
  custom_branding: "Custom branding",
  multi_organization: "Multi-organization",
  roles: "Roles",
  integrations: "Integrations",
  custom_limits: "Custom limits",
  priority_support: "Priority support"
};

function formatDate(value: string): string {
  return value ? value : "Not set";
}

/**
 * Generic Subscription & Entitlements dashboard. Deliberately depends only on
 * the `Organization`-shaped entitlement fields and the centralized
 * entitlement engine, so it can be reused unchanged by every Business OS
 * application (Goudhan, PanditOnline, CateringHub, Hope Nurse Hub,
 * HomeTutorial Hub, TeachToday, and future apps).
 */
export function SubscriptionEntitlementsPanel({
  organization,
  campaigns,
  signers,
  scanItems,
  onUpgradePlan,
  onDowngradePlan,
  onRenewSubscription,
  onExtendSubscription,
  onSuspendSubscription,
  onReactivateSubscription,
  onCancelSubscription,
  onChangeBillingCycle,
  onPurchaseAddOn
}: SubscriptionEntitlementsPanelProps) {
  const entitlements = useMemo(() => getCampaignEntitlements(organization), [organization]);
  const currentPlan = getSubscriptionPlan(organization.plan);
  const [suspendReason, setSuspendReason] = useState("Manual suspension from Subscription & Entitlements dashboard.");
  const [renewDays, setRenewDays] = useState(30);
  const [extendDays, setExtendDays] = useState(7);

  const enabledFeatures = FEATURE_KEYS.filter((key) => entitlements.features[key]);
  const disabledFeatures = FEATURE_KEYS.filter((key) => !entitlements.features[key]);

  const activeCampaigns = getActiveCampaignCount(campaigns);
  const monthlySigners = getMonthlySignerCount(signers);
  const monthlyScans = getMonthlyScanCount(scanItems);

  const nextHigherPlan = subscriptionPlans.find(
    (plan) => plan.name !== organization.plan && plan.name !== "Professional"
  );

  return (
    <>
      <Panel title="Subscription & Entitlements" icon={<ShieldCheck />}>
        <div className="provider-card-grid">
          <div className="provider-readiness-card">
            <ShieldCheck size={22} />
            <span className="eyebrow">Current plan</span>
            <strong>{organization.plan}</strong>
            <small>Status: {entitlements.subscriptionStatus}</small>
          </div>
          <div className="provider-readiness-card">
            <CalendarClock size={22} />
            <span className="eyebrow">Renewal / expiry</span>
            <strong>{formatDate(entitlements.renewsAt)}</strong>
            <small>
              {entitlements.isExpired
                ? "Expired -- renew to restore access."
                : organization.scheduledPlanChange
                  ? `Downgrade to ${organization.scheduledPlanChange.toPlan} scheduled for ${organization.scheduledPlanChange.effectiveAt}`
                  : "No scheduled plan change."}
            </small>
          </div>
          <div className="provider-readiness-card">
            <History size={22} />
            <span className="eyebrow">Audit history</span>
            <strong>{(organization.entitlementAuditLog ?? []).length} events</strong>
            <small>Every plan change is recorded below.</small>
          </div>
        </div>

        <div className="button-row">
          {nextHigherPlan && (
            <button className="primary-button" type="button" onClick={() => onUpgradePlan(nextHigherPlan.name)}>
              <ArrowUpCircle size={16} /> Upgrade to {nextHigherPlan.name}
            </button>
          )}
          <button
            className="secondary-button"
            type="button"
            onClick={() => onDowngradePlan("Starter", "period_end")}
          >
            <ArrowDownCircle size={16} /> Downgrade to Starter (at period end)
          </button>
          <button className="secondary-button" type="button" onClick={() => onRenewSubscription(renewDays)}>
            <RefreshCcw size={16} /> Renew {renewDays} days
          </button>
          <button className="secondary-button" type="button" onClick={() => onExtendSubscription(extendDays)}>
            <Timer size={16} /> Extend {extendDays} days
          </button>
          {entitlements.subscriptionStatus === "Suspended" ? (
            <button className="secondary-button" type="button" onClick={onReactivateSubscription}>
              <PlayCircle size={16} /> Reactivate
            </button>
          ) : (
            <button className="secondary-button" type="button" onClick={() => onSuspendSubscription(suspendReason)}>
              <PauseCircle size={16} /> Suspend
            </button>
          )}
          <button className="secondary-button" type="button" onClick={() => onCancelSubscription(true)}>
            <XCircle size={16} /> Cancel at period end
          </button>
        </div>

        <div className="form-grid">
          <Field label="Renewal period (days)">
            <input
              type="number"
              min="1"
              value={renewDays}
              onChange={(event) => setRenewDays(Math.max(1, Number(event.target.value) || 30))}
            />
          </Field>
          <Field label="Extension (days)">
            <input
              type="number"
              min="1"
              value={extendDays}
              onChange={(event) => setExtendDays(Math.max(1, Number(event.target.value) || 7))}
            />
          </Field>
          <Field label="Suspension reason">
            <input value={suspendReason} onChange={(event) => setSuspendReason(event.target.value)} />
          </Field>
          <Field label="Billing cycle">
            <select
              value={organization.billingCadence ?? "monthly"}
              onChange={(event) => onChangeBillingCycle(event.target.value as BillingCadence)}
            >
              {(["monthly", "quarterly", "yearly", "campaign_duration", "supporter_count", "feature_based", "enterprise_quote"] as BillingCadence[]).map(
                (cadence) => (
                  <option key={cadence} value={cadence}>
                    {cadence}
                  </option>
                )
              )}
            </select>
          </Field>
        </div>
      </Panel>

      <Panel title="Usage & remaining limits" icon={<History />}>
        <div className="usage-grid">
          <UsageCard
            label="Active campaigns"
            value={String(activeCampaigns)}
            detail={currentPlan.campaignLimit === "Unlimited" ? "Unlimited on this plan" : `${currentPlan.campaignLimit} allowed`}
          />
          <UsageCard
            label="Signatures this month"
            value={String(monthlySigners)}
            detail={`${entitlements.limits.signatures} monthly limit (incl. bonus credits)`}
          />
          <UsageCard
            label="Scans this month"
            value={String(monthlyScans)}
            detail={`${entitlements.limits.scans} monthly limit (incl. bonus credits)`}
          />
          <UsageCard label="Operator seats" value={String(entitlements.limits.seats)} detail="Base seats + purchased add-on seats" />
          <UsageCard label="Storage add-on" value={`${entitlements.limits.storageMb} MB`} detail="Purchased storage credits" />
          <UsageCard label="SMS credits" value={String(entitlements.limits.smsCredits)} detail="Purchased SMS credits" />
          <UsageCard label="WhatsApp credits" value={String(entitlements.limits.whatsappCredits)} detail="Purchased WhatsApp credits" />
          <UsageCard label="OCR pages" value={String(entitlements.limits.ocrPages)} detail="Purchased OCR page credits" />
          <UsageCard label="AI credits" value={String(entitlements.limits.aiCredits)} detail="Purchased AI usage credits" />
        </div>
      </Panel>

      <Panel title="Enabled & disabled features" icon={<ShieldCheck />}>
        <div className="feature-gate-grid">
          {enabledFeatures.map((key) => (
            <article className="feature-gate-card unlocked" key={key}>
              <strong>{FEATURE_LABELS[key] ?? key}</strong>
              <p>Enabled for this workspace.</p>
            </article>
          ))}
          {disabledFeatures.map((key) => (
            <article className="feature-gate-card" key={key}>
              <strong>{FEATURE_LABELS[key] ?? key}</strong>
              <p>{entitlements.disabledFeatureReasons[key] ?? "Not available on this plan."}</p>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Purchase add-ons" icon={<ShoppingCart />}>
        <p className="info-message">
          Add-ons are combined with the base plan automatically: Base Plan + Purchased Add-ons = Effective
          Entitlements. No engineering changes are required to purchase or apply one.
        </p>
        <div className="provider-card-grid">
          {ADD_ON_QUICK_BUYS.map((addOn) => (
            <div className="provider-readiness-card" key={addOn.label}>
              <ShoppingCart size={20} />
              <span className="eyebrow">{addOn.label}</span>
              <strong>{addOn.request.priceInr ? `INR ${addOn.request.priceInr}` : "Included"}</strong>
              <button className="secondary-button" type="button" onClick={() => onPurchaseAddOn(addOn.request)}>
                Purchase
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Audit history" icon={<History />}>
        {(organization.entitlementAuditLog ?? []).length === 0 ? (
          <p className="info-message">No subscription/entitlement changes recorded yet.</p>
        ) : (
          <div className="activity-list">
            {(organization.entitlementAuditLog ?? []).slice(0, 25).map((entry) => (
              <div className="activity-card" key={entry.id}>
                <strong>{entry.action}</strong>
                <p>{entry.reason ?? ""}</p>
                <small>
                  {entry.at} by {entry.actor}
                  {entry.fromPlan && entry.toPlan && entry.fromPlan !== entry.toPlan
                    ? ` (${entry.fromPlan} \u2192 ${entry.toPlan})`
                    : ""}
                </small>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
