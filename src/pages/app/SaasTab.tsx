import { Building2, MapPin, Settings, WalletCards } from "lucide-react";
import type {
  BillingPlan,
  CommercialPackage,
  IntegrationSettings,
  LocationGovernanceLevel,
  Organization
} from "../../types";
import type { Campaign, ScanReviewItem, Signer } from "../../types";
import type { LocationDeletions, LocationOverrides, LocationWithPin } from "../../geography";
import { IndiaLocationFields } from "../../components/IndiaLocationFields";
import { subscriptionPlans } from "../../data";
import { Panel } from "../../ui/Panel";
import { Field } from "../../ui/Field";
import { UsageCard } from "../../ui/UsageCard";
import { PlanCard } from "../../ui/PlanCard";
import { SectionTabs } from "../../ui/SectionTabs";
import {
  formatPlanLimit,
  getActiveCampaignCount,
  getEffectiveMessageLimit,
  getEffectiveScanLimit,
  getEffectiveSignatureLimit,
  getMonthlyScanCount,
  getMonthlySignerCount,
  getSubscriptionBlockReason,
  getSubscriptionPlan,
  getSubscriptionStatusDetail
} from "../../utils/subscription";
import { getLocationGovernance, getLocationLevelLabel } from "../../utils/campaign";

type SaasSection = "organization" | "usage" | "packages" | "integrations" | "plans";

interface SaasTabProps {
  saasSection: SaasSection;
  setSaasSection: React.Dispatch<React.SetStateAction<SaasSection>>;
  organization: Organization;
  setOrganization: React.Dispatch<React.SetStateAction<Organization>>;
  campaigns: Campaign[];
  signers: Signer[];
  scanItems: ScanReviewItem[];
  commercialPackages: CommercialPackage[];
  setCommercialPackages: React.Dispatch<React.SetStateAction<CommercialPackage[]>>;
  integrations: IntegrationSettings;
  setIntegrations: React.Dispatch<React.SetStateAction<IntegrationSettings>>;
  locationOverrides: LocationOverrides;
  locationDeletions: LocationDeletions;
  onSelectSubscriptionPlan: (planName: BillingPlan) => void;
  onStartOneDayTrial: () => void;
  onActivateSubscriptionManually: () => void;
  onMarkSubscriptionPastDue: () => void;
  onCancelSubscription: () => void;
  onApplyCommercialPackage: (pkg: CommercialPackage) => void;
  onAuditIntegrationUpdate: () => void;
}

const saasTabs = [
  { id: "organization", label: "Organization" },
  { id: "usage", label: "Usage & subscription" },
  { id: "packages", label: "Recharge packages" },
  { id: "integrations", label: "Integrations" },
  { id: "plans", label: "Plans" }
];

