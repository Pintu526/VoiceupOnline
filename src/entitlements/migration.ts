import type { Organization } from "../types.ts";

/**
 * Backfills entitlement-related bookkeeping fields for organizations/
 * campaigns created before this architecture existed. Only ever adds
 * missing subscription/entitlement fields with safe defaults -- it never
 * touches campaigns, signers, documents, volunteers, funds, expenses,
 * reports, audit history, or campaign admin assignments, and it is
 * idempotent (safe to call on every load).
 */
export function backfillOrganizationEntitlements(organization: Organization): Organization {
  return {
    ...organization,
    renewsAt: organization.renewsAt ?? organization.trialEndsAt ?? "",
    cancelAtPeriodEnd: organization.cancelAtPeriodEnd ?? false,
    scheduledPlanChange: organization.scheduledPlanChange ?? null,
    addOns: organization.addOns ?? [],
    entitlementAuditLog: organization.entitlementAuditLog ?? [],
    bonusStorageMb: organization.bonusStorageMb ?? 0,
    bonusOperatorSeats: organization.bonusOperatorSeats ?? 0,
    bonusSmsCredits: organization.bonusSmsCredits ?? 0,
    bonusWhatsappCredits: organization.bonusWhatsappCredits ?? 0,
    bonusOcrPages: organization.bonusOcrPages ?? 0,
    bonusAiCredits: organization.bonusAiCredits ?? 0
  };
}

export function isOrganizationBackfilled(organization: Organization): boolean {
  return (
    organization.addOns !== undefined &&
    organization.entitlementAuditLog !== undefined &&
    organization.bonusStorageMb !== undefined
  );
}
