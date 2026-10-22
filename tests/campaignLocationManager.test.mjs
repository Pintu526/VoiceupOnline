import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backend = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const locationWrapperBlock = backend.slice(
  backend.indexOf("type CampaignLocationFunctionResponse"),
  backend.indexOf("export async function requestOtp")
);
const manager = readFileSync(
  new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url),
  "utf8"
);
const campaigns = readFileSync(new URL("../src/pages/app/CampaignsTab.tsx", import.meta.url), "utf8");
const publicGeography = [
  "../src/geography.ts",
  "../src/components/IndiaLocationFields.tsx",
  "../src/components/GlobalLocationFields.tsx",
  "../src/pages/PublicCampaignPage.tsx"
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

test("location manager is mounted for saved Campaign Admin and workspace Plan drafts", () => {
  assert.match(campaigns, /campaignFormMode === "edit" && \(\s*<ResourceLocationManager[\s\S]*campaign=\{effectiveCampaignDraft\}[\s\S]*onLocationsChanged=/);
  assert.match(manager, /campaignId: campaign\.id/);
  assert.match(manager, /campaignSlug: campaign\.slug/);
  assert.match(manager, /workspaceId: getCurrentWorkspaceId\(\)/);
  assert.doesNotMatch(manager, /campaigns\.map|select[^>]*campaign/i);
});

test("manager notifies the lazy hierarchy catalog after custom-location mutations", () => {
  assert.match(manager, /onLocationsChanged\?: \(\) => void/);
  assert.match(manager, /onLocationsChanged\?\.\(\)/);
  assert.doesNotMatch(manager, /toPublicCampaignCustomLocation|onLocationsChange\?\.\([\s\S]*locations/);
});

test("Campaign Step 4 reads only the selected lazy hierarchy and invalidates it after mutations", () => {
  assert.match(campaigns, /useCampaignLocationCatalog\([\s\S]*effectiveCampaignDraft \?\? activeCampaign[\s\S]*campaignLocationCatalogRevision/);
  assert.match(campaigns, /onLocationsChanged=\{\(\) => setCampaignLocationCatalogRevision/);
  assert.match(campaigns, /customLocations=\{campaignLocationCatalog\}/);
  assert.doesNotMatch(campaigns, /GSAA|saveRemoteState|loadRemoteState/);
});

test("typed location wrappers call only the campaign-location Edge Function", () => {
  assert.match(locationWrapperBlock, /export async function readCampaignLocations/);
  assert.match(locationWrapperBlock, /export async function readCampaignLocationHierarchy/);
  assert.match(locationWrapperBlock, /export async function readCampaignLocationSummary/);
  assert.match(locationWrapperBlock, /export async function addCampaignLocation/);
  assert.match(locationWrapperBlock, /export async function deactivateCampaignLocation/);
  assert.match(locationWrapperBlock, /"voiceup-campaign-locations"/);
  assert.doesNotMatch(locationWrapperBlock, /loadRemoteState\(/);
  assert.doesNotMatch(locationWrapperBlock, /saveRemoteState\(/);
  assert.doesNotMatch(locationWrapperBlock, /\.from\(|\.insert\(|\.update\(|\.delete\(/);
});

test("manager supplies hierarchy validation, India PIN validation, and idempotency", () => {
  assert.match(manager, /Each location level needs its parent level/);
  assert.match(manager, /\^\\d\{6\}\$/);
  assert.match(manager, /addCampaignLocation\(scope, cleaned, idempotencyKey\(\)\)/);
  assert.match(manager, /value\.slice\(0, 120\)/);
  assert.match(manager, /Path preview:/);
});

test("manager renders safe location states and stable API errors", () => {
  assert.match(manager, /Loading locations/);
  assert.match(manager, /No \{activeTab\} custom locations match this page/);
  assert.match(manager, /master_value_protected/);
  assert.match(manager, /idempotency_conflict/);
  assert.match(manager, /master_catalog_unavailable/);
  assert.doesNotMatch(manager, /error\.message/);
});

test("campaign location coverage uses server summary metadata without hydrating location rows", () => {
  assert.match(manager, /readCampaignLocationSummary\(scope\)/);
  assert.doesNotMatch(manager, /countUniqueActiveLocationValues|new Set\(locations/);
  assert.match(manager, /Campaign Locations/);
  for (const field of ["states", "districts", "blocks", "panchayats", "villages", "pins"]) {
    assert.match(manager, new RegExp(`summary\\?\\.coverage\\.${field}`));
  }
});

test("deactivation requires confirmation and sends versioned exact location data", () => {
  assert.match(manager, /setPendingDeactivate\(location\)/);
  assert.match(manager, /Deactivate custom location\?/);
  assert.match(manager, /deactivateCampaignLocation\(scope, pendingDeactivate\.id, pendingDeactivate\.version\)/);
  assert.match(manager, /Existing supporter records are unchanged/);
  assert.match(manager, /refreshLocationsPage\(pageOffset\)/);
  assert.match(manager, /refreshSummary\(\)/);
});

test("add and CSV import refresh summary and invalidate the lazy hierarchy data", () => {
  const submit = manager.slice(manager.indexOf("const submit"), manager.indexOf("const confirmDeactivate"));
  const commitImport = manager.slice(
    manager.indexOf("const commitImport"),
    manager.indexOf("return (\n    <section")
  );
  assert.match(submit, /await refreshSummary\(\);/);
  assert.match(submit, /onLocationsChanged\?\.\(\)/);
  assert.match(commitImport, /await refreshSummary\(\);/);
  assert.match(commitImport, /onLocationsChanged\?\.\(\)/);
});

test("overview and administration lists have independent loading states", () => {
  assert.match(manager, /summaryLoading/);
  assert.match(manager, /locationsLoading/);
  assert.match(manager, /Loading summary/);
  assert.match(manager, /Loading locations/);
});

test("manager organizes existing content into accessible local tabs", () => {
  assert.match(manager, /useState<"overview" \| "manual" \| "import" \| "active" \| "inactive">\("overview"\)/);
  assert.match(manager, /role="tablist"/);
  for (const tab of ["Overview", "Manual Add", "Bulk Import", "Active Locations", "Inactive Locations"]) {
    assert.match(manager, new RegExp(`\\["[^"]+", "${tab}"\\]`));
  }
  assert.match(manager, /activeTab === "overview"/);
  assert.match(manager, /activeTab === "manual"/);
  assert.match(manager, /activeTab === "import"/);
  assert.match(manager, /activeTab === "active" \|\| activeTab === "inactive"/);
  assert.match(manager, /role="tabpanel"/);
});

test("tabs reuse existing overview, form, import, list, and refresh handlers", () => {
  const overview = manager.slice(manager.indexOf('activeTab === "overview"'), manager.indexOf('activeTab === "import"'));
  const manual = manager.slice(manager.indexOf('activeTab === "manual"'), manager.indexOf('activeTab === "active" || activeTab === "inactive"'));
  const bulkImport = manager.slice(manager.indexOf('activeTab === "import"'), manager.indexOf('activeTab === "manual"'));
  const lists = manager.slice(manager.indexOf('activeTab === "active" || activeTab === "inactive"'), manager.indexOf("{pendingDeactivate"));
  assert.match(overview, /Campaign Locations|configurationVersion|void refresh\(\)/);
  assert.match(manual, /onSubmit=\{submit\}|Add custom location/);
  assert.match(bulkImport, /validateImport|commitImport|Download Template|Download Errors CSV/);
  assert.match(lists, /visibleLocations\.map|setPendingDeactivate\(location\)/);
  assert.match(lists, /Previous|Next|Refresh page/);
  assert.match(manager, /if \(tab === "active" \|\| tab === "inactive"\) setPageOffset\(0\)/);
});

test("Gate 4 leaves public geography source contracts untouched", () => {
  for (const source of publicGeography) assert.ok(source.length > 0);
  assert.doesNotMatch(campaigns, /PublicCampaignPage/);
  assert.doesNotMatch(manager, /IndiaLocationFields|GlobalLocationFields|locationOverrides|locationDeletions/);
});
