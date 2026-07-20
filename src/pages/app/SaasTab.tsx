import {
  Bot,
  Building2,
  CreditCard,
  DatabaseBackup,
  Download,
  FlaskConical,
  HardDrive,
  Image as ImageIcon,
  LockKeyhole,
  Mail,
  MapPin,
  MessageSquare,
  PhoneCall,
  ShieldCheck,
  Settings,
  UsersRound,
  WalletCards
} from "lucide-react";
import { useState } from "react";
import type {
  BillingCadence,
  BillingPlan,
  CommercialPackage,
  IntegrationSettings,
  LocationGovernanceLevel,
  Organization,
  PrepaidWalletMode
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
  calculateSubscriptionEstimate,
  createProviderReadySignaturePin,
  formatInr,
  formatPlanLimit,
  getActiveCampaignCount,
  getEffectiveMessageLimit,
  getEffectiveScanLimit,
  getEffectiveSignatureLimit,
  getMonthlyScanCount,
  getMonthlySignerCount,
  getSignatureWalletCapacity,
  getSubscriptionBlockReason,
  getSubscriptionPlan,
  getSubscriptionStatusDetail,
  getTrialCountdownLabel,
  isFeatureIncludedInPlan,
  pricingFeatureCatalog
} from "../../utils/subscription";
import { getLocationGovernance } from "../../utils/campaign";
import { useTranslation } from "../../i18n/useTranslation";
import { SubscriptionEntitlementsPanel } from "./SubscriptionEntitlementsPanel";
import type { AddOnPurchaseRequest } from "../../entitlements";

type SaasSection = "organization" | "usage" | "packages" | "integrations" | "plans" | "entitlements";

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
  onUpgradeSubscriptionPlan: (planName: BillingPlan) => void;
  onDowngradeSubscriptionPlan: (planName: BillingPlan, effective?: "immediately" | "period_end") => void;
  onRenewSubscriptionPeriod: (periodDays: number) => void;
  onExtendSubscriptionPeriod: (extraDays: number) => void;
  onSuspendSubscriptionWithReason: (reason: string) => void;
  onReactivateSuspendedSubscription: () => void;
  onCancelSubscriptionLifecycle: (atPeriodEnd: boolean) => void;
  onChangeSubscriptionBillingCycle: (cadence: BillingCadence) => void;
  onPurchaseEntitlementAddOn: (request: AddOnPurchaseRequest) => void;
  onAuditIntegrationUpdate: () => void;
}

type ProviderStatus = "Not configured" | "Test mode" | "Ready" | "Error";

const providerStatuses: ProviderStatus[] = ["Not configured", "Test mode", "Ready", "Error"];

const aiProviderOptions = ["OpenAI", "Gemini", "Claude", "Azure OpenAI", "OpenRouter", "Local LLM"];

const messagingProviderCards = [
  { name: "SMS", icon: MessageSquare, detailKey: "integrations.messaging.sms" },
  { name: "WhatsApp Business", icon: PhoneCall, detailKey: "integrations.messaging.whatsapp" },
  { name: "Email", icon: Mail, detailKey: "integrations.messaging.email" },
  { name: "IVR", icon: PhoneCall, detailKey: "integrations.messaging.ivr" }
];

const paymentProviderCards = [
  { name: "Razorpay", detailKey: "integrations.payments.razorpay" },
  { name: "Stripe", detailKey: "integrations.payments.stripe" },
  { name: "PayU", detailKey: "integrations.payments.payu" },
  { name: "UPI", detailKey: "integrations.payments.upi" },
  { name: "Cards", detailKey: "integrations.payments.cards" },
  { name: "NetBanking", detailKey: "integrations.payments.netbanking" },
  { name: "Wallets", detailKey: "integrations.payments.wallets" }
];

const billingCadenceOptions: Array<{ value: BillingCadence; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "campaign_duration", label: "Campaign duration based" },
  { value: "supporter_count", label: "Supporter count based" },
  { value: "feature_based", label: "Feature based" },
  { value: "enterprise_quote", label: "Custom enterprise quote" }
];

