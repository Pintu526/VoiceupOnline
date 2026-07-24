import {
  corsHeaders,
  createAdminClient,
  getCampaigns,
  getPlanLimit,
  jsonResponse,
  parseJson,
  refreshPublicCampaignIndex,
  requireWorkspaceAccess,
  subscriptionBlockReason
} from "../_shared/voiceup.ts";
import {
  mergeWorkspaceStateForSave,
  nextWorkspaceUpdatedAt,
  workspaceStatesEqual
} from "../_shared/workspaceStateMerge.ts";

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

async function readVersionedWorkspace(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string
) {
  const { data, error } = await admin
    .from("voiceup_workspaces")
    .select("data,updated_at")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return {
    state: data?.data ?? null,
    updatedAt: data?.updated_at ? String(data.updated_at) : null
  };
}

async function saveVersionedWorkspace(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  requestedState: Record<string, unknown>,
  baseState: Record<string, unknown>,
  expectedUpdatedAt: string | null
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await readVersionedWorkspace(admin, workspaceId);
    if (snapshot.updatedAt !== expectedUpdatedAt) {
      throw jsonResponse({
        error: "Workspace changed after it was loaded. Reload before saving.",
        code: "workspace_state_conflict",
        retryable: true
      }, 409);
    }
    if (!workspaceStatesEqual(snapshot.state ?? {}, baseState)) {
      throw jsonResponse({
        error: "Workspace baseline does not match the loaded version. Reload before saving.",
        code: "workspace_state_conflict",
        retryable: true
      }, 409);
    }

    const merged = mergeWorkspaceStateForSave(
      snapshot.state ?? {},
      requestedState,
      baseState,
      baseState
    );
    if (merged.conflicts.length > 0) {
      throw jsonResponse({
        error: "Public participation changed while the workspace was being edited. Reload before saving.",
        code: "workspace_participation_conflict",
        retryable: true
      }, 409);
    }
    validateStateChange(snapshot.state, merged.state);
    const nextUpdatedAt = nextWorkspaceUpdatedAt(snapshot.updatedAt);

    if (!snapshot.state) {
      const { error } = await admin
        .from("voiceup_workspaces")
        .insert({ id: workspaceId, data: merged.state, updated_at: nextUpdatedAt });
      if (error?.code === "23505") continue;
      if (error) throw error;
      return { state: merged.state, updatedAt: nextUpdatedAt };
    }

    let update = admin
      .from("voiceup_workspaces")
      .update({ data: merged.state, updated_at: nextUpdatedAt })
      .eq("id", workspaceId);
    update = snapshot.updatedAt
      ? update.eq("updated_at", snapshot.updatedAt)
      : update.is("updated_at", null);
    const { data: updated, error } = await update
      .select("updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!updated) continue;
    return {
      state: merged.state,
      updatedAt: updated.updated_at ? String(updated.updated_at) : nextUpdatedAt
    };
  }

  throw jsonResponse({
    error: "Workspace changed repeatedly while saving. Reload before retrying.",
    code: "workspace_state_conflict",
    retryable: true
  }, 409);
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
      const snapshot = await readVersionedWorkspace(admin, workspaceId);
      return jsonResponse({
        state: snapshot.state,
        baseState: snapshot.state ?? {},
        updatedAt: snapshot.updatedAt
      });
    }

    if (action === "save") {
      const nextState = body?.state;
      if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
        return jsonResponse({ error: "State payload is required." }, 400);
      }
      const hasExpectedUpdatedAt = Object.prototype.hasOwnProperty.call(body ?? {}, "expectedUpdatedAt");
      const baseState = body?.baseState;
      if (
        !hasExpectedUpdatedAt
        || !baseState
        || typeof baseState !== "object"
        || Array.isArray(baseState)
      ) {
        return jsonResponse({
          error: "Reload the workspace before saving.",
          code: "workspace_save_baseline_required",
          retryable: true
        }, 409);
      }
      const expectedUpdatedAt = body.expectedUpdatedAt === null
        ? null
        : String(body.expectedUpdatedAt ?? "");
      if (expectedUpdatedAt !== null && !expectedUpdatedAt) {
        return jsonResponse({
          error: "Reload the workspace before saving.",
          code: "workspace_save_baseline_required",
          retryable: true
        }, 409);
      }
      const saved = await saveVersionedWorkspace(
        admin,
        workspaceId,
        nextState,
        baseState,
        expectedUpdatedAt
      );
      await refreshPublicCampaignIndex(admin, workspaceId, saved.state);
      return jsonResponse({ ok: true, state: saved.state, updatedAt: saved.updatedAt });
    }

    return jsonResponse({ error: "Unsupported workspace action." }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: error instanceof Error ? error.message : "Workspace state request failed." }, 500);
  }
});
