import assert from "node:assert/strict";
import test from "node:test";

const developmentProjectRef = "ravweavcfrpiykfgtmbf";

function developmentConfiguration() {
  if (process.env.RUN_A11B_DEVELOPMENT_INTEGRATION !== "true") return null;
  const supabaseUrl = process.env.A11B_DEV_SUPABASE_URL?.trim();
  const anonKey = process.env.A11B_DEV_SUPABASE_ANON_KEY?.trim();
  const accessToken = process.env.A11B_DEV_USER_ACCESS_TOKEN?.trim();
  const workspaceId = process.env.A11B_DEV_WORKSPACE_ID?.trim();
  const campaignId = process.env.A11B_DEV_CAMPAIGN_ID?.trim();
  const campaignSlug = process.env.A11B_DEV_CAMPAIGN_SLUG?.trim();
  const field = process.env.A11B_DEV_CAMPAIGN_FIELD?.trim() || "district";
  if (!supabaseUrl || !anonKey || !accessToken || !workspaceId || !campaignId || !campaignSlug) return null;
  if (!supabaseUrl.includes(developmentProjectRef)) return null;
  return { supabaseUrl, anonKey, accessToken, workspaceId, campaignId, campaignSlug, field };
}

async function invoke(configuration, overrides = {}) {
  return await fetch(
    `${configuration.supabaseUrl.replace(/\/+$/u, "")}/functions/v1/voiceup-campaign-location-shadow`,
    {
      method: "POST",
      headers: {
        apikey: configuration.anonKey,
        authorization: `Bearer ${configuration.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "read_campaign_location_shadow",
        workspaceId: configuration.workspaceId,
        campaignId: configuration.campaignId,
        campaignSlug: configuration.campaignSlug,
        subject: { type: "campaign_field", field: configuration.field },
        ...overrides
      })
    }
  );
}

test("A11B Development endpoint returns authorized shadow data and rejects cross-scope requests", { timeout: 180_000 }, async (t) => {
  const configuration = developmentConfiguration();
  if (!configuration) {
    return t.skip("A11B Development integration is opt-in and requires an explicit Development user and campaign scope.");
  }

  const authorized = await invoke(configuration);
  assert.equal(authorized.status, 200);
  const authorizedBody = await authorized.json();
  assert.equal(authorizedBody.apiVersion, "v1");
  assert.equal(authorizedBody.shadowOnly, true);
  assert.equal(authorizedBody.authoritative, false);
  assert.equal(authorizedBody.scope.workspaceId, configuration.workspaceId);
  assert.equal(authorizedBody.scope.campaignId, configuration.campaignId);
  assert.equal(authorizedBody.scope.campaignSlug, configuration.campaignSlug);
  assert.equal(authorizedBody.subject.type, "campaign_field");
  assert.equal(authorizedBody.subject.field, configuration.field);
  assert.ok(["resolved", "ambiguous", "unresolved", "invalid"].includes(authorizedBody.resolution.status));
  assert.equal(typeof authorizedBody.comparison.classification, "string");

  const wrongSlug = await invoke(configuration, { campaignSlug: `${configuration.campaignSlug}-wrong` });
  assert.equal(wrongSlug.status, 403);
  assert.deepEqual(await wrongSlug.json(), { error: "forbidden" });

  const wrongWorkspace = await invoke(configuration, { workspaceId: `${configuration.workspaceId}-wrong` });
  assert.equal(wrongWorkspace.status, 403);
  assert.deepEqual(await wrongWorkspace.json(), { error: "forbidden" });
});
