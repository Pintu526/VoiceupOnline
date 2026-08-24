/**
 * DEV-ONLY seed. Fail closed unless targeting ravweavcfrpiykfgtmbf.
 * Uses existing writeWorkspace + refreshPublicCampaignIndex.
 */
import {
  createAdminClient,
  writeWorkspace,
  refreshPublicCampaignIndex
} from "../supabase/functions/_shared/voiceup.ts";
import {
  goudhanGauSammanCampaign,
  goudhanProductionOrganization
} from "../src/config/goudhanCampaignBlueprint.ts";
import {
  initialCommercialPackages,
  initialIntegrationSettings
} from "../src/data.ts";

const REQUIRED_HOST = "ravweavcfrpiykfgtmbf.supabase.co";
const REQUIRED_CAMPAIGN_ID = "cmp-goudhan-gau-samman";
const REQUIRED_SLUG = "gau-samman-ahvaan-abhiyan";

function assertDevTarget() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    throw new Error("SUPABASE_URL is invalid.");
  }
  if (host !== REQUIRED_HOST) {
    throw new Error(`Refusing to run: host ${host} is not DEV ${REQUIRED_HOST}`);
  }
}

function buildNewWorkspaceId() {
  return `workspace-dev-gau-samman-${Date.now()}`;
}

function buildRemoteState() {
  const campaign = { ...goudhanGauSammanCampaign };
  if (campaign.id !== REQUIRED_CAMPAIGN_ID) {
    throw new Error(`Unexpected campaign id: ${campaign.id}`);
  }
  if (campaign.slug !== REQUIRED_SLUG) {
    throw new Error(`Unexpected campaign slug: ${campaign.slug}`);
  }
  if (campaign.status !== "Published") {
    throw new Error(`Campaign must be Published, got: ${campaign.status}`);
  }

  return {
    campaigns: [campaign],
    activeCampaignId: REQUIRED_CAMPAIGN_ID,
    signers: [],
    authorities: [],
    organization: goudhanProductionOrganization,
    scanItems: [],
    locationOverrides: {},
    locationDeletions: { districts: [], blocks: [], panchayats: [] },
    auditLogs: [],
    integrations: initialIntegrationSettings,
    commercialPackages: initialCommercialPackages
  };
}

async function main() {
  assertDevTarget();
  const admin = createAdminClient();
  const workspaceId = buildNewWorkspaceId();

  // Prove we are not overwriting: new id must not already exist
  const { data: existing, error: readError } = await admin
    .from("voiceup_workspaces")
    .select("id,data")
    .eq("id", workspaceId)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) {
    throw new Error(`Workspace id unexpectedly exists: ${workspaceId}`);
  }

  const state = buildRemoteState();

  // Existing mechanism #1
  await writeWorkspace(admin, workspaceId, state);

  // Existing mechanism #2
  await refreshPublicCampaignIndex(admin, workspaceId, state);

  console.log(
    JSON.stringify(
      {
        ok: true,
        project: REQUIRED_HOST,
        workspaceId,
        campaignId: REQUIRED_CAMPAIGN_ID,
        slug: REQUIRED_SLUG,
        status: "Published"
      },
      null,
      2
    )
  );
}

main();
