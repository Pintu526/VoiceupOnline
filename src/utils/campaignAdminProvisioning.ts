// Pure, framework-agnostic decision logic and copy for the Campaign Admin
// provisioning UI (creation, replacement, and legacy re-provisioning flows).
// Kept free of React/Supabase imports so every rule and every user-facing
// message is unit-testable without rendering a component or a live backend,
// and so App.tsx / CampaignsTab.tsx always show the exact same wording.

import type { Campaign } from "../types";

export type CampaignAdminProvisioningStatus = "unprovisioned" | "provisioned" | "provisioning_failed";

/** Exact copy for every required Campaign Admin provisioning UI state. */
export const CAMPAIGN_ADMIN_PROVISIONING_MESSAGES = {
  inProgress: "Provisioning Campaign Admin…",
  success: "Campaign Admin provisioned successfully.",
  failurePrefix: "Campaign Admin provisioning failed:",
  replacementWarning: "This will replace the current Campaign Admin.",
  incomplete: "Campaign Admin provisioning is incomplete.",
  planRestricted: "Campaign Admin access is not included in the current plan.",
  upgradeAction: "Upgrade to enable Campaign Admin access.",
  alreadyInProgress: "Campaign Admin provisioning is already in progress.",
  notSaved: "Save this campaign before provisioning a Campaign Admin.",
  invalidCredentials: "Enter a valid email and a password of at least 8 characters."
} as const;

export interface CampaignAdminProvisioningGateInput {
  isSavedCampaign: boolean;
  email: string;
  password: string;
  hasCampaignAdminAccessFeature: boolean;
  provisioningInProgress: boolean;
}

export type CampaignAdminProvisioningGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "already_in_progress" | "not_saved" | "plan_restricted" | "invalid_credentials";
      message: string;
    };

/**
 * Every guard that must pass before `provision-workspace-member` is called,
 * in the order they must be checked. Duplicate submissions are rejected
 * first (cheapest, no state needed); an unsaved campaign has no stable
 * resourceId to assign against; a plan without `campaign_admin_access` must
 * never reach the Edge Function; only then is the entered email/password
 * shape validated.
 */
export function evaluateCampaignAdminProvisioningGate(
  input: CampaignAdminProvisioningGateInput
): CampaignAdminProvisioningGateResult {
  if (input.provisioningInProgress) {
    return { allowed: false, reason: "already_in_progress", message: CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.alreadyInProgress };
  }
  if (!input.isSavedCampaign) {
    return { allowed: false, reason: "not_saved", message: CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.notSaved };
  }
  if (!input.hasCampaignAdminAccessFeature) {
    return { allowed: false, reason: "plan_restricted", message: CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.planRestricted };
  }
  const trimmedEmail = input.email.trim();
  if (!trimmedEmail || !input.password || input.password.length < 8) {
    return { allowed: false, reason: "invalid_credentials", message: CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.invalidCredentials };
  }
  return { allowed: true };
}

/** True when a Campaign Admin is already active for this campaign, so submitting will replace them. */
export function shouldWarnBeforeReplacingCampaignAdmin(
  status: CampaignAdminProvisioningStatus | undefined
): boolean {
  return status === "provisioned";
}

/** Persistent (non-transient) status line shown until provisioning has actually succeeded. */
export function describeCampaignAdminProvisioningStatus(
  status: CampaignAdminProvisioningStatus | undefined
): string | null {
  return status === "provisioned" ? null : CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.incomplete;
}

export function formatCampaignAdminProvisioningFailure(message: string): string {
  return `${CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.failurePrefix} ${message}`;
}

/**
 * The next campaign record to persist after a successful provisioning call.
 * Only the (already non-secret) email is retained; the submitted password is
 * never included, and any legacy plaintext `adminPasscode` is cleared.
 */
export function applyCampaignAdminProvisioningSuccess(
  campaign: Campaign,
  provisionedEmail: string
): Campaign {
  return {
    ...campaign,
    adminEmail: provisionedEmail,
    adminPasscode: "",
    adminProvisioningStatus: "provisioned"
  };
}

/**
 * The next campaign record to persist after a FAILED provisioning call. If a
 * Campaign Admin was already active before this attempt, its status is left
 * untouched (a failed replacement attempt must never be misreported as
 * "unprovisioned" when the previous administrator may still be intact) --
 * only a first-time provisioning failure is recorded as `provisioning_failed`.
 */
export function applyCampaignAdminProvisioningFailure(campaign: Campaign): Campaign {
  if (campaign.adminProvisioningStatus === "provisioned") return campaign;
  return { ...campaign, adminProvisioningStatus: "provisioning_failed" };
}
