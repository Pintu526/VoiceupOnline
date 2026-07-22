import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");

test("new campaign saves invoke the existing resource-assignment path only after creation", () => {
  const saveCampaign = appSource.slice(
    appSource.indexOf("function saveCampaign(event: FormEvent)"),
    appSource.indexOf("async function assignCampaignCreator")
  );
  assert.match(saveCampaign, /if \(isCreateCommit\) void assignCampaignCreator\(campaignToCommit\)/);
  assert.doesNotMatch(saveCampaign, /signers\s*[:=]/);
});

test("creator assignment uses the authenticated member and campaign-scoped existing endpoint", () => {
  const assignment = appSource.slice(
    appSource.indexOf("async function assignCampaignCreator"),
    appSource.indexOf("async function provisionCampaignAdminAccount")
  );
  assert.match(assignment, /getCurrentAuthSession\(\), getCurrentAuthUser\(\)/);
  assert.match(assignment, /assignCurrentWorkspaceMemberAsCampaignAdmin\(\{/);
  assert.match(assignment, /campaignId: campaign\.id/);
  assert.match(assignment, /campaignSlug: campaign\.slug/);
  assert.match(assignment, /applyCampaignAdminProvisioningSuccess\(campaign, user\.email\)/);
});

test("backend self-assignment delegates to the established provision-workspace-member function", () => {
  assert.match(backendSource, /export async function assignCurrentWorkspaceMemberAsCampaignAdmin/);
  assert.match(backendSource, /selfAssign: true/);
  assert.match(backendSource, /resourceType: "campaign"/);
  assert.match(backendSource, /role: "campaign_admin"/);
});