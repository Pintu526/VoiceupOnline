import { getSupporterAuthClient } from "./supporterAuth.ts";

export interface SupporterAccountClaimGrant {
  token: string;
  expiresAt: string;
}

export interface SupporterAccountLink {
  accountId: string;
  workspaceId: string;
  campaignId: string;
  supporterId: string;
  claimedAt: string;
}

export type SupporterAccountClaimErrorCode =
  | "supporter_claim_unavailable"
  | "supporter_claim_authentication_required"
  | "supporter_claim_email_confirmation_required"
  | "supporter_claim_invalid"
  | "supporter_claim_failed"
  | "supporter_profile_read_failed";

export class SupporterAccountClaimError extends Error {
  readonly code: SupporterAccountClaimErrorCode;

  constructor(code: SupporterAccountClaimErrorCode) {
    super(code);
    this.name = "SupporterAccountClaimError";
    this.code = code;
  }
}

interface SupporterAccountRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown | null }>;
  from(table: string): {
    select(columns: string): PromiseLike<{ data: unknown; error: unknown | null }>;
  };
}

function accountClient(): SupporterAccountRpcClient {
  return getSupporterAuthClient() as unknown as SupporterAccountRpcClient;
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  return String(error.message);
}

function claimError(error: unknown): SupporterAccountClaimError {
  const message = errorMessage(error);
  if (message.includes("voiceup:authentication_required")) {
    return new SupporterAccountClaimError("supporter_claim_authentication_required");
  }
  if (message.includes("voiceup:verified_email_required")) {
    return new SupporterAccountClaimError("supporter_claim_email_confirmation_required");
  }
  if (
    message.includes("voiceup:claim_grant_invalid")
    || message.includes("voiceup:supporter_already_claimed")
    || message.includes("voiceup:claim_grant_already_consumed")
  ) {
    return new SupporterAccountClaimError("supporter_claim_invalid");
  }
  return new SupporterAccountClaimError("supporter_claim_failed");
}

function parseAccountLink(value: unknown): SupporterAccountLink | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const accountId = String(row.accountId ?? row.id ?? "");
  const workspaceId = String(row.workspaceId ?? row.workspace_id ?? "");
  const campaignId = String(row.campaignId ?? row.campaign_id ?? "");
  const supporterId = String(row.supporterId ?? row.supporter_id ?? "");
  const claimedAt = String(row.claimedAt ?? row.claimed_at ?? "");
  if (!accountId || !workspaceId || !campaignId || !supporterId || !claimedAt) return null;
  return { accountId, workspaceId, campaignId, supporterId, claimedAt };
}

export function isSupporterClaimGrant(
  value: SupporterAccountClaimGrant | null | undefined
): value is SupporterAccountClaimGrant {
  if (!value || !/^vusc_[0-9a-f]{64}$/.test(value.token)) return false;
  const expiry = Date.parse(value.expiresAt);
  return Number.isFinite(expiry);
}

export function isUsableSupporterClaimGrant(
  value: SupporterAccountClaimGrant | null | undefined,
  now = Date.now()
): value is SupporterAccountClaimGrant {
  return isSupporterClaimGrant(value) && Date.parse(value.expiresAt) > now;
}

export async function claimSupporterAccount(
  grant: SupporterAccountClaimGrant,
  client = accountClient()
): Promise<SupporterAccountLink> {
  if (!isUsableSupporterClaimGrant(grant)) {
    throw new SupporterAccountClaimError("supporter_claim_invalid");
  }

  const { data, error } = await client.rpc("voiceup_claim_supporter_account", {
    p_claim_token: grant.token
  });
  if (error) throw claimError(error);

  const link = parseAccountLink(data);
  if (!link) throw new SupporterAccountClaimError("supporter_claim_failed");
  return link;
}

export async function readOwnSupporterAccountLinks(
  client = accountClient()
): Promise<SupporterAccountLink[]> {
  const { data, error } = await client
    .from("voiceup_supporter_accounts")
    .select("id,workspace_id,campaign_id,supporter_id,claimed_at");
  if (error || !Array.isArray(data)) {
    throw new SupporterAccountClaimError("supporter_profile_read_failed");
  }
  return data.map(parseAccountLink).filter((link): link is SupporterAccountLink => Boolean(link));
}

export function findLinkedSupporterAccount(
  links: SupporterAccountLink[],
  campaignId: string,
  supporterId: string
): SupporterAccountLink | null {
  return links.find(
    (link) => link.campaignId === campaignId && link.supporterId === supporterId
  ) ?? null;
}
