import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/layouts/AppShell.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/pages/app/DashboardTab.tsx", import.meta.url), "utf8");
const campaigns = readFileSync(new URL("../src/pages/app/CampaignsTab.tsx", import.meta.url), "utf8");

function body(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing ${signature}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${signature}`);
}

function autosaveEffect(source) {
  const saveCall = source.indexOf("saveRemoteState(");
  assert.ok(saveCall >= 0, "missing workspace save call");
  const effectStart = source.lastIndexOf("useEffect(() => {", saveCall);
  const effectEnd = source.indexOf("}, [", saveCall);
  assert.ok(effectStart >= 0, "missing workspace autosave effect");
  assert.ok(effectEnd > saveCall, "missing workspace autosave effect dependencies");
  return source.slice(effectStart, effectEnd);
}

test("/admin/:slug always selects campaign-admin before workspace membership", () => {
  assert.match(app, /type StartupMode = "pending" \| "local-mvp" \| "saas-workspace" \| "campaign-admin"/);
  assert.match(
    app,
    /const nextMode: StartupMode = isCampaignAdminRoute\s*\?\s*"campaign-admin"\s*:\s*shouldUseSaasWorkspace/
  );
  assert.match(app, /!isCampaignAdminRoute && \(isCustomerWorkspaceAuthenticated \|\| isPlatformAdminAuthenticated\)/);
});

test("Campaign Admin loading is route-scoped and cannot fall through to workspace state", () => {
  const load = body(app, "async function loadSharedState()");
  assert.match(load, /if \(isCampaignAdminRoute && adminCampaignSlug\) \{/);
  assert.match(load, /await loadPublicCampaign\(adminCampaignSlug\)/);
  assert.ok(load.indexOf("await loadPublicCampaign(adminCampaignSlug)") < load.indexOf("await loadRemoteState()"));
});

test("Campaign Admin login and autosave never use full workspace state", () => {
  const login = body(app, "async function submitCampaignAdminLogin");
  const autosave = autosaveEffect(app);
  assert.doesNotMatch(login, /loadRemoteState\(\)/);
  const campaignAdminGuard = autosave.indexOf("isCampaignAdminRoute");
  const stateConstruction = autosave.indexOf("createRemoteState(");
  const persistence = autosave.indexOf("saveRemoteState(");
  assert.ok(campaignAdminGuard >= 0);
  assert.ok(stateConstruction > campaignAdminGuard);
  assert.ok(persistence > stateConstruction);
});

test("Campaign Admin mutation handlers deny campaign creation and destructive actions", () => {
  for (const signature of [
    "function createCampaign()",
    "function cloneCampaign()",
    "function archiveCampaign()",
    "function deleteCampaign()",
    "async function provisionCampaignAdminAccount"
  ]) {
    assert.match(body(app, signature), /if \(isCampaignAdminRoute\)/);
  }
  const save = body(app, "function saveCampaign(event: FormEvent)");
  assert.match(save, /campaignFormMode === "create"/);
  assert.match(save, /campaignAdminMarker\?\.resourceId !== activeCampaign\.id/);
  assert.match(save, /publicCampaignSlugsMatch\(campaignDraft\.slug, adminCampaignSlug\)/);
});

test("Campaign Admin UI hides workspace-wide creation, selector, and provisioning controls", () => {
  assert.match(shell, /if \(isCampaignAdminRoute\) return;\s*if \(\s*activeTab === "campaigns"/);
  assert.match(shell, /!isCampaignAdminRoute && <div className="campaign-switcher-actions">/);
  assert.doesNotMatch(shell, /onClick=\{requestCreateCampaign\}[\s\S]{0,100}campaign-admin-header-actions/);
  assert.match(dashboard, /!isCampaignAdminRoute && isTrialWorkspace/);
  assert.match(dashboard, /!isCampaignAdminRoute && !isTrialWorkspace/);
  assert.match(campaigns, /function applyTemplate\(template: CampaignTemplate\) \{\s*if \(isCampaignAdminRoute\) return;/);
  assert.match(campaigns, /\{!isCampaignAdminRoute && <>\s*<Field label=\{t\("campaignAdmin\.fields\.adminEmail"\)\}>/);
});
