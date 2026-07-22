import type {
  BillingCadence,
  BillingPlan,
  EntitlementAddOnKind,
  EntitlementAuditEntry,
  EntitlementLifecycleAction,
  Organization,
  PurchasedEntitlementAddOn
} from "../types.ts";
import { getDefaultMessageLimit, getSubscriptionPlan } from "../utils/subscription.ts";

export interface LifecycleResult {
  organization: Organization;
  auditEntry: EntitlementAuditEntry;
}

function createAuditId(): string {
  return `ent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAuditEntry(
  action: EntitlementLifecycleAction,
  actor: string,
  organization: Organization,
  overrides: Partial<EntitlementAuditEntry>,
  now: string
): EntitlementAuditEntry {
  return {
    id: createAuditId(),
    at: now,
    actor,
    action,
    fromPlan: organization.plan,
    fromStatus: organization.subscriptionStatus,
    ...overrides
  };
}

function withAuditLog(organization: Organization, auditEntry: EntitlementAuditEntry): Organization {
  return {
    ...organization,
    entitlementAuditLog: [auditEntry, ...(organization.entitlementAuditLog ?? [])].slice(0, 500)
  };
}

function addDaysIso(fromIso: string | undefined, days: number, now: string): string {
  const base = fromIso ? new Date(`${fromIso}T00:00:00Z`) : new Date(now);
  const start = Number.isNaN(base.getTime()) ? new Date(now) : base;
  return new Date(start.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Upgrades take effect immediately: new limits/features unlock the moment
 * this is applied -- no logout, no redeployment, no manual database edits.
 */
export function applyUpgradePlan(
  organization: Organization,
  newPlan: BillingPlan,
  actor: string,
  now: string = new Date().toISOString()
): LifecycleResult {
  const plan = getSubscriptionPlan(newPlan);
  const nextStatus =
    organization.subscriptionStatus === "Cancelled" || organization.subscriptionStatus === "Suspended"
      ? "Active"
      : organization.subscriptionStatus;
  const nextOrganization: Organization = {
    ...organization,
    plan: plan.name,
    monthlySignatureLimit: plan.monthlySignatureLimit,
    monthlyScanLimit: plan.monthlyScanLimit,
    monthlyMessageLimit: getDefaultMessageLimit(plan.name),
    subscriptionStatus: nextStatus,
    cancelAtPeriodEnd: false,
    cancelledAt: undefined,
    suspendedAt: undefined,
    suspendedReason: undefined,
    scheduledPlanChange: null
  };
  const auditEntry = createAuditEntry(
    "plan_upgraded",
    actor,
    organization,
    {
      toPlan: plan.name,
      toStatus: nextStatus,
      reason: `Upgraded from ${organization.plan} to ${plan.name}`
    },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}

/**
 * Downgrades never delete data. By default the downgrade is scheduled to
 * take effect at the next renewal date (`effective: "period_end"`), keeping
 * current entitlements active until then. Pass `effective: "immediately"`
 * to apply it right away instead.
 */
export function applyDowngradePlan(
  organization: Organization,
  newPlan: BillingPlan,
  actor: string,
  options: { effective?: "immediately" | "period_end" } = {},
  now: string = new Date().toISOString()
): LifecycleResult {
  const effective = options.effective ?? "period_end";
  const plan = getSubscriptionPlan(newPlan);

  if (effective === "immediately") {
    const nextOrganization: Organization = {
      ...organization,
      plan: plan.name,
      monthlySignatureLimit: plan.monthlySignatureLimit,
      monthlyScanLimit: plan.monthlyScanLimit,
      monthlyMessageLimit: getDefaultMessageLimit(plan.name),
      scheduledPlanChange: null
    };
    const auditEntry = createAuditEntry(
      "plan_downgrade_applied",
      actor,
      organization,
      {
        toPlan: plan.name,
        toStatus: organization.subscriptionStatus,
        reason: `Downgraded immediately from ${organization.plan} to ${plan.name}`
      },
      now
    );
    return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
  }

  const effectiveAt = organization.renewsAt || addDaysIso(undefined, 0, now);
  const nextOrganization: Organization = {
    ...organization,
    scheduledPlanChange: { toPlan: plan.name, effectiveAt, requestedAt: now }
  };
  const auditEntry = createAuditEntry(
    "plan_downgrade_scheduled",
    actor,
    organization,
    {
      toPlan: plan.name,
      reason: `Downgrade to ${plan.name} scheduled for ${effectiveAt}`
    },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}

/**
 * Applies a previously scheduled downgrade once its effective date has
 * passed. Safe/no-op when there is nothing scheduled or it is not yet due.
 * Call this on workspace load / renewal checks.
 */
export function applyScheduledPlanChangeIfDue(
  organization: Organization,
  now: string = new Date().toISOString()
): Organization {
  const scheduled = organization.scheduledPlanChange;
  if (!scheduled) return organization;
  const dueMs = new Date(`${scheduled.effectiveAt}T23:59:59Z`).getTime();
  if (Number.isNaN(dueMs) || dueMs > new Date(now).getTime()) return organization;
  const plan = getSubscriptionPlan(scheduled.toPlan);
  return {
    ...organization,
    plan: plan.name,
    monthlySignatureLimit: plan.monthlySignatureLimit,
    monthlyScanLimit: plan.monthlyScanLimit,
    monthlyMessageLimit: getDefaultMessageLimit(plan.name),
    scheduledPlanChange: null
  };
}

export function applyRenewSubscription(
  organization: Organization,
  actor: string,
  options: { periodDays?: number } = {},
  now: string = new Date().toISOString()
): LifecycleResult {
  const periodDays = options.periodDays ?? 30;
  const nextStatus =
    organization.subscriptionStatus === "Suspended" || organization.subscriptionStatus === "Cancelled"
      ? organization.subscriptionStatus
      : "Active";
  const nextOrganization: Organization = {
    ...organization,
    subscriptionStatus: nextStatus,
    renewsAt: addDaysIso(undefined, periodDays, now),
    billingCycleAnchor: now.slice(0, 10)
  };
  const auditEntry = createAuditEntry(
    "subscription_renewed",
    actor,
    organization,
    {
      toPlan: organization.plan,
      toStatus: nextStatus,
      reason: `Renewed for ${periodDays} days`,
      metadata: { renewsAt: nextOrganization.renewsAt ?? "" }
    },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}

export function applyExtendSubscriptionDuration(
  organization: Organization,
  actor: string,
  extraDays: number,
  now: string = new Date().toISOString()
): LifecycleResult {
  const nextOrganization: Organization = {
    ...organization,
    renewsAt: addDaysIso(organization.renewsAt, extraDays, now)
  };
  const auditEntry = createAuditEntry(
    "subscription_extended",
    actor,
    organization,
    {
      toPlan: organization.plan,
      toStatus: organization.subscriptionStatus,
      reason: `Extended by ${extraDays} days`,
      metadata: { renewsAt: nextOrganization.renewsAt ?? "" }
    },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}

export function applySuspendSubscription(
  organization: Organization,
  actor: string,
  reason: string,
  now: string = new Date().toISOString()
): LifecycleResult {
  const nextOrganization: Organization = {
    ...organization,
    subscriptionStatus: "Suspended",
    suspendedAt: now,
    suspendedReason: reason
  };
  const auditEntry = createAuditEntry(
    "subscription_suspended",
    actor,
    organization,
    { toPlan: organization.plan, toStatus: "Suspended", reason },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}

export function applyReactivateSubscription(
  organization: Organization,
  actor: string,
  now: string = new Date().toISOString()
): LifecycleResult {
  const nextOrganization: Organization = {
    ...organization,
    subscriptionStatus: "Active",
    suspendedAt: undefined,
    suspendedReason: undefined,
    cancelledAt: undefined,
    cancelAtPeriodEnd: false
  };
  const auditEntry = createAuditEntry(
    "subscription_reactivated",
    actor,
    organization,
    { toPlan: organization.plan, toStatus: "Active", reason: "Subscription reactivated" },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}

export function applyCancelSubscription(
  organization: Organization,
  actor: string,
  options: { atPeriodEnd?: boolean } = {},
  now: string = new Date().toISOString()
): LifecycleResult {
  const atPeriodEnd = options.atPeriodEnd ?? true;
  const nextOrganization: Organization = atPeriodEnd
    ? { ...organization, cancelAtPeriodEnd: true }
    : { ...organization, subscriptionStatus: "Cancelled", cancelledAt: now, cancelAtPeriodEnd: false };
  const auditEntry = createAuditEntry(
    "subscription_cancelled",
    actor,
    organization,
    {
      toPlan: organization.plan,
      toStatus: nextOrganization.subscriptionStatus,
      reason: atPeriodEnd ? "Cancellation scheduled for period end" : "Cancelled immediately"
    },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}

export function applyChangeBillingCycle(
  organization: Organization,
  actor: string,
  newCadence: BillingCadence,
  now: string = new Date().toISOString()
): LifecycleResult {
  const nextOrganization: Organization = { ...organization, billingCadence: newCadence };
  const auditEntry = createAuditEntry(
    "billing_cycle_changed",
    actor,
    organization,
    {
      toPlan: organization.plan,
      toStatus: organization.subscriptionStatus,
      reason: `Billing cycle changed to ${newCadence}`
    },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}

export interface AddOnPurchaseRequest {
  kind: EntitlementAddOnKind;
  quantity: number;
  priceInr?: number;
  featureKey?: string;
  durationDays?: number;
}

const ADD_ON_BONUS_FIELD: Partial<Record<EntitlementAddOnKind, keyof Organization>> = {
  storage_mb: "bonusStorageMb",
  operator_seats: "bonusOperatorSeats",
  sms_credits: "bonusSmsCredits",
  whatsapp_credits: "bonusWhatsappCredits",
  ocr_pages: "bonusOcrPages",
  ai_credits: "bonusAiCredits"
};

/**
 * Purchases an add-on independent of plan (extra storage, operator seats,
 * SMS/WhatsApp credits, OCR pages, AI credits, or a specific feature key).
 * The entitlement engine combines these with the base plan automatically --
 * no code changes are required to support a new purchase.
 */
export function applyPurchaseAddOn(
  organization: Organization,
  actor: string,
  request: AddOnPurchaseRequest,
  now: string = new Date().toISOString()
): LifecycleResult {
  const addOn: PurchasedEntitlementAddOn = {
    id: `addon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: request.kind,
    featureKey: request.featureKey,
    quantity: request.quantity,
    priceInr: request.priceInr ?? 0,
    purchasedAt: now,
    expiresAt: request.durationDays ? addDaysIso(undefined, request.durationDays, now) : undefined
  };

  let nextOrganization: Organization = {
    ...organization,
    addOns: [...(organization.addOns ?? []), addOn]
  };

  const bonusField = ADD_ON_BONUS_FIELD[request.kind];
  if (bonusField) {
    const currentValue = Number(organization[bonusField] ?? 0);
    nextOrganization = { ...nextOrganization, [bonusField]: currentValue + request.quantity } as Organization;
  } else if (request.kind === "feature" && request.featureKey) {
    const nextKeys = new Set(organization.enabledFeatureKeys ?? []);
    nextKeys.add(request.featureKey);
    nextOrganization = { ...nextOrganization, enabledFeatureKeys: Array.from(nextKeys) };
  }

  const auditEntry = createAuditEntry(
    "add_on_purchased",
    actor,
    organization,
    {
      toPlan: organization.plan,
      toStatus: organization.subscriptionStatus,
      reason: `Purchased add-on ${request.kind}${request.featureKey ? ` (${request.featureKey})` : ""} x${request.quantity}`,
      metadata: { kind: request.kind, quantity: request.quantity, priceInr: addOn.priceInr }
    },
    now
  );
  return { organization: withAuditLog(nextOrganization, auditEntry), auditEntry };
}
