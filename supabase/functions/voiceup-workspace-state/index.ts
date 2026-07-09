import {
  corsHeaders,
  createAdminClient,
  getCampaigns,
  getPlanLimit,
  jsonResponse,
  parseJson,
  readWorkspace,
  refreshPublicCampaignIndex,
  requireWorkspaceAccess,
  subscriptionBlockReason,
  writeWorkspace
} from "../_shared/voiceup.ts";

function validateStateChange(previousState: any, nextState: any) {
  const organization = nextState?.organization;
  const subscriptionReason = subscriptionBlockReason(organization);
  if (subscriptionReason) {
    throw new Error(subscriptionReason);
  }

  const previousCampaigns = getCampaigns(previousState);
  const nextCampaigns = getCampaigns(nextState);
  const planLimit = getPlanLimit(organization?.plan);
  if (planLimit !== "Unlimited" && nextCampaigns.length > planLimit) {
    throw new Error(`The ${organization?.plan ?? "current"} plan allows ${planLimit} campaign(s).`);
  }

  if (nextCampaigns.length > previousCampaigns.length && planLimit !== "Unlimited" && previousCampaigns.length >= planLimit) {
    throw new Error(`Campaign creation requires an upgraded plan.`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await parseJson(req);
    const workspaceId = String(body?.workspaceId ?? "default");
    const action = String(body?.action ?? "load");
    const customerSessionToken = String(body?.customerSessionToken ?? "");
    const admin = createAdminClient();

    await requireWorkspaceAccess(req, admin, workspaceId, customerSessionToken);

    if (action === "load") {
      return jsonResponse({ state: await readWorkspace(admin, workspaceId) });
    }

    if (action === "save") {
      const nextState = body?.state;
      if (!nextState || typeof nextState !== "object") {
        return jsonResponse({ error: "State payload is required." }, 400);
      }
      const previousState = await readWorkspace(admin, workspaceId);
      validateStateChange(previousState, nextState);
      await writeWorkspace(admin, workspaceId, nextState);
      await refreshPublicCampaignIndex(admin, workspaceId, nextState);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unsupported workspace action." }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Workspace state request failed." }, 500);
  }
});