export function SaasTab({
  saasSection,
  setSaasSection,
  organization,
  setOrganization,
  campaigns,
  signers,
  scanItems,
  commercialPackages,
  setCommercialPackages,
  integrations,
  setIntegrations,
  locationOverrides,
  locationDeletions,
  onSelectSubscriptionPlan,
  onStartOneDayTrial,
  onActivateSubscriptionManually,
  onMarkSubscriptionPastDue,
  onCancelSubscription,
  onApplyCommercialPackage,
  onAuditIntegrationUpdate
}: SaasTabProps) {
  const locationGovernance = getLocationGovernance(organization);
  const governanceValues: LocationWithPin = {
    state: locationGovernance.state,
    district: locationGovernance.district,
    block: locationGovernance.block,
    panchayat: locationGovernance.panchayat,
    postalCode: ""
  };

  function updateLocationGovernance(values: LocationWithPin) {
    setOrganization({
      ...organization,
      locationGovernance: {
        ...locationGovernance,
        state: values.state,
        district: values.district,
        block: values.block,
        panchayat: values.panchayat
      }
    });
  }

  return (
    <section className="page-stack">
      <SectionTabs
        tabs={saasTabs}
        activeTab={saasSection}
        onChange={(tab) => setSaasSection(tab as SaasSection)}
      />

      {saasSection === "organization" && (
        <Panel title="Customer organization subscription" icon={<Building2 />}>
          <form className="form-grid">
            <Field label="Organization name">
              <input
                placeholder="Organization or customer name"
                value={organization.name}
                onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
              />
            </Field>
            <Field label="Owner email">
              <input
                type="email"
                placeholder="owner@example.org"
                value={organization.ownerEmail}
                onChange={(e) =>
                  setOrganization({ ...organization, ownerEmail: e.target.value })
                }
              />
            </Field>
            <Field label="Billing email">
              <input
                type="email"
                placeholder="billing@example.org"
                value={organization.billingEmail}
                onChange={(e) =>
                  setOrganization({ ...organization, billingEmail: e.target.value })
                }
              />
            </Field>
            <Field label="Subscription plan">
              <select
                value={organization.plan}
                onChange={(e) => onSelectSubscriptionPlan(e.target.value as BillingPlan)}
              >
                {subscriptionPlans.map((plan) => (
                  <option key={plan.name}>{plan.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Subscription status">
              <select
                value={organization.subscriptionStatus}
                onChange={(e) =>
                  setOrganization({
                    ...organization,
                    subscriptionStatus: e.target.value as Organization["subscriptionStatus"]
                  })
                }
              >
                <option>Trial</option>
                <option>Active</option>
                <option>Past due</option>
                <option>Cancelled</option>
              </select>
            </Field>
            <Field label="Trial ends">
              <input
                type="date"
                value={organization.trialEndsAt}
                onChange={(e) =>
                  setOrganization({ ...organization, trialEndsAt: e.target.value })
                }
              />
            </Field>
            <Field label="Team seats">
              <input
                type="number"
                min="1"
                value={organization.seats}
                onChange={(e) =>
                  setOrganization({ ...organization, seats: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Monthly signature limit">
              <input
                type="number"
                min="0"
                value={organization.monthlySignatureLimit}
                onChange={(e) =>
                  setOrganization({
                    ...organization,
                    monthlySignatureLimit: Number(e.target.value)
                  })
                }
              />
            </Field>
            <Field label="Monthly scan limit">
              <input
                type="number"
                min="0"
                value={organization.monthlyScanLimit}
                onChange={(e) =>
                  setOrganization({
                    ...organization,
                    monthlyScanLimit: Number(e.target.value)
                  })
                }
              />
            </Field>
            <Field label="Monthly message limit">
              <input
                type="number"
                min="0"
                value={organization.monthlyMessageLimit ?? 0}
                onChange={(e) =>
                  setOrganization({
                    ...organization,
                    monthlyMessageLimit: Number(e.target.value)
                  })
                }
              />
            </Field>
            <Field label="Custom domain">
              <input
                placeholder="campaigns.customer.in"
                value={organization.customDomain}
                onChange={(e) =>
                  setOrganization({ ...organization, customDomain: e.target.value })
                }
              />
            </Field>
            <Field label="Payment reference">
              <input
                placeholder="Stripe/customer reference"
                value={organization.paymentReference}
                onChange={(e) =>
                  setOrganization({ ...organization, paymentReference: e.target.value })
                }
              />
            </Field>
            <label className="check-row wide">
              <input
                type="checkbox"
                checked={organization.customBranding}
                onChange={(e) =>
                  setOrganization({ ...organization, customBranding: e.target.checked })
                }
              />
              Enable custom branding for this organization
            </label>
          </form>
        </Panel>
      )}

      {saasSection === "organization" && (
        <Panel title="Geography governance" icon={<MapPin />}>
          <div className="form-grid">
            <IndiaLocationFields
              idPrefix="saas-location-governance"
              values={governanceValues}
              onChange={updateLocationGovernance}
              locationOverrides={locationOverrides}
              locationDeletions={locationDeletions}
            />
            <Field label="Lock level">
              <select
                value={locationGovernance.lockLevel}
                onChange={(event) =>
                  setOrganization({
                    ...organization,
                    locationGovernance: {
                      ...locationGovernance,
                      lockLevel: event.target.value as LocationGovernanceLevel
                    }
                  })
                }
              >
                <option value="none">None</option>
                <option value="state">State</option>
                <option value="district">District</option>
                <option value="block">Block</option>
                <option value="panchayat">Panchayat/Ward</option>
              </select>
            </Field>
            <div className="info-message wide geography-governance-summary">
              <strong>Campaign geography lock: {getLocationLevelLabel(locationGovernance.lockLevel)}</strong>
              <span>
                Campaign admins can only configure campaigns inside the selected geography when
                a lock level is active.
              </span>
            </div>
          </div>
        </Panel>
      )}

      {saasSection === "usage" && (
        <Panel title="Subscription controls and usage" icon={<WalletCards />}>
          <div className="usage-grid">
            <UsageCard
              label="Subscription status"
              value={organization.subscriptionStatus}
              detail={getSubscriptionStatusDetail(organization)}
            />
            <UsageCard
              label="Active campaigns"
              value={`${getActiveCampaignCount(campaigns)} / ${formatPlanLimit(getSubscriptionPlan(organization.plan).campaignLimit)}`}
              detail="Published or paused campaigns counted against plan limit"
            />
            <UsageCard
              label="Monthly signers"
              value={`${getMonthlySignerCount(signers).toLocaleString()} / ${getEffectiveSignatureLimit(organization).toLocaleString()}`}
              detail={`Base ${organization.monthlySignatureLimit.toLocaleString()} + extra ${(organization.bonusSignatureCredits ?? 0).toLocaleString()}`}
            />
            <UsageCard
              label="Monthly scans"
              value={`${getMonthlyScanCount(scanItems).toLocaleString()} / ${getEffectiveScanLimit(organization).toLocaleString()}`}
              detail={`Base ${organization.monthlyScanLimit.toLocaleString()} + extra ${(organization.bonusScanCredits ?? 0).toLocaleString()}`}
            />
            <UsageCard
              label="Message credits"
              value={`${0} / ${getEffectiveMessageLimit(organization).toLocaleString()}`}
              detail={`Base ${(organization.monthlyMessageLimit ?? 0).toLocaleString()} + extra ${(organization.bonusMessageCredits ?? 0).toLocaleString()}`}
            />
          </div>
          <div className="form-grid">
            <Field label="Extra signature credits">
              <input
                type="number"
                min="0"
                value={organization.bonusSignatureCredits ?? 0}
                onChange={(e) =>
                  setOrganization({
                    ...organization,
                    bonusSignatureCredits: Number(e.target.value)
                  })
                }
              />
            </Field>
            <Field label="Extra scan credits">
              <input
                type="number"
                min="0"
                value={organization.bonusScanCredits ?? 0}
                onChange={(e) =>
                  setOrganization({
                    ...organization,
                    bonusScanCredits: Number(e.target.value)
                  })
                }
              />
            </Field>
            <Field label="Extra message credits">
              <input
                type="number"
                min="0"
                value={organization.bonusMessageCredits ?? 0}
                onChange={(e) =>
                  setOrganization({
                    ...organization,
                    bonusMessageCredits: Number(e.target.value)
                  })
                }
              />
            </Field>
          </div>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onStartOneDayTrial}>
              Start 1-day trial
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={onActivateSubscriptionManually}
            >
              Manually activate subscription
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={onMarkSubscriptionPastDue}
            >
              Mark past due
            </button>
            <button className="secondary-button" type="button" onClick={onCancelSubscription}>
              Cancel
            </button>
          </div>
          {getSubscriptionBlockReason(organization) && (
            <p className="error-message">{getSubscriptionBlockReason(organization)}</p>
          )}
        </Panel>
      )}

      {saasSection === "packages" && (
        <Panel title="Recharge packages and pricing controls" icon={<WalletCards />}>
          <div className="package-grid">
            {commercialPackages.map((pkg) => (
              <div className="package-card" key={pkg.id}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={pkg.active}
                    onChange={(e) =>
                      setCommercialPackages((current) =>
                        current.map((item) =>
                          item.id === pkg.id ? { ...item, active: e.target.checked } : item
                        )
                      )
                    }
                  />
                  Active
                </label>
                <Field label="Package name">
                  <input
                    value={pkg.name}
                    onChange={(e) =>
                      setCommercialPackages((current) =>
                        current.map((item) =>
                          item.id === pkg.id ? { ...item, name: e.target.value } : item
                        )
                      )
                    }
                  />
                </Field>
                <Field label="Price INR">
                  <input
                    type="number"
                    min="0"
                    value={pkg.priceInr}
                    onChange={(e) =>
                      setCommercialPackages((current) =>
                        current.map((item) =>
                          item.id === pkg.id
                            ? { ...item, priceInr: Number(e.target.value) }
                            : item
                        )
                      )
                    }
                  />
                </Field>
                <div className="package-credit-row">
                  <span>Signatures: {pkg.signatureCredits.toLocaleString()}</span>
                  <span>Scans: {pkg.scanCredits.toLocaleString()}</span>
                  <span>Messages: {pkg.messageCredits.toLocaleString()}</span>
                </div>
                <p>{pkg.description}</p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onApplyCommercialPackage(pkg)}
                >
                  Grant package credits
                </button>
              </div>
            ))}
          </div>
          <p className="info-message">
            Use these for manual UPI/bank payment operations now. After payment is received, click
            Grant package credits. Later this can connect to Razorpay webhooks automatically.
          </p>
        </Panel>
      )}

      {saasSection === "integrations" && (
        <Panel title="Production integrations" icon={<Settings />}>
          <form className="form-grid">
            <Field label="Razorpay key ID">
              <input
                placeholder="rzp_live_xxxxx"
                value={integrations.razorpayKeyId}
                onChange={(e) =>
                  setIntegrations({ ...integrations, razorpayKeyId: e.target.value })
                }
                onBlur={onAuditIntegrationUpdate}
              />
            </Field>
            <Field label="Razorpay plan/reference">
              <input
                value={integrations.razorpayPlanReference}
                onChange={(e) =>
                  setIntegrations({ ...integrations, razorpayPlanReference: e.target.value })
                }
              />
            </Field>
            <Field label="WhatsApp provider">
              <select
                value={integrations.whatsappProvider}
                onChange={(e) =>
                  setIntegrations({
                    ...integrations,
                    whatsappProvider: e.target.value as IntegrationSettings["whatsappProvider"]
                  })
                }
              >
                {[
                  "Not configured",
                  "Gupshup",
                  "MSG91",
                  "Interakt",
                  "AiSensy",
                  "Twilio",
                  "Airtel IQ"
                ].map((provider) => (
                  <option key={provider}>{provider}</option>
                ))}
              </select>
            </Field>
            <Field label="WhatsApp sender ID">
              <input
                value={integrations.whatsappSenderId}
                onChange={(e) =>
                  setIntegrations({ ...integrations, whatsappSenderId: e.target.value })
                }
              />
            </Field>
            <Field label="SMS provider">
              <select
                value={integrations.smsProvider}
                onChange={(e) =>
                  setIntegrations({
                    ...integrations,
                    smsProvider: e.target.value as IntegrationSettings["smsProvider"]
                  })
                }
              >
                {["Not configured", "MSG91", "Gupshup", "Twilio", "Airtel IQ"].map(
                  (provider) => (
                    <option key={provider}>{provider}</option>
                  )
                )}
              </select>
            </Field>
            <Field label="SMS sender ID">
              <input
                value={integrations.smsSenderId}
                onChange={(e) =>
                  setIntegrations({ ...integrations, smsSenderId: e.target.value })
                }
              />
            </Field>
            <Field label="Email provider">
              <select
                value={integrations.emailProvider}
                onChange={(e) =>
                  setIntegrations({
                    ...integrations,
                    emailProvider: e.target.value as IntegrationSettings["emailProvider"]
                  })
                }
              >
                {["Not configured", "Resend", "SendGrid", "Amazon SES"].map((provider) => (
                  <option key={provider}>{provider}</option>
                ))}
              </select>
            </Field>
            <Field label="Sender email">
              <input
                value={integrations.emailSender}
                onChange={(e) =>
                  setIntegrations({ ...integrations, emailSender: e.target.value })
                }
              />
            </Field>
            <Field label="Storage provider">
              <select
                value={integrations.storageProvider}
                onChange={(e) =>
                  setIntegrations({
                    ...integrations,
                    storageProvider: e.target.value as IntegrationSettings["storageProvider"]
                  })
                }
              >
                {["Supabase Storage", "AWS S3", "Not configured"].map((provider) => (
                  <option key={provider}>{provider}</option>
                ))}
              </select>
            </Field>
            <Field label="Storage bucket">
              <input
                value={integrations.storageBucket}
                onChange={(e) =>
                  setIntegrations({ ...integrations, storageBucket: e.target.value })
                }
              />
            </Field>
            <Field label="Analytics provider">
              <select
                value={integrations.analyticsProvider}
                onChange={(e) =>
                  setIntegrations({
                    ...integrations,
                    analyticsProvider: e.target
                      .value as IntegrationSettings["analyticsProvider"]
                  })
                }
              >
                {["Not configured", "Vercel Analytics", "PostHog", "Plausible"].map(
                  (provider) => (
                    <option key={provider}>{provider}</option>
                  )
                )}
              </select>
            </Field>
            <Field label="Analytics key">
              <input
                value={integrations.analyticsKey}
                onChange={(e) =>
                  setIntegrations({ ...integrations, analyticsKey: e.target.value })
                }
              />
            </Field>
          </form>
          <p className="info-message">
            Store provider secrets in Vercel server-side environment variables. These fields are
            operational references for admins, not a place for private API secrets.
          </p>
        </Panel>
      )}

      {saasSection === "plans" && (
        <div className="plan-grid">
          {subscriptionPlans.map((plan) => (
            <PlanCard
              key={plan.name}
              title={plan.name}
              price={plan.price}
              features={[
                `${plan.campaignLimit} campaign${plan.campaignLimit === 1 ? "" : "s"}`,
                `${plan.monthlySignatureLimit.toLocaleString()} signatures/month`,
                `${plan.monthlyScanLimit.toLocaleString()} scans/month`,
                ...plan.features
              ]}
              highlighted={organization.plan === plan.name}
              actionLabel={organization.plan === plan.name ? "Selected" : `Select ${plan.name}`}
              onSelect={() => onSelectSubscriptionPlan(plan.name)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