const prepaidWalletModes: Array<{ value: PrepaidWalletMode; label: string }> = [
  { value: "online_payment", label: "Online payment" },
  { value: "cash", label: "Cash collection" },
  { value: "donation", label: "Donation credit" },
  { value: "manual", label: "Manual admin credit" }
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
  onUpgradeSubscriptionPlan,
  onDowngradeSubscriptionPlan,
  onRenewSubscriptionPeriod,
  onExtendSubscriptionPeriod,
  onSuspendSubscriptionWithReason,
  onReactivateSuspendedSubscription,
  onCancelSubscriptionLifecycle,
  onChangeSubscriptionBillingCycle,
  onPurchaseEntitlementAddOn,
  onAuditIntegrationUpdate
}: SaasTabProps) {
  const { t } = useTranslation();
  const saasTabs = [
    { id: "organization", label: t("settings.tabs.organization") },
    { id: "usage", label: t("settings.tabs.usage") },
    { id: "packages", label: t("settings.tabs.packages") },
    { id: "integrations", label: t("settings.tabs.integrations") },
    { id: "plans", label: t("settings.tabs.pricing") },
    { id: "entitlements", label: "Subscription & Entitlements" }
  ];
  const [providerStatusByName, setProviderStatusByName] = useState<Record<string, ProviderStatus>>({});
  const [providerTestMessage, setProviderTestMessage] = useState("");
  const locationGovernance = getLocationGovernance(organization);
  const governanceValues: LocationWithPin = {
    state: locationGovernance.state,
    district: locationGovernance.district,
    block: locationGovernance.block,
    panchayat: locationGovernance.panchayat,
    postalCode: ""
  };
  const currentPlan = getSubscriptionPlan(organization.plan);
  const pricingEstimate = calculateSubscriptionEstimate(organization);
  const enabledFeatureKeys = new Set(organization.enabledFeatureKeys ?? []);
  const walletCapacity = getSignatureWalletCapacity(organization);
  const activeMonthlySigners = getMonthlySignerCount(signers);
  const invoiceReference =
    organization.paymentReference ||
    `${organization.id.toUpperCase()}-${new Date().toISOString().slice(0, 7)}`;

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

  function getProviderStatus(providerName: string): ProviderStatus {
    return providerStatusByName[providerName] ?? "Not configured";
  }

  function updateProviderStatus(providerName: string, status: ProviderStatus) {
    setProviderStatusByName((current) => ({ ...current, [providerName]: status }));
  }

  function testProviderConnection(providerName: string) {
    setProviderTestMessage(`${providerName}: ${t("integrations.testMessage")}`);
  }

  function updateFeatureAddOn(featureKey: string, enabled: boolean) {
    const next = new Set(organization.enabledFeatureKeys ?? []);
    if (enabled) next.add(featureKey);
    else next.delete(featureKey);
    setOrganization({
      ...organization,
      enabledFeatureKeys: Array.from(next)
    });
  }

  function generateSignatureWalletPin() {
    setOrganization({
      ...organization,
      lastSignaturePin: createProviderReadySignaturePin(organization.signaturePinPrefix ?? "VUP")
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
        <Panel title={t("organization.subscriptionTitle")} icon={<Building2 />}>
          <form className="form-grid">
            <Field label={t("organization.name")}>
              <input
                placeholder={t("organization.namePlaceholder")}
                value={organization.name}
                onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
              />
            </Field>
            <Field label={t("organization.ownerEmail")}>
              <input
                type="email"
                placeholder="owner@example.org"
                value={organization.ownerEmail}
                onChange={(e) =>
                  setOrganization({ ...organization, ownerEmail: e.target.value })
                }
              />
            </Field>
            <Field label={t("organization.billingEmail")}>
              <input
                type="email"
                placeholder="billing@example.org"
                value={organization.billingEmail}
                onChange={(e) =>
                  setOrganization({ ...organization, billingEmail: e.target.value })
                }
              />
            </Field>
            <Field label={t("organization.subscriptionPlan")}>
              <select
                value={currentPlan.name}
                onChange={(e) => onSelectSubscriptionPlan(e.target.value as BillingPlan)}
              >
                {subscriptionPlans.map((plan) => (
                  <option key={plan.name} value={plan.name}>{plan.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t("organization.subscriptionStatus")}>
              <select
                value={organization.subscriptionStatus}
                onChange={(e) =>
                  setOrganization({
                    ...organization,
                    subscriptionStatus: e.target.value as Organization["subscriptionStatus"]
                  })
                }
              >
                <option value="Trial">{t("organization.status.trial")}</option>
                <option value="Active">{t("organization.status.active")}</option>
                <option value="Past due">{t("organization.status.pastDue")}</option>
                <option value="Cancelled">{t("organization.status.cancelled")}</option>
              </select>
            </Field>
            <Field label={t("organization.trialEnds")}>
              <input
                type="date"
                value={organization.trialEndsAt}
                onChange={(e) =>
                  setOrganization({ ...organization, trialEndsAt: e.target.value })
                }
              />
            </Field>
            <Field label={t("organization.teamSeats")}>
              <input
                type="number"
                min="1"
                value={organization.seats}
                onChange={(e) =>
                  setOrganization({ ...organization, seats: Number(e.target.value) })
                }
              />
            </Field>
            <Field label={t("organization.monthlySignatureLimit")}>
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
            <Field label={t("organization.monthlyScanLimit")}>
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
            <Field label={t("organization.monthlyMessageLimit")}>
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
            <Field label={t("organization.customDomain")}>
              <input
                placeholder="campaigns.customer.in"
                value={organization.customDomain}
                onChange={(e) =>
                  setOrganization({ ...organization, customDomain: e.target.value })
                }
              />
            </Field>
            <Field label={t("organization.paymentReference")}>
              <input
                placeholder={t("organization.paymentReferencePlaceholder")}
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
              {t("organization.enableCustomBranding")}
            </label>
          </form>
        </Panel>
      )}

      {saasSection === "organization" && (
        <Panel title={t("organization.locationGovernance")} icon={<MapPin />}>
          <div className="form-grid">
            <IndiaLocationFields
              idPrefix="saas-location-governance"
              values={governanceValues}
              onChange={updateLocationGovernance}
              locationOverrides={locationOverrides}
              locationDeletions={locationDeletions}
            />
            <Field label={t("organization.lockLevel")}>
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
                <option value="none">{t("organization.location.none")}</option>
                <option value="state">{t("organization.location.state")}</option>
                <option value="district">{t("organization.location.district")}</option>
                <option value="block">{t("organization.location.block")}</option>
                <option value="panchayat">{t("organization.location.panchayat")}</option>
              </select>
            </Field>
            <div className="info-message wide geography-governance-summary">
              <strong>{t("organization.locationLock")}: {t(`organization.location.${locationGovernance.lockLevel}`)}</strong>
              <span>
                {t("organization.locationLockHelp")}
              </span>
            </div>
          </div>
        </Panel>
      )}

      {saasSection === "organization" && (
        <Panel title={t("workspace.organizationWorkspace")} icon={<ShieldCheck />}>
          <div className="workspace-grid">
            <div className="workspace-card">
              <Building2 size={22} />
              <span className="eyebrow">{t("workspace.profile")}</span>
              <strong>{organization.name || t("workspace.unnamed")}</strong>
              <p>{organization.ownerEmail || t("workspace.addOwnerEmail")} - {organization.seats} {t("workspace.seats")}</p>
            </div>
            <div className="workspace-card branding-preview">
              <ImageIcon size={22} />
              <span className="eyebrow">{t("workspace.brandingSettings")}</span>
              <strong>{t(organization.customBranding ? "workspace.customBrandingEnabled" : "workspace.defaultBranding")}</strong>
              <p>{t("workspace.brandingHelp")}</p>
            </div>
            <div className="workspace-card">
              <UsersRound size={22} />
              <span className="eyebrow">{t("workspace.rolesPermissions")}</span>
              <strong>{t("workspace.availableAfterSetup")}</strong>
              <p>{t("workspace.rolesHelp")}</p>
            </div>
            <div className="workspace-card">
              <UsersRound size={22} />
              <span className="eyebrow">{t("workspace.teamMembers")}</span>
              <strong>{organization.seats.toLocaleString()} {t("workspace.seatCapacity")}</strong>
              <p>{t("workspace.teamHelp")}</p>
            </div>
            <div className="workspace-card">
              <ShieldCheck size={22} />
              <span className="eyebrow">{t("workspace.auditLog")}</span>
              <strong>{t("workspace.availableInActivity")}</strong>
              <p>{t("workspace.auditHelp")}</p>
            </div>
            <div className="workspace-card">
              <WalletCards size={22} />
              <span className="eyebrow">{t("workspace.billingReadiness")}</span>
              <strong>{organization.subscriptionStatus}</strong>
              <p>{t("workspace.billingHelp")}</p>
            </div>
          </div>
          <div className="white-label-readiness">
            <span className="eyebrow">{t("workspace.whiteLabelReadiness")}</span>
            <div className="guided-checklist">
              {[
                ["workspace.customDomain", Boolean(organization.customDomain)],
                ["workspace.customBranding", organization.customBranding],
                ["workspace.ownerEmail", Boolean(organization.ownerEmail)],
                ["workspace.locationGovernance", Boolean(organization.locationGovernance?.lockLevel && organization.locationGovernance.lockLevel !== "none")],
                ["workspace.subscriptionActive", organization.subscriptionStatus === "Active"]
              ].map(([labelKey, ready]) => (
                <div className={ready ? "ready" : ""} key={String(labelKey)}>
                  <ShieldCheck size={18} />
                  <span>{t(String(labelKey))}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {saasSection === "organization" && (
        <Panel title={t("workspace.management")} icon={<Building2 />}>
          <div className="workspace-management-hero">
            <div>
              <span className="eyebrow">{t("workspace.profile")}</span>
              <h3>{organization.name || t("workspace.unnamed")}</h3>
              <p>{t("workspace.managementHelp")}</p>
            </div>
            <div className="workspace-brand-preview">
              <div className="workspace-logo-preview">
                {(organization.name || "V").slice(0, 1).toUpperCase()}
              </div>
              <strong>{t(organization.customBranding ? "workspace.customBrandReady" : "workspace.defaultBrand")}</strong>
              <small>{organization.customDomain || t("workspace.noCustomDomain")}</small>
            </div>
          </div>

          <div className="workspace-management-grid">
            <article className="workspace-management-card">
              <ImageIcon size={22} />
              <span className="eyebrow">{t("workspace.logoBannerPreview")}</span>
              <strong>{organization.name || t("workspace.voiceupWorkspace")}</strong>
              <div className="workspace-banner-preview">
                <span>{t(organization.customBranding ? "workspace.customBrandingEnabled" : "workspace.defaultBanner")}</span>
              </div>
              <p>{t("workspace.logoHelp")}</p>
            </article>
            <article className="workspace-management-card">
              <UsersRound size={22} />
              <span className="eyebrow">{t("workspace.teamMembers")}</span>
              <strong>{organization.seats.toLocaleString()} {t("workspace.seatCapacity")}</strong>
              <p>{t("workspace.memberActionsHelp")}</p>
              <div className="workspace-chip-row">
                <span>{t("workspace.roles.owner")}</span>
                <span>{t("workspace.roles.admin")}</span>
                <span>{t("workspace.roles.reviewer")}</span>
              </div>
            </article>
            <article className="workspace-management-card">
              <ShieldCheck size={22} />
              <span className="eyebrow">{t("workspace.rolesPermissions")}</span>
              <strong>{t("workspace.setupMatrix")}</strong>
              <p>{t("workspace.rolesMatrixHelp")}</p>
              <div className="workspace-chip-row">
                <span>{t("workspace.permissions.create")}</span>
                <span>{t("workspace.permissions.review")}</span>
                <span>{t("workspace.permissions.publish")}</span>
                <span>{t("workspace.permissions.export")}</span>
              </div>
            </article>
            <article className="workspace-management-card">
              <ShieldCheck size={22} />
              <span className="eyebrow">{t("workspace.auditPlaceholder")}</span>
              <strong>{t("workspace.activityConnected")}</strong>
              <p>{t("workspace.futureFilters")}</p>
            </article>
            <article className="workspace-management-card">
              <WalletCards size={22} />
              <span className="eyebrow">{t("workspace.billingSubscription")}</span>
              <strong>{organization.plan} - {organization.subscriptionStatus}</strong>
              <p>{t("workspace.billingTabsHelp")}</p>
            </article>
            <article className="workspace-management-card">
              <LockKeyhole size={22} />
              <span className="eyebrow">{t("workspace.whiteLabelReadiness")}</span>
              <strong>
                {[
                  Boolean(organization.customDomain),
                  organization.customBranding,
                  Boolean(organization.ownerEmail),
                  organization.subscriptionStatus === "Active"
                ].filter(Boolean).length} / 4 {t("workspace.ready")}
              </strong>
              <p>{t("workspace.whiteLabelHelp")}</p>
            </article>
          </div>
        </Panel>
      )}

      {saasSection === "organization" && (
        <Panel title={t("workspace.safetyPrivacyBackup")} icon={<LockKeyhole />}>
          <div className="workspace-grid">
            <div className="workspace-card">
              <Download size={22} />
              <span className="eyebrow">{t("workspace.export")}</span>
              <strong>{t("workspace.availableAfterSetup")}</strong>
              <p>{t("workspace.exportHelp")}</p>
            </div>
            <div className="workspace-card">
              <DatabaseBackup size={22} />
              <span className="eyebrow">{t("workspace.recoveryPosture")}</span>
              <strong>{campaigns.length.toLocaleString()} {t("workspace.campaignsTracked")}</strong>
              <p>{t("workspace.recoveryHelp")}</p>
            </div>
            <div className="workspace-card">
              <ShieldCheck size={22} />
              <span className="eyebrow">{t("workspace.consentCoverage")}</span>
              <strong>
                {campaigns.filter((campaign) => campaign.consentText?.trim()).length.toLocaleString()} / {campaigns.length.toLocaleString()}
              </strong>
              <p>{t("workspace.consentHelp")}</p>
            </div>
            <div className="workspace-card">
              <LockKeyhole size={22} />
              <span className="eyebrow">{t("workspace.privacySettings")}</span>
              <strong>{t("workspace.uiFoundation")}</strong>
              <p>{t("workspace.privacyHelp")}</p>
            </div>
          </div>
          <div className="privacy-readiness-list">
            {[
              ["workspace.privacy.explicitConsent", campaigns.some((campaign) => campaign.consentText?.trim())],
              ["workspace.privacy.reviewConsent", true],
              ["workspace.privacy.exportConnected", false],
              ["workspace.privacy.retentionConnected", false]
            ].map(([labelKey, ready]) => (
              <div className={ready ? "ready" : ""} key={String(labelKey)}>
                <ShieldCheck size={18} />
                <span>{t(String(labelKey))}</span>
                <strong>{t(ready ? "workspace.ready" : "workspace.availableAfterSetup")}</strong>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {saasSection === "usage" && (
        <Panel title={t("settings.usage.title")} icon={<WalletCards />}>
          <div className="usage-grid">
            <UsageCard
              label={t("organization.subscriptionStatus")}
              value={organization.subscriptionStatus}
              detail={getSubscriptionStatusDetail(organization)}
            />
            <UsageCard
              label={t("settings.usage.activeCampaigns")}
              value={`${getActiveCampaignCount(campaigns)} / ${formatPlanLimit(currentPlan.campaignLimit)}`}
              detail={t("settings.usage.activeCampaignsHelp")}
            />
            <UsageCard
              label={t("settings.usage.monthlySigners")}
              value={`${getMonthlySignerCount(signers).toLocaleString()} / ${getEffectiveSignatureLimit(organization).toLocaleString()}`}
              detail={`${t("settings.usage.base")} ${organization.monthlySignatureLimit.toLocaleString()} + ${t("settings.usage.extra")} ${(organization.bonusSignatureCredits ?? 0).toLocaleString()}`}
            />
            <UsageCard
              label={t("settings.usage.monthlyScans")}
              value={`${getMonthlyScanCount(scanItems).toLocaleString()} / ${getEffectiveScanLimit(organization).toLocaleString()}`}
              detail={`${t("settings.usage.base")} ${organization.monthlyScanLimit.toLocaleString()} + ${t("settings.usage.extra")} ${(organization.bonusScanCredits ?? 0).toLocaleString()}`}
            />
            <UsageCard
              label={t("settings.usage.messageCredits")}
              value={`${0} / ${getEffectiveMessageLimit(organization).toLocaleString()}`}
              detail={`${t("settings.usage.base")} ${(organization.monthlyMessageLimit ?? 0).toLocaleString()} + ${t("settings.usage.extra")} ${(organization.bonusMessageCredits ?? 0).toLocaleString()}`}
            />
          </div>
          <div className="subscription-status-grid">
            <div className="subscription-status-card">
              <ShieldCheck size={22} />
              <span className="eyebrow">{t("settings.usage.currentPlan")}</span>
              <strong>{currentPlan.name}</strong>
              <p>{currentPlan.description ?? t("settings.usage.planDetailsReady")}</p>
              <small>{organization.subscriptionStatus === "Trial" ? getTrialCountdownLabel(organization) : getSubscriptionStatusDetail(organization)}</small>
            </div>
            <div className="subscription-status-card">
              <WalletCards size={22} />
              <span className="eyebrow">{t("settings.packages.wallet")}</span>
              <strong>{walletCapacity.toLocaleString()} {t("settings.usage.signCapacity")}</strong>
              <p>
                {organization.prepaidWalletEnabled
                  ? `${formatInr(organization.signatureWalletBalanceInr ?? 0)} ${t("settings.usage.balanceAt")} ${formatInr(organization.signaturePriceInr ?? currentPlan.pricePerSignatureInr ?? 1)} ${t("settings.usage.perSign")}.`
                  : t("settings.usage.walletDisabled")}
              </p>
              <small>{t("settings.usage.noSignerCharge")}</small>
            </div>
            <div className="subscription-status-card">
              <CreditCard size={22} />
              <span className="eyebrow">{t("settings.usage.invoicePlaceholder")}</span>
              <strong>{invoiceReference}</strong>
              <p>{pricingEstimate.label}</p>
              <small>{t("settings.usage.draftInvoice")}</small>
            </div>
          </div>
          <div className="form-grid">
            <Field label={t("settings.usage.extraSignatureCredits")}>
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
            <Field label={t("settings.usage.extraScanCredits")}>
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
            <Field label={t("settings.usage.extraMessageCredits")}>
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
              {t("settings.usage.startTrial")}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={onActivateSubscriptionManually}
            >
              {t("settings.usage.activateManually")}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={onMarkSubscriptionPastDue}
            >
              {t("settings.usage.markPastDue")}
            </button>
            <button className="secondary-button" type="button" onClick={onCancelSubscription}>
              {t("common.cancel")}
            </button>
          </div>
          {getSubscriptionBlockReason(organization) && (
            <p className="error-message">{getSubscriptionBlockReason(organization)}</p>
          )}
        </Panel>
      )}

      {saasSection === "packages" && (
        <Panel title={t("settings.packages.title")} icon={<WalletCards />}>
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
                  {t("settings.packages.active")}
                </label>
                <Field label={t("settings.packages.packageName")}>
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
                <Field label={t("settings.packages.priceInr")}>
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
                  <span>{t("settings.packages.signatures")}: {pkg.signatureCredits.toLocaleString()}</span>
                  <span>{t("settings.packages.scans")}: {pkg.scanCredits.toLocaleString()}</span>
                  <span>{t("settings.packages.messages")}: {pkg.messageCredits.toLocaleString()}</span>
                </div>
                <p>{pkg.description}</p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onApplyCommercialPackage(pkg)}
                >
                  {t("settings.packages.grantCredits")}
                </button>
              </div>
            ))}
          </div>
          <p className="info-message">
            {t("settings.packages.manualPaymentHelp")}
          </p>
          <div className="wallet-config-panel">
            <div>
              <span className="eyebrow">{t("settings.packages.wallet")}</span>
              <h3>{t("settings.packages.configurablePrice")}</h3>
              <p>{t("settings.packages.walletHelp")}</p>
            </div>
            <div className="form-grid">
              <label className="check-row wide">
                <input
                  type="checkbox"
                  checked={organization.prepaidWalletEnabled ?? false}
                  onChange={(e) =>
                    setOrganization({ ...organization, prepaidWalletEnabled: e.target.checked })
                  }
                />
                {t("settings.packages.enableWallet")}
              </label>
              <Field label={t("settings.packages.collectionMode")}>
                <select
                  value={organization.prepaidWalletMode ?? "online_payment"}
                  onChange={(e) =>
                    setOrganization({
                      ...organization,
                      prepaidWalletMode: e.target.value as PrepaidWalletMode
                    })
                  }
                >
                  {prepaidWalletModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>{t(`settings.packages.modes.${mode.value}`)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("settings.packages.pricePerSign")}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={organization.signaturePriceInr ?? currentPlan.pricePerSignatureInr ?? 1}
                  onChange={(e) =>
                    setOrganization({ ...organization, signaturePriceInr: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label={t("settings.packages.walletBalance")}>
                <input
                  type="number"
                  min="0"
                  value={organization.signatureWalletBalanceInr ?? 0}
                  onChange={(e) =>
                    setOrganization({ ...organization, signatureWalletBalanceInr: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label={t("settings.packages.pinPrefix")}>
                <input
                  value={organization.signaturePinPrefix ?? "VUP"}
                  onChange={(e) =>
                    setOrganization({ ...organization, signaturePinPrefix: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="wallet-summary-grid">
              <div>
                <span className="eyebrow">{t("settings.packages.estimatedSigns")}</span>
                <strong>{walletCapacity.toLocaleString()}</strong>
                <small>{t("settings.packages.balanceHelp")}</small>
              </div>
              <div>
                <span className="eyebrow">{t("settings.packages.lastPin")}</span>
                <strong>{organization.lastSignaturePin ?? t("settings.packages.notGenerated")}</strong>
                <small>{t("settings.packages.pinHelp")}</small>
              </div>
              <button className="secondary-button" type="button" onClick={generateSignatureWalletPin}>
                {t("settings.packages.generatePin")}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {saasSection === "integrations" && (
        <Panel title={t("integrations.title")} icon={<Settings />}>
          <div className="integration-readiness-hero">
            <div>
              <span className="eyebrow">{t("integrations.readiness")}</span>
              <h3>{t("integrations.configureSafely")}</h3>
              <p>{t("integrations.intro")}</p>
            </div>
            <div className="integration-status-card">
              <ShieldCheck size={22} />
              <span>{t("integrations.defaultMode")}</span>
              <strong>{t("integrations.status.disabled")}</strong>
              <small>{t("integrations.noRequests")}</small>
            </div>
          </div>

          <div className="provider-readiness-section">
            <div className="provider-section-heading">
              <Bot size={22} />
              <div>
                <h4>{t("integrations.aiTitle")}</h4>
                <p>{t("integrations.aiHelp")}</p>
              </div>
            </div>
            <div className="provider-card-grid">
              {aiProviderOptions.map((provider) => (
                <div className="provider-readiness-card" key={provider}>
                  <span className="eyebrow">{provider}</span>
                  <strong>{t(`integrations.status.${getProviderStatus(provider).replace(/\s/g, "").toLowerCase()}`)}</strong>
                  <label>
                    {t("integrations.providerStatus")}
                    <select
                      value={getProviderStatus(provider)}
                      onChange={(e) => updateProviderStatus(provider, e.target.value as ProviderStatus)}
                    >
                      {providerStatuses.map((status) => <option key={status} value={status}>{t(`integrations.status.${status.replace(/\s/g, "").toLowerCase()}`)}</option>)}
                    </select>
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => testProviderConnection(provider)}
                  >
                    <FlaskConical size={16} /> {t("integrations.testConnection")}
                  </button>
                  <small>{t("integrations.apiKeysHelp")}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="provider-readiness-section">
            <div className="provider-section-heading">
              <MessageSquare size={22} />
              <div>
                <h4>{t("integrations.messagingTitle")}</h4>
                <p>{t("integrations.messagingHelp")}</p>
              </div>
            </div>
            <div className="provider-card-grid">
              {messagingProviderCards.map(({ name, icon: Icon, detailKey }) => (
                <div className="provider-readiness-card" key={name}>
                  <Icon size={22} />
                  <span className="eyebrow">{name}</span>
                  <strong>{t(`integrations.status.${getProviderStatus(name).replace(/\s/g, "").toLowerCase()}`)}</strong>
                  <label>
                    {t("integrations.providerStatus")}
                    <select
                      value={getProviderStatus(name)}
                      onChange={(e) => updateProviderStatus(name, e.target.value as ProviderStatus)}
                    >
                      {providerStatuses.map((status) => <option key={status} value={status}>{t(`integrations.status.${status.replace(/\s/g, "").toLowerCase()}`)}</option>)}
                    </select>
                  </label>
                  <button className="secondary-button" type="button" onClick={() => testProviderConnection(name)}>
                    <FlaskConical size={16} /> {t("integrations.testConnection")}
                  </button>
                  <small>{t(detailKey)}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="provider-readiness-section">
            <div className="provider-section-heading">
              <CreditCard size={22} />
              <div>
                <h4>{t("integrations.paymentTitle")}</h4>
                <p>{t("integrations.paymentHelp")}</p>
              </div>
            </div>
            <div className="provider-card-grid">
              {paymentProviderCards.map((provider) => (
                <div className="provider-readiness-card" key={provider.name}>
                  <CreditCard size={22} />
                  <span className="eyebrow">{provider.name}</span>
                  <strong>{t(`integrations.status.${getProviderStatus(provider.name).replace(/\s/g, "").toLowerCase()}`)}</strong>
                  <label>
                    {t("integrations.providerStatus")}
                    <select
                      value={getProviderStatus(provider.name)}
                      onChange={(e) => updateProviderStatus(provider.name, e.target.value as ProviderStatus)}
                    >
                      {providerStatuses.map((status) => <option key={status} value={status}>{t(`integrations.status.${status.replace(/\s/g, "").toLowerCase()}`)}</option>)}
                    </select>
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => testProviderConnection(provider.name)}
                  >
                    <FlaskConical size={16} /> {t("integrations.testConnection")}
                  </button>
                  <small>{t(provider.detailKey)} {t("integrations.noPaymentRequest")}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="provider-card-grid">
            {[
              {
                name: "Payment and donation",
                label: t("integrations.cards.paymentDonation"),
                icon: CreditCard,
                status: integrations.razorpayKeyId ? "Test mode" : "Not configured",
                detail: t("integrations.cards.paymentDonationHelp")
              },
              {
                name: "File storage",
                label: t("integrations.cards.fileStorage"),
                icon: HardDrive,
                status: integrations.storageProvider === "Not configured" ? "Not configured" : "Test mode",
                detail: t("integrations.cards.fileStorageHelp")
              },
              {
                name: "Compliance guardrails",
                label: t("integrations.cards.compliance"),
                icon: LockKeyhole,
                status: "Ready",
                detail: t("integrations.cards.complianceHelp")
              }
            ].map(({ name, label, icon: Icon, status, detail }) => (
              <div className="provider-readiness-card" key={name}>
                <Icon size={22} />
                <span className="eyebrow">{label}</span>
                <strong>{t(`integrations.status.${status.replace(/\s/g, "").toLowerCase()}`)}</strong>
                <button className="secondary-button" type="button" onClick={() => testProviderConnection(name)}>
                  <FlaskConical size={16} /> {t("integrations.testConnection")}
                </button>
                <small>{detail}</small>
              </div>
            ))}
          </div>

          {providerTestMessage && <p className="info-message">{providerTestMessage}</p>}

          <div className="consent-compliance-card">
            <LockKeyhole size={22} />
            <div>
              <strong>{t("integrations.consentReminder")}</strong>
              <p>{t("integrations.consentHelp")}</p>
            </div>
          </div>

          <form className="form-grid">
            <Field label={t("integrations.fields.razorpayKey")}>
              <input
                placeholder="rzp_live_xxxxx"
                value={integrations.razorpayKeyId}
                onChange={(e) =>
                  setIntegrations({ ...integrations, razorpayKeyId: e.target.value })
                }
                onBlur={onAuditIntegrationUpdate}
              />
            </Field>
            <Field label={t("integrations.fields.razorpayReference")}>
              <input
                value={integrations.razorpayPlanReference}
                onChange={(e) =>
                  setIntegrations({ ...integrations, razorpayPlanReference: e.target.value })
                }
              />
            </Field>
            <Field label={t("integrations.fields.whatsappProvider")}>
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
                  <option key={provider} value={provider}>{provider === "Not configured" ? t("integrations.status.notconfigured") : provider}</option>
                ))}
              </select>
            </Field>
            <Field label={t("integrations.fields.whatsappSender")}>
              <input
                value={integrations.whatsappSenderId}
                onChange={(e) =>
                  setIntegrations({ ...integrations, whatsappSenderId: e.target.value })
                }
              />
            </Field>
            <Field label={t("integrations.fields.smsProvider")}>
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
                    <option key={provider} value={provider}>{provider === "Not configured" ? t("integrations.status.notconfigured") : provider}</option>
                  )
                )}
              </select>
            </Field>
            <Field label={t("integrations.fields.smsSender")}>
              <input
                value={integrations.smsSenderId}
                onChange={(e) =>
                  setIntegrations({ ...integrations, smsSenderId: e.target.value })
                }
              />
            </Field>
            <Field label={t("integrations.fields.emailProvider")}>
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
                  <option key={provider} value={provider}>{provider === "Not configured" ? t("integrations.status.notconfigured") : provider}</option>
                ))}
              </select>
            </Field>
            <Field label={t("integrations.fields.senderEmail")}>
              <input
                value={integrations.emailSender}
                onChange={(e) =>
                  setIntegrations({ ...integrations, emailSender: e.target.value })
                }
              />
            </Field>
            <Field label={t("integrations.fields.storageProvider")}>
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
                  <option key={provider} value={provider}>{provider === "Not configured" ? t("integrations.status.notconfigured") : provider}</option>
                ))}
              </select>
            </Field>
            <Field label={t("integrations.fields.storageBucket")}>
              <input
                value={integrations.storageBucket}
                onChange={(e) =>
                  setIntegrations({ ...integrations, storageBucket: e.target.value })
                }
              />
            </Field>
            <Field label={t("integrations.fields.analyticsProvider")}>
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
                    <option key={provider} value={provider}>{provider === "Not configured" ? t("integrations.status.notconfigured") : provider}</option>
                  )
                )}
              </select>
            </Field>
            <Field label={t("integrations.fields.analyticsKey")}>
              <input
                value={integrations.analyticsKey}
                onChange={(e) =>
                  setIntegrations({ ...integrations, analyticsKey: e.target.value })
                }
              />
            </Field>
          </form>
          <p className="info-message">
            {t("integrations.secretsHelp")}
          </p>
        </Panel>
      )}

      {saasSection === "plans" && (
        <>
          <Panel title={t("settings.plans.calculatorTitle")} icon={<CreditCard />}>
            <div className="pricing-calculator-grid">
              <div className="pricing-controls">
                <div className="form-grid">
                  <Field label={t("settings.plans.plan")}>
                    <select
                      value={currentPlan.name}
                      onChange={(e) => onSelectSubscriptionPlan(e.target.value as BillingPlan)}
                    >
                      {subscriptionPlans.map((plan) => (
                        <option key={plan.name} value={plan.name}>{plan.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("settings.plans.pricingModel")}>
                    <select
                      value={organization.billingCadence ?? "monthly"}
                      onChange={(e) =>
                        setOrganization({
                          ...organization,
                          billingCadence: e.target.value as BillingCadence
                        })
                      }
                    >
                      {billingCadenceOptions.map((option) => (
                        <option key={option.value} value={option.value}>{t(`settings.plans.cadence.${option.value}`)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("settings.plans.durationDays")}>
                    <input
                      type="number"
                      min="1"
                      value={organization.campaignDurationDays ?? 30}
                      onChange={(e) =>
                        setOrganization({ ...organization, campaignDurationDays: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label={t("settings.plans.supporterEstimate")}>
                    <input
                      type="number"
                      min="0"
                      value={organization.supporterCountEstimate ?? currentPlan.monthlySignatureLimit}
                      onChange={(e) =>
                        setOrganization({ ...organization, supporterCountEstimate: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <div className="pricing-feature-grid">
                  {pricingFeatureCatalog.map((feature) => {
                    const included = isFeatureIncludedInPlan(currentPlan.name, feature.key);
                    return (
                      <label className={included ? "pricing-feature-toggle included" : "pricing-feature-toggle"} key={feature.key}>
                        <input
                          type="checkbox"
                          checked={included || enabledFeatureKeys.has(feature.key)}
                          disabled={included}
                          onChange={(e) => updateFeatureAddOn(feature.key, e.target.checked)}
                        />
                        <span>
                          <strong>{feature.label}</strong>
                          <small>
                            {included
                              ? `${t("settings.plans.includedIn")} ${currentPlan.name}`
                              : `${formatInr(feature.addOnPriceInr)} ${t("settings.plans.addOnOrUpgrade")} ${feature.includedFrom}`}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="pricing-estimate-card">
                <span className="eyebrow">{t("settings.plans.estimatedQuote")}</span>
                <strong>{pricingEstimate.label}</strong>
                <p>{pricingEstimate.cadenceLabel} {t("settings.plans.pricingFor")} {currentPlan.name}</p>
                <ul>
                  {pricingEstimate.lineItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="button-row">
                  <button className="primary-button" type="button" onClick={onActivateSubscriptionManually}>
                    {t("settings.plans.markReady")}
                  </button>
                  <button className="secondary-button" type="button" onClick={() => testProviderConnection("Checkout")}>
                    {t("settings.plans.configureCheckout")}
                  </button>
                </div>
                <small>{t("settings.plans.noCheckout")}</small>
              </div>
            </div>
          </Panel>

          <div className="plan-grid pricing-plan-grid">
            {subscriptionPlans.map((plan) => (
              <PlanCard
                key={plan.name}
                title={plan.name}
                price={plan.price}
                features={[
                  `${formatPlanLimit(plan.campaignLimit)} ${t(plan.campaignLimit === 1 ? "settings.plans.campaign" : "settings.plans.campaigns")}`,
                  `${formatPlanLimit(plan.supporterLimit)} ${t("settings.plans.supporterLimit")}`,
                  `${plan.monthlySignatureLimit.toLocaleString()} ${t("settings.plans.signaturesMonth")}`,
                  `${plan.monthlyMessageLimit.toLocaleString()} ${t("settings.plans.messagesMonth")}`,
                  t(plan.voiceupBranding ? "settings.plans.voiceupBranding" : "settings.plans.customBrandingAvailable"),
                  t(plan.providerReadyIntegrations ? "settings.plans.integrationsAvailable" : "settings.plans.upgradeIntegrations"),
                  ...plan.features
                ]}
                highlighted={currentPlan.name === plan.name}
                actionLabel={currentPlan.name === plan.name ? "Selected" : `${t("settings.plans.select")} ${plan.name}`}
                displayActionLabel={currentPlan.name === plan.name ? t("settings.plans.selected") : `${t("settings.plans.select")} ${plan.name}`}
                onSelect={() => onSelectSubscriptionPlan(plan.name)}
              />
            ))}
          </div>

          <Panel title={t("settings.plans.comparisonTitle")} icon={<DatabaseBackup />}>
            <div className="pricing-table-wrap">
              <table className="pricing-comparison-table">
                <thead>
                  <tr>
                    <th>{t("settings.plans.plan")}</th>
                    <th>{t("settings.plans.monthly")}</th>
                    <th>{t("settings.plans.quarterly")}</th>
                    <th>{t("settings.plans.yearly")}</th>
                    <th>{t("settings.plans.campaigns")}</th>
                    <th>{t("settings.plans.supporters")}</th>
                    <th>{t("settings.plans.setupStatus")}</th>
                    <th>{t("settings.plans.bestFor")}</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptionPlans.map((plan) => (
                    <tr key={plan.name}>
                      <td><strong>{plan.name}</strong></td>
                      <td>{plan.monthlyPriceInr === null ? t("settings.plans.quote") : formatInr(plan.monthlyPriceInr)}</td>
                      <td>{plan.quarterlyPriceInr === null ? t("settings.plans.quote") : formatInr(plan.quarterlyPriceInr ?? plan.monthlyPriceInr ?? 0)}</td>
                      <td>{plan.yearlyPriceInr === null ? t("settings.plans.quote") : formatInr(plan.yearlyPriceInr ?? plan.monthlyPriceInr ?? 0)}</td>
                      <td>{formatPlanLimit(plan.campaignLimit)}</td>
                      <td>{formatPlanLimit(plan.supporterLimit)}</td>
                      <td>{t(plan.providerReadyIntegrations ? "settings.plans.enabled" : "settings.plans.disabled")}</td>
                      <td>{plan.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={t("settings.plans.featureGates")} icon={<LockKeyhole />}>
            <div className="feature-gate-grid">
              {pricingFeatureCatalog.map((feature) => {
                const included = isFeatureIncludedInPlan(currentPlan.name, feature.key);
                return (
                  <article className={included ? "feature-gate-card unlocked" : "feature-gate-card"} key={feature.key}>
                    <div>
                      {included ? <ShieldCheck size={20} /> : <LockKeyhole size={20} />}
                      <span className="eyebrow">{t(included ? "settings.plans.included" : "settings.plans.upgradePrompt")}</span>
                    </div>
                    <strong>{feature.label}</strong>
                    <p>{feature.description}</p>
                    <small>
                      {included
                        ? `${t("settings.plans.availableOn")} ${currentPlan.name}`
                        : `${t("settings.plans.upgradeTo")} ${feature.includedFrom} ${t("settings.plans.orAddFor")} ${formatInr(feature.addOnPriceInr)}.`}
                    </small>
                  </article>
                );
              })}
            </div>
          </Panel>
        </>
      )}

      {saasSection === "entitlements" && (
        <SubscriptionEntitlementsPanel
          organization={organization}
          campaigns={campaigns}
          signers={signers}
          scanItems={scanItems}
          onUpgradePlan={onUpgradeSubscriptionPlan}
          onDowngradePlan={onDowngradeSubscriptionPlan}
          onRenewSubscription={onRenewSubscriptionPeriod}
          onExtendSubscription={onExtendSubscriptionPeriod}
          onSuspendSubscription={onSuspendSubscriptionWithReason}
          onReactivateSubscription={onReactivateSuspendedSubscription}
          onCancelSubscription={onCancelSubscriptionLifecycle}
          onChangeBillingCycle={onChangeSubscriptionBillingCycle}
          onPurchaseAddOn={onPurchaseEntitlementAddOn}
        />
      )}
    </section>
  );
}
