import type { SupabaseClient } from '@supabase/supabase-js';

/** Backend is authoritative: never calculate or award points in the browser. */
export interface GauPointsWallet {
  balance: number;
  lifetimeValid: number;
  currentRound: number;
  referralCode: string | null;
}
export interface GauPointsLeader {
  rank: number;
  alias: string;
  lifetimeValid: number;
}
export interface GauPointsCampaignConfiguration {
  configured: boolean;
  enabled: boolean;
  awardsEnabledAt: string | null;
  verifiedSigningPoints: number;
  verifiedRegistrationReferralPoints: number;
  branchFactor: number;
  maximumRound: number;
  roundContributionPercentage: number;
  distributionFormula: "equal";
  redeemable: false;
}

function safeScope(value: string): string {
  if (!value || value.length > 256 || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('Invalid GauPoints campaign scope');
  }
  return value;
}

export async function fetchMyGauPointsWallet(
  client: SupabaseClient, workspaceId: string, campaignId: string
): Promise<GauPointsWallet> {
  const { data, error } = await client.rpc('voiceup_gp_my_wallet', {
    p_workspace_id: safeScope(workspaceId), p_campaign_id: safeScope(campaignId)
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid wallet response');
  const obj = data as Record<string, unknown>;
  const balance = obj.balance;
  const lifetime = obj.lifetimeValid;
  const currentRound = obj.currentRound;
  if (!Number.isSafeInteger(balance) || Number(balance) < 0 ||
      !Number.isSafeInteger(lifetime) || Number(lifetime) < 0 ||
      !Number.isSafeInteger(currentRound) || Number(currentRound) < 0) {
    throw new Error('Invalid wallet totals');
  }
  return {
    balance: Number(balance), lifetimeValid: Number(lifetime), currentRound: Number(currentRound),
    referralCode: typeof obj.referralCode === 'string' ? obj.referralCode : null
  };
}

function parseConfiguration(data: unknown): GauPointsCampaignConfiguration {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid GauPoints configuration response");
  }
  const value = data as Record<string, unknown>;
  const integers = [
    value.verifiedSigningPoints,
    value.verifiedRegistrationReferralPoints,
    value.branchFactor,
    value.maximumRound,
    value.roundContributionPercentage
  ];
  if (integers.some((item) => !Number.isSafeInteger(item) || Number(item) < 0) ||
      typeof value.enabled !== "boolean" || typeof value.configured !== "boolean" ||
      value.distributionFormula !== "equal" || value.redeemable !== false) {
    throw new Error("Invalid GauPoints configuration response");
  }
  return {
    configured: value.configured,
    enabled: value.enabled,
    awardsEnabledAt: typeof value.awardsEnabledAt === "string" ? value.awardsEnabledAt : null,
    verifiedSigningPoints: Number(value.verifiedSigningPoints),
    verifiedRegistrationReferralPoints: Number(value.verifiedRegistrationReferralPoints),
    branchFactor: Number(value.branchFactor),
    maximumRound: Number(value.maximumRound),
    roundContributionPercentage: Number(value.roundContributionPercentage),
    distributionFormula: "equal",
    redeemable: false
  };
}

export async function fetchGauPointsConfiguration(
  client: SupabaseClient, workspaceId: string, campaignId: string
): Promise<GauPointsCampaignConfiguration> {
  const { data, error } = await client.rpc("voiceup_gp_read_campaign_configuration", {
    p_workspace_id: safeScope(workspaceId), p_campaign_id: safeScope(campaignId)
  });
  if (error) throw error;
  return parseConfiguration(data);
}

export async function saveDisabledGauPointsConfiguration(
  client: SupabaseClient,
  workspaceId: string,
  campaignId: string,
  configuration: Pick<GauPointsCampaignConfiguration,
    "verifiedSigningPoints" | "verifiedRegistrationReferralPoints" | "branchFactor" |
    "maximumRound" | "roundContributionPercentage">
): Promise<GauPointsCampaignConfiguration> {
  const values = Object.values(configuration);
  if (values.some((item) => !Number.isSafeInteger(item) || item < 0)) {
    throw new Error("Invalid GauPoints configuration");
  }
  const { data, error } = await client.rpc("voiceup_gp_save_disabled_campaign_configuration", {
    p_workspace_id: safeScope(workspaceId),
    p_campaign_id: safeScope(campaignId),
    p_verified_signing_points: configuration.verifiedSigningPoints,
    p_verified_registration_referral_points: configuration.verifiedRegistrationReferralPoints,
    p_branch_factor: configuration.branchFactor,
    p_maximum_round: configuration.maximumRound,
    p_round_contribution_percentage: configuration.roundContributionPercentage
  });
  if (error) throw error;
  return parseConfiguration(data);
}

export async function fetchGauPointsLeaderboard(
  client: SupabaseClient, workspaceId: string, campaignId: string
): Promise<GauPointsLeader[]> {
  const { data, error } = await client.rpc('voiceup_gp_public_leaderboard', {
    p_workspace_id: safeScope(workspaceId), p_campaign_id: safeScope(campaignId)
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid leaderboard response');
  return data.slice(0, 100).map((row: unknown, index: number) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid leaderboard entry');
    const item = row as Record<string, unknown>;
    const score = item.lifetimeValid ?? item.total;
    if (!Number.isSafeInteger(score) || Number(score) < 0) throw new Error('Invalid leaderboard score');
    // Public data is intentionally restricted to anonymous aliases and totals.
    return {
      rank: Number.isSafeInteger(item.rank) && Number(item.rank) > 0 ? Number(item.rank) : index + 1,
      alias: typeof item.alias === 'string' && item.alias.length <= 64 ? item.alias : `Supporter ${index + 1}`,
      lifetimeValid: Number(score)
    };
  });
}
