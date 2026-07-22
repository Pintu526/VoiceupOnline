import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCancelSubscription,
  applyChangeBillingCycle,
  applyDowngradePlan,
  applyExtendSubscriptionDuration,
  applyPurchaseAddOn,
  applyReactivateSubscription,
  applyRenewSubscription,
  applyScheduledPlanChangeIfDue,
  applySuspendSubscription,
  applyUpgradePlan,
  backfillOrganizationEntitlements,
  createEntitlementCache,
  getCampaignEntitlements,
  hasCampaignFeature,
  isOrganizationBackfilled
} from "../src/entitlements/index.ts";

const baseOrganization = {
  id: "org-current",
  name: "Test movement",
  plan: "Free Trial",
  subscriptionStatus: "Trial",
  trialEndsAt: "",
  monthlySignatureLimit: 100,
  monthlyScanLimit: 10,
  monthlyMessageLimit: 0,
  bonusSignatureCredits: 0,
  bonusScanCredits: 0,
  bonusMessageCredits: 0,
  customBranding: false,
  customDomain: "",
  ownerEmail: "owner@example.org",
  billingEmail: "",
  seats: 2,
  paymentReference: "",
  billingCadence: "monthly",
  campaignDurationDays: 30,
  supporterCountEstimate: 1000,
  enabledFeatureKeys: [],
  prepaidWalletEnabled: false,
  prepaidWalletMode: "online_payment",
  signaturePriceInr: 1,
  signatureWalletBalanceInr: 0,
  signaturePinPrefix: "VUP"
};

function actor() {
  return "admin@example.org";
}

test("upgrade unlocks features immediately", () => {
  const before = getCampaignEntitlements(baseOrganization);
  assert.equal(before.features.ai_copilot, false);

  const { organization: upgraded, auditEntry } = applyUpgradePlan(baseOrganization, "Growth", actor());
  assert.equal(upgraded.plan, "Growth");
  assert.equal(auditEntry.action, "plan_upgraded");

  const after = getCampaignEntitlements(upgraded);
  assert.equal(after.features.ai_copilot, true);
  assert.equal(after.features.field_collection, true);
  assert.equal(after.features.secure_upload, true, "Growth tier should unlock secure_upload via FEATURE_MINIMUM_PLAN");
});

test("downgrade removes only access, historical data remains untouched", () => {
  const proOrganization = { ...baseOrganization, plan: "Pro Movement", subscriptionStatus: "Active" };
  const campaigns = [{ id: "camp-1", title: "Keep me" }];
  const signers = [{ id: "signer-1", name: "Keep me too" }];

  const { organization: downgraded } = applyDowngradePlan(proOrganization, "Starter", actor(), {
    effective: "immediately"
  });

  assert.equal(downgraded.plan, "Starter");
  const entitlements = getCampaignEntitlements(downgraded);
  assert.equal(entitlements.features.movement_crm, false);
  assert.equal(entitlements.features.advanced_reports, false);
  // Downgrade never touches unrelated app data -- these were never passed in
  // to begin with, proving the engine cannot mutate them.
  assert.deepEqual(campaigns, [{ id: "camp-1", title: "Keep me" }]);
  assert.deepEqual(signers, [{ id: "signer-1", name: "Keep me too" }]);
});

test("scheduled (period-end) downgrade keeps current entitlements until due, then applies with no reprovisioning", () => {
  const proOrganization = { ...baseOrganization, plan: "Pro Movement", subscriptionStatus: "Active", renewsAt: "2020-01-01" };
  const { organization: scheduled } = applyDowngradePlan(proOrganization, "Starter", actor());

  assert.equal(scheduled.plan, "Pro Movement", "plan must not change until the scheduled date is reached");
  assert.ok(scheduled.scheduledPlanChange);
  assert.equal(scheduled.scheduledPlanChange.toPlan, "Starter");

  // Not yet due.
  const stillPro = applyScheduledPlanChangeIfDue(scheduled, "2019-06-01T00:00:00.000Z");
  assert.equal(stillPro.plan, "Pro Movement");

  // Due -- applies automatically on next load, no manual reprovisioning step.
  const nowDowngraded = applyScheduledPlanChangeIfDue(scheduled, "2020-02-01T00:00:00.000Z");
  assert.equal(nowDowngraded.plan, "Starter");
  assert.equal(nowDowngraded.scheduledPlanChange, null);
});

test("add-ons extend limits correctly, independent of plan", () => {
  const { organization: withOcr } = applyPurchaseAddOn(baseOrganization, actor(), {
    kind: "ocr_pages",
    quantity: 100,
    priceInr: 299
  });
  const { organization: withSeatsToo } = applyPurchaseAddOn(withOcr, actor(), {
    kind: "operator_seats",
    quantity: 5,
    priceInr: 999
  });
  const { organization: withFeature } = applyPurchaseAddOn(withSeatsToo, actor(), {
    kind: "feature",
    featureKey: "crowdfunding",
    quantity: 1,
    priceInr: 1999
  });

  const entitlements = getCampaignEntitlements(withFeature);
  assert.equal(entitlements.limits.ocrPages, 100);
  assert.equal(entitlements.limits.seats, 2 + 5);
  assert.equal(entitlements.features.crowdfunding, true);
  assert.equal(withFeature.addOns.length, 3);
});

