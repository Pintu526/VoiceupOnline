import { getSupporterAuthClient } from "./supporterAuth.ts";
import type { SupporterAccountClaimGrant } from "./supporterAccountClaim.ts";

export interface PublicSupporterRoutingPrecheck {
  routingToken: string;
  expiresAt: string;
}

export type AuthenticatedSupporterRoute =
  | "eligible_to_sign"
  | "existing_participation"
  | "claim_available"
  | "identity_not_linked";

export interface AuthenticatedSupporterRoutingResult {
  route: AuthenticatedSupporterRoute;
  accountId?: string;
  claimGrant?: SupporterAccountClaimGrant;
}

export class SupporterRoutingError extends Error {
  readonly code: string;
  constructor(code = "routing_unavailable") {
    super(code);
    this.name = "SupporterRoutingError";
    this.code = code;
  }
}

type InvokeResponse = {
  ok?: boolean;
  routingToken?: string;
  expiresAt?: string;
  route?: AuthenticatedSupporterRoute;
  accountId?: string;
  claimGrant?: SupporterAccountClaimGrant;
  error?: string;
  code?: string;
};

interface SupporterRoutingClient {
  functions: {
    invoke<T>(
      functionName: string,
      options: { body: Record<string, unknown> }
    ): Promise<{ data: T | null; error: unknown | null }>;
  };
  rpc(
    functionName: string,
    parameters: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown | null }>;
}

function routingClient(): SupporterRoutingClient {
  return getSupporterAuthClient() as unknown as SupporterRoutingClient;
}

function isRoutingToken(value: unknown): value is string {
  return typeof value === "string" && /^vusr_[0-9a-f]{64}$/.test(value);
}

export async function precheckPublicSupporterRouting(
  slug: string,
  phone: string
): Promise<PublicSupporterRoutingPrecheck> {
  const client = routingClient();
  const { data, error } = await client.functions.invoke<InvokeResponse>("voiceup-supporter-routing", {
    body: { action: "precheck", slug, phone }
  });
  if (error || data?.error || !isRoutingToken(data?.routingToken) || !data?.expiresAt) {
    throw new SupporterRoutingError(data?.code ?? "routing_unavailable");
  }
  return { routingToken: data.routingToken, expiresAt: data.expiresAt };
}

export async function resolveAuthenticatedSupporterRouting(
  slug: string,
  routingToken: string
): Promise<AuthenticatedSupporterRoutingResult> {
  if (!isRoutingToken(routingToken)) throw new SupporterRoutingError("routing_token_invalid");
  const client = routingClient();
  const { data, error } = await client.functions.invoke<InvokeResponse>("voiceup-supporter-routing", {
    body: { action: "resolve", slug, routingToken }
  });
  if (error || data?.error || !data?.route) {
    throw new SupporterRoutingError(data?.code ?? "routing_unavailable");
  }
  return {
    route: data.route,
    accountId: data.accountId,
    claimGrant: data.claimGrant
  };
}

export async function claimHistoricalSupporterRoutingGrant(
  grant: SupporterAccountClaimGrant
): Promise<void> {
  if (!/^vusc_[0-9a-f]{64}$/.test(grant.token) || Date.parse(grant.expiresAt) <= Date.now()) {
    throw new SupporterRoutingError("claim_grant_invalid");
  }
  const { data, error } = await routingClient().rpc(
    "voiceup_claim_historical_supporter_account",
    { p_claim_token: grant.token }
  );
  if (error || !data || typeof data !== "object" || (data as { claimed?: unknown }).claimed !== true) {
    throw new SupporterRoutingError("claim_grant_invalid");
  }
}

const storagePrefix = "voiceup-supporter-routing-v1:";

export function writeSupporterRoutingPrecheck(
  campaignId: string,
  precheck: PublicSupporterRoutingPrecheck
): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`${storagePrefix}${campaignId}`, JSON.stringify(precheck));
}

export function readSupporterRoutingPrecheck(
  campaignId: string,
  now = Date.now()
): PublicSupporterRoutingPrecheck | null {
  if (typeof window === "undefined") return null;
  const key = `${storagePrefix}${campaignId}`;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as Partial<PublicSupporterRoutingPrecheck> | null;
    if (!parsed || !isRoutingToken(parsed.routingToken) || !parsed.expiresAt || Date.parse(parsed.expiresAt) <= now) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return { routingToken: parsed.routingToken, expiresAt: parsed.expiresAt };
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function clearSupporterRoutingPrecheck(campaignId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(`${storagePrefix}${campaignId}`);
}
