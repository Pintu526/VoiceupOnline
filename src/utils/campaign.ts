import {
  initialAuthorities,
  initialCommercialPackages,
  initialIntegrationSettings
} from "../data";
import type { VoiceupRemoteState } from "../backend";
import type { Campaign, Organization } from "../types";
import { getCampaignMetrics } from "../lib";

export function getCampaignBaseUrl(organization: Organization): string {
  if (organization.customDomain.trim()) {
    return `https://${organization.customDomain.trim().replace(/^https?:\/\//, "")}`;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "https://voiceup.in";
}

export function getCampaignGoalValue(campaign: Campaign): number {
  return campaign.maxSignersAllowed > 0 ? campaign.maxSignersAllowed : campaign.goal;
}

export function hasSaasLocks(campaign: Campaign): boolean {
  return Boolean(
    campaign.publishingLockedBySaas ||
      campaign.goalLockedBySaas ||
      campaign.datesLockedBySaas ||
      campaign.authorityLockedBySaas ||
      campaign.donationLockedBySaas ||
      campaign.requiredFieldsLockedBySaas ||
      campaign.maxSignersAllowed > 0 ||
      campaign.maxScansAllowed > 0
  );
}

export function getTomorrowDate(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

export function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function renderCampaignMessage(
  template: string,
  campaign: Campaign,
  metrics: ReturnType<typeof getCampaignMetrics>
): string {
  return template
    .split("{{campaign}}").join(campaign.title)
    .split("{{url}}").join(campaign.shareUrl)
    .split("{{verified}}").join(metrics.verified.toLocaleString())
    .split("{{total}}").join(metrics.total.toLocaleString())
    .split("{{goal}}").join(campaign.goal.toLocaleString())
    .split("{{progress}}").join(`${metrics.progress}%`);
}

export function createRemoteState(state: VoiceupRemoteState): VoiceupRemoteState {
  return {
    campaigns: state.campaigns,
    signers: state.signers,
    authorities: state.authorities,
    organization: state.organization,
    scanItems: state.scanItems,
    locationOverrides: state.locationOverrides,
    locationDeletions: state.locationDeletions,
    auditLogs: state.auditLogs ?? [],
    integrations: state.integrations ?? initialIntegrationSettings,
    commercialPackages: state.commercialPackages ?? initialCommercialPackages
  };
}

export function signerFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    state: "State",
    district: "District",
    block: "Block / Tehsil / Taluk",
    panchayat: "Gram Panchayat / Ward",
    address: "Street address / house details",
    postalCode: "PIN code",
    comment: "Comment"
  };
  return labels[field] ?? field;
}