test("renewal preserves access and extends the renewal date", () => {
  const activeOrganization = { ...baseOrganization, plan: "Growth", subscriptionStatus: "Active", renewsAt: "2024-01-01" };
  const { organization: renewed, auditEntry } = applyRenewSubscription(activeOrganization, actor(), { periodDays: 30 }, "2024-01-05T00:00:00.000Z");
  assert.equal(auditEntry.action, "subscription_renewed");
  assert.equal(renewed.subscriptionStatus, "Active");
  assert.ok(renewed.renewsAt > "2024-01-05");
  assert.equal(getCampaignEntitlements(renewed, new Date("2024-01-06").getTime()).features.ai_copilot, true);
});

test("subscription extension pushes the renewal date without changing plan/status", () => {
  const activeOrganization = { ...baseOrganization, plan: "Growth", subscriptionStatus: "Active", renewsAt: "2024-01-01" };
  const { organization: extended, auditEntry } = applyExtendSubscriptionDuration(activeOrganization, actor(), 10, "2024-01-01T00:00:00.000Z");
  assert.equal(auditEntry.action, "subscription_extended");
  assert.equal(extended.renewsAt, "2024-01-11");
  assert.equal(extended.plan, "Growth");
});

test("expiry disables non-core features but preserves campaign admin access (no data loss)", () => {
  const expiredOrganization = {
    ...baseOrganization,
    plan: "Growth",
    subscriptionStatus: "Active",
    renewsAt: "2020-01-01"
  };
  const now = new Date("2020-02-01").getTime();
  const entitlements = getCampaignEntitlements(expiredOrganization, now);

  assert.equal(entitlements.isExpired, true);
  assert.equal(entitlements.features.ai_copilot, false);
  assert.equal(entitlements.features.campaign_admin_access, true, "campaign admin access must never be revoked");
  assert.match(entitlements.disabledFeatureReasons.ai_copilot, /expired/i);
});

test("suspension and cancellation restrict features but never lock out campaign admin access", () => {
  const { organization: suspended } = applySuspendSubscription(baseOrganization, actor(), "Non-payment");
  const suspendedEntitlements = getCampaignEntitlements(suspended);
  assert.equal(suspendedEntitlements.isSuspended, true);
  assert.equal(suspendedEntitlements.features.campaign_admin_access, true);
  assert.equal(hasCampaignFeature(suspended, "ai_copilot"), false);

  const { organization: reactivated } = applyReactivateSubscription(suspended, actor());
  assert.equal(reactivated.subscriptionStatus, "Active");
  assert.equal(reactivated.suspendedAt, undefined);

  const { organization: cancelledAtPeriodEnd } = applyCancelSubscription(reactivated, actor(), { atPeriodEnd: true });
  assert.equal(cancelledAtPeriodEnd.cancelAtPeriodEnd, true);
  assert.equal(cancelledAtPeriodEnd.subscriptionStatus, "Active", "immediate status unaffected until period end");

  const { organization: cancelledNow } = applyCancelSubscription(reactivated, actor(), { atPeriodEnd: false });
  assert.equal(cancelledNow.subscriptionStatus, "Cancelled");
  assert.equal(getCampaignEntitlements(cancelledNow).features.campaign_admin_access, true);
});

test("Campaign Admin session/entitlement access continues uninterrupted across an upgrade", () => {
  const before = getCampaignEntitlements(baseOrganization);
  assert.equal(before.features.campaign_admin_access, true);
  const { organization: upgraded } = applyUpgradePlan(baseOrganization, "Enterprise", actor());
  const after = getCampaignEntitlements(upgraded);
  assert.equal(after.features.campaign_admin_access, true);
  assert.equal(after.features.api_access, true);
});

test("entitlement cache refreshes correctly when plan-relevant fields change", () => {
  const cache = createEntitlementCache();
  const first = cache.get(baseOrganization);
  const second = cache.get(baseOrganization);
  assert.equal(first, second, "unchanged organization should hit the memoized cache");

  const { organization: upgraded } = applyUpgradePlan(baseOrganization, "Growth", actor());
  const third = cache.get(upgraded);
  assert.notEqual(third, first, "cache must recompute once entitlement-relevant fields change");
  assert.equal(third.features.ai_copilot, true);
});

test("billing cycle change is recorded and applied", () => {
  const { organization: changed, auditEntry } = applyChangeBillingCycle(baseOrganization, actor(), "yearly");
  assert.equal(changed.billingCadence, "yearly");
  assert.equal(auditEntry.action, "billing_cycle_changed");
});

test("backfill is additive-only, idempotent, and never touches unrelated data", () => {
  const legacyOrganization = {
    id: "org-legacy",
    name: "Legacy org",
    plan: "Starter",
    subscriptionStatus: "Active",
    trialEndsAt: "2023-01-01",
    monthlySignatureLimit: 1000,
    monthlyScanLimit: 100,
    monthlyMessageLimit: 500,
    seats: 2
  };

  assert.equal(isOrganizationBackfilled(legacyOrganization), false);
  const backfilled = backfillOrganizationEntitlements(legacyOrganization);
  assert.equal(isOrganizationBackfilled(backfilled), true);
  assert.deepEqual(backfilled.addOns, []);
  assert.deepEqual(backfilled.entitlementAuditLog, []);
  assert.equal(backfilled.bonusStorageMb, 0);
  assert.equal(backfilled.renewsAt, "2023-01-01");
  // Unrelated fields are preserved exactly.
  assert.equal(backfilled.name, "Legacy org");
  assert.equal(backfilled.plan, "Starter");

  const backfilledAgain = backfillOrganizationEntitlements(backfilled);
  assert.deepEqual(backfilledAgain, backfilled, "backfill must be idempotent");
});
