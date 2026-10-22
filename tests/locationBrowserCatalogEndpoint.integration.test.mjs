import assert from "node:assert/strict";
import test from "node:test";

const developmentProjectRef = "ravweavcfrpiykfgtmbf";

function configuration() {
  if (process.env.RUN_STEP8_DEVELOPMENT_INTEGRATION !== "true") return null;
  const supabaseUrl = process.env.STEP8_DEV_SUPABASE_URL?.trim();
  const anonKey = process.env.STEP8_DEV_SUPABASE_ANON_KEY?.trim();
  const accessToken = process.env.STEP8_DEV_USER_ACCESS_TOKEN?.trim();
  const workspaceId = process.env.STEP8_DEV_WORKSPACE_ID?.trim();
  if (!supabaseUrl || !anonKey || !accessToken || !workspaceId || !supabaseUrl.includes(developmentProjectRef)) return null;
  return { supabaseUrl, anonKey, accessToken, workspaceId };
}

async function invoke(config, body, includeUser = true) {
  return await fetch(`${config.supabaseUrl.replace(/\/+$/u, "")}/functions/v1/voiceup-location-catalog-v1`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      ...(includeUser ? { authorization: `Bearer ${config.accessToken}` } : {}),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

test("Step 8 Development gateway reads the active LGD catalog and rejects unauthenticated workspace access", { timeout: 180_000 }, async (t) => {
  const config = configuration();
  if (!config) return t.skip("Step 8 Development integration is opt-in and the new endpoint is intentionally not deployed by this implementation step.");

  const body = {
    action: "read_canonical_location_catalog",
    access: { type: "workspace", workspaceId: config.workspaceId },
    query: { operation: "metadata" }
  };
  const authorized = await invoke(config, body);
  assert.equal(authorized.status, 200);
  const result = await authorized.json();
  assert.equal(result.apiVersion, "v1");
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.dataset, {
    authority: "LGD",
    sourceDataset: "india-lgd",
    datasetVersion: "lgd-2026-08-27"
  });

  const unauthenticated = await invoke(config, body, false);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { error: "unauthorized" });
});
