import type { BillingPlan } from "../types.ts";

// ─── Canonical feature key catalog ─────────────────────────────────────────
// Every feature gate in the app must be one of these keys. Never scatter
// `if (plan === "Pro")` checks throughout the codebase -- add the key here
// (and, if it needs a minimum plan tier, to `FEATURE_MINIMUM_PLAN` below)
// and call `getCampaignEntitlements()` / `hasCampaignFeature()` everywhere
// else.
export const FEATURE_KEYS = [
  // Keys requested by the plan/entitlement architecture.
  "campaign_admin_access",
  "field_collection",
  "secure_upload",
  "bulk_import",
  "ocr_processing",
  "sms",
  "whatsapp",
  "crowdfunding",
  "expense_tracking",
  "advanced_reports",
  "volunteer_management",
  "crm",
  "api_access",
  // Legacy keys already gating navigation/features elsewhere in the app.
  // Kept in the same catalog so every check -- old and new -- is served by
  // the single centralized engine instead of ad-hoc plan comparisons.
  "public_signing",
  "basic_reports",
  "advanced_templates",
  "ai_copilot",
  "authority_intelligence",
  "communication_hub",
  "movement_crm",
  "growth_engine",
  "command_center",
  "custom_branding",
  "multi_organization",
  "roles",
  "integrations",
  "custom_limits",
  "priority_support"
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const PLAN_ORDER: BillingPlan[] = ["Free Trial", "Starter", "Growth", "Pro Movement", "Enterprise"];

function normalizePlan(plan: BillingPlan): BillingPlan {
  return plan === "Professional" ? "Growth" : plan;
}

export function planRank(plan: BillingPlan): number {
  const rank = PLAN_ORDER.indexOf(normalizePlan(plan));
  return rank === -1 ? 0 : rank;
}

export function meetsMinimumPlan(plan: BillingPlan, minimumPlan: BillingPlan): boolean {
  return planRank(plan) >= planRank(minimumPlan);
}

/**
 * Minimum plan tier required for feature keys that are not already declared
 * on `subscriptionPlans[].featureKeys` in `src/data.ts`. This is the only
 * place new plan-gated features should be registered.
 */
export const FEATURE_MINIMUM_PLAN: Partial<Record<FeatureKey, BillingPlan>> = {
  campaign_admin_access: "Free Trial",
  secure_upload: "Growth",
  ocr_processing: "Growth",
  sms: "Growth",
  whatsapp: "Growth",
  crowdfunding: "Growth",
  expense_tracking: "Pro Movement",
  volunteer_management: "Pro Movement",
  crm: "Pro Movement",
  api_access: "Enterprise"
};
