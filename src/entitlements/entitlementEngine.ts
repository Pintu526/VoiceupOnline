import type { Organization } from "../types.ts";
import {
  getEffectiveMessageLimit,
  getEffectiveScanLimit,
  getEffectiveSignatureLimit,
  getSubscriptionPlan
} from "../utils/subscription.ts";
import { FEATURE_KEYS, FEATURE_MINIMUM_PLAN, meetsMinimumPlan, type FeatureKey } from "./featureKeys.ts";

export interface CampaignEntitlementLimits {
  signatures: number;
  scans: number;
  messages: number;
  seats: number;
  storageMb: number;
  smsCredits: number;
  whatsappCredits: number;
  ocrPages: number;
  aiCredits: number;
}

export interface CampaignEntitlements {
  plan: Organization["plan"];
  subscriptionStatus: Organization["subscriptionStatus"];
  isSuspended: boolean;
  isCancelled: boolean;
  isExpired: boolean;
  renewsAt: string;
  features: Record<FeatureKey, boolean>;
  disabledFeatureReasons: Partial<Record<FeatureKey, string>>;
  limits: CampaignEntitlementLimits;
  addOns: NonNullable<Organization["addOns"]>;
}

// Features that must remain available even when the subscription is
// suspended/cancelled/expired, so Campaign Admins are never locked out and
// historical/read-only data stays reachable. Preserving access here is what
// guarantees "no data loss" and "no reprovisioning" on downgrade/expiry.
const CORE_FEATURE_KEYS: FeatureKey[] = ["campaign_admin_access"];

function isRenewalPastDue(organization: Organization, now: number): boolean {
  if (!organization.renewsAt) return false;
  const renewsAtMs = new Date(`${organization.renewsAt}T23:59:59Z`).getTime();
  if (Number.isNaN(renewsAtMs)) return false;
  return renewsAtMs < now;
}

/**
 * The single centralized entitlement engine described by the plan/upgrade
 * architecture: `Base Plan + Purchased Add-ons = Effective Entitlements`.
 *
 * Every feature availability check in the app must call this function (or
 * `hasCampaignFeature`) instead of comparing `organization.plan` directly.
 */
export function getCampaignEntitlements(
  organization: Organization,
  now: number = Date.now()
): CampaignEntitlements {
  const plan = getSubscriptionPlan(organization.plan);
  const status = organization.subscriptionStatus;
  const isSuspended = status === "Suspended";
  const isCancelled = status === "Cancelled";
  const isExpired = status === "Active" && isRenewalPastDue(organization, now);
  const accessRestricted = isSuspended || isCancelled || isExpired;

  const enabledFeatureKeys = new Set(organization.enabledFeatureKeys ?? []);
  const addOns = organization.addOns ?? [];
  const addOnFeatureKeys = new Set(
    addOns
      .filter((addOn) => addOn.kind === "feature" && addOn.featureKey)
      .map((addOn) => addOn.featureKey as string)
  );

  const features = {} as Record<FeatureKey, boolean>;
  const disabledFeatureReasons: Partial<Record<FeatureKey, string>> = {};

  for (const key of FEATURE_KEYS) {
    const includedInPlan = plan.featureKeys.includes(key);
    const minimumPlan = FEATURE_MINIMUM_PLAN[key];
    const includedByTier = minimumPlan ? meetsMinimumPlan(organization.plan, minimumPlan) : false;
    const includedByAddOn = enabledFeatureKeys.has(key) || addOnFeatureKeys.has(key);
    const baseIncluded = includedInPlan || includedByTier || includedByAddOn;

    if (accessRestricted && !CORE_FEATURE_KEYS.includes(key)) {
      features[key] = false;
      disabledFeatureReasons[key] = isSuspended
        ? "Subscription is suspended."
        : isCancelled
          ? "Subscription is cancelled."
          : "Subscription has expired. Renew to restore access.";
      continue;
    }

    features[key] = baseIncluded;
    if (!baseIncluded && minimumPlan) {
      disabledFeatureReasons[key] = `Available from the ${minimumPlan} plan or as an add-on.`;
    }
  }

  // Campaign Admin access itself is always preserved: upgrades/downgrades
  // never require reassignment or re-provisioning of admins.
  features.campaign_admin_access = true;
  delete disabledFeatureReasons.campaign_admin_access;

  const limits: CampaignEntitlementLimits = {
    signatures: getEffectiveSignatureLimit(organization),
    scans: getEffectiveScanLimit(organization),
    messages: getEffectiveMessageLimit(organization),
    seats: (organization.seats ?? 0) + (organization.bonusOperatorSeats ?? 0),
    storageMb: organization.bonusStorageMb ?? 0,
    smsCredits: organization.bonusSmsCredits ?? 0,
    whatsappCredits: organization.bonusWhatsappCredits ?? 0,
    ocrPages: organization.bonusOcrPages ?? 0,
    aiCredits: organization.bonusAiCredits ?? 0
  };

  return {
    plan: organization.plan,
    subscriptionStatus: status,
    isSuspended,
    isCancelled,
    isExpired,
    renewsAt: organization.renewsAt ?? "",
    features,
    disabledFeatureReasons,
    limits,
    addOns
  };
}

export function hasCampaignFeature(organization: Organization, featureKey: FeatureKey, now?: number): boolean {
  return getCampaignEntitlements(organization, now).features[featureKey] === true;
}

function buildEntitlementVersionKey(organization: Organization): string {
  return JSON.stringify({
    plan: organization.plan,
    subscriptionStatus: organization.subscriptionStatus,
    enabledFeatureKeys: organization.enabledFeatureKeys ?? [],
    addOns: organization.addOns ?? [],
    renewsAt: organization.renewsAt ?? "",
    suspendedAt: organization.suspendedAt ?? "",
    cancelledAt: organization.cancelledAt ?? "",
    bonusStorageMb: organization.bonusStorageMb ?? 0,
    bonusOperatorSeats: organization.bonusOperatorSeats ?? 0,
    bonusSmsCredits: organization.bonusSmsCredits ?? 0,
    bonusWhatsappCredits: organization.bonusWhatsappCredits ?? 0,
    bonusOcrPages: organization.bonusOcrPages ?? 0,
    bonusAiCredits: organization.bonusAiCredits ?? 0,
    bonusSignatureCredits: organization.bonusSignatureCredits ?? 0,
    bonusScanCredits: organization.bonusScanCredits ?? 0,
    bonusMessageCredits: organization.bonusMessageCredits ?? 0
  });
}

export interface EntitlementCache {
  get(organization: Organization, now?: number): CampaignEntitlements;
  invalidate(): void;
}

/**
 * Optional memoizing cache in front of `getCampaignEntitlements`. The cache
 * key is derived only from the fields that affect entitlements, so it
 * refreshes automatically the moment any of them change (upgrade, downgrade,
 * renewal, add-on purchase, suspension, ...) -- callers never need to
 * manually invalidate it after a plan change.
 */
export function createEntitlementCache(): EntitlementCache {
  let lastKey: string | null = null;
  let lastResult: CampaignEntitlements | null = null;
  return {
    get(organization: Organization, now?: number) {
      const key = buildEntitlementVersionKey(organization);
      if (lastResult && key === lastKey) return lastResult;
      lastResult = getCampaignEntitlements(organization, now);
      lastKey = key;
      return lastResult;
    },
    invalidate() {
      lastKey = null;
      lastResult = null;
    }
  };
}
