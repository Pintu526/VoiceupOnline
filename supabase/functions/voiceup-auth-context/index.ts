import {
  corsHeaders,
  createAdminClient,
  getUser,
  getWorkspaceRole,
  isPlatformAdmin,
  jsonResponse,
  parseJson,
  validateCustomerSession
} from "../_shared/voiceup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await parseJson(req);
    const workspaceId = String(body?.workspaceId ?? "default");
    const customerSessionToken = String(body?.customerSessionToken ?? "");
    const admin = createAdminClient();
    const user = await getUser(req);
    const platformAdmin = await isPlatformAdmin(admin, user?.id ?? null);
    const role = await getWorkspaceRole(admin, workspaceId, user?.id ?? null);
    const customerSession = await validateCustomerSession(admin, workspaceId, customerSessionToken);

    return jsonResponse({
      platformAdmin,
      workspaceMember: Boolean(role) || platformAdmin,
      customerWorkspace: Boolean(customerSession),
      role: platformAdmin ? "platform_owner" : role || customerSession?.role || "",
      email: user?.email ?? "",
      workspaceId
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to validate access." }, 500);
  }
});
