import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync("src/growth/gauPoints/remote.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const module = { exports: {} };
new Function("module", "exports", js)(module, module.exports);
const {
  fetchMyGauPointsWallet,
  fetchGauPointsConfiguration,
  saveDisabledGauPointsConfiguration
} = module.exports;

function clientFor(response, calls = []) {
  return {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return response;
    }
  };
}

test("owner wallet parser includes balance, lifetime, round and referral code", async () => {
  const wallet = await fetchMyGauPointsWallet(clientFor({
    data: { balance: 500, lifetimeValid: 800, currentRound: 2, referralCode: "ABC123" }, error: null
  }), "workspace-1", "campaign-1");
  assert.deepEqual(wallet, { balance: 500, lifetimeValid: 800, currentRound: 2, referralCode: "ABC123" });
});

test("configuration reads remain campaign scoped", async () => {
  const calls = [];
  const data = {
    configured: false, enabled: false, awardsEnabledAt: null,
    verifiedSigningPoints: 500, verifiedRegistrationReferralPoints: 300,
    branchFactor: 2, maximumRound: 12, roundContributionPercentage: 50,
    distributionFormula: "equal", redeemable: false
  };
  const result = await fetchGauPointsConfiguration(clientFor({ data, error: null }, calls), "workspace-1", "campaign-1");
  assert.equal(result.enabled, false);
  assert.deepEqual(calls[0], {
    name: "voiceup_gp_read_campaign_configuration",
    args: { p_workspace_id: "workspace-1", p_campaign_id: "campaign-1" }
  });
});

test("admin save RPC has no activation parameter", async () => {
  const calls = [];
  const data = {
    configured: true, enabled: false, awardsEnabledAt: null,
    verifiedSigningPoints: 600, verifiedRegistrationReferralPoints: 250,
    branchFactor: 3, maximumRound: 8, roundContributionPercentage: 40,
    distributionFormula: "equal", redeemable: false
  };
  await saveDisabledGauPointsConfiguration(clientFor({ data, error: null }, calls), "workspace-1", "campaign-1", {
    verifiedSigningPoints: 600,
    verifiedRegistrationReferralPoints: 250,
    branchFactor: 3,
    maximumRound: 8,
    roundContributionPercentage: 40
  });
  assert.equal("p_enabled" in calls[0].args, false);
  assert.equal("p_awards_enabled_at" in calls[0].args, false);
});

test("supporter and Campaign Admin surfaces are opt-in and correctly scoped", () => {
  const account = fs.readFileSync("src/pages/VoiceupAccountPage.tsx", "utf8");
  assert.match(account, /<SupporterDashboardV2/);
  const supporter = fs.readFileSync("src/pages/SupporterDashboardV2.tsx", "utf8");
  assert.match(supporter, /<GauPointsPanel/);
  assert.match(supporter, /VITE_GAUPOINTS_READ_ONLY === "true"/);
  assert.match(supporter, /import\.meta\.env\.DEV/);
  const admin = fs.readFileSync("src/growth/gauPoints/GauPointsAdminPanel.tsx", "utf8");
  const growth = fs.readFileSync("src/pages/app/GrowthDashboardTab.tsx", "utf8");
  assert.match(supporter, /workspaceId=\{dashboard\.account\.workspaceId\}/);
  assert.match(supporter, /campaignId=\{dashboard\.campaign\.id\}/);
  assert.match(supporter, /signedIn=\{true\}/);
  assert.match(admin, /Save disabled configuration/);
  assert.doesNotMatch(admin, /enable issuance|activate rewards/i);
  assert.match(growth, /VITE_GAUPOINTS_READ_ONLY === "true"/);
});

test("Connected Modules exposes the existing GauPoints surface only in Development read-only mode", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const navButton = fs.readFileSync("src/components/NavButton.tsx", "utf8");
  const shell = fs.readFileSync("src/layouts/AppShell.tsx", "utf8");
  const preview = fs.readFileSync("src/growth/gauPoints/GauPointsDashboardPreview.tsx", "utf8");

  assert.match(navButton, /\| "gaupoints"/);
  assert.match(app, /"growth", "gaupoints", "scans"/);
  assert.match(shell, /VITE_GAUPOINTS_READ_ONLY === "true"/);
  assert.match(shell, /label="GauPoints"/);
  assert.match(shell, /tab="gaupoints"/);
  assert.match(shell, /activeTab === "gaupoints"/);
  assert.match(shell, /<GauPointsDashboardPreview campaignId=\{activeCampaign\.id\}/);
  assert.match(preview, /<GauPointsPanel/);
  assert.match(preview, /<GauPointsAdminPanel/);
});
