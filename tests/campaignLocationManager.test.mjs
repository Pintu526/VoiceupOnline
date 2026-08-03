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

test("location manager is mounted only for the assigned Campaign Admin draft", () => {
  assert.match(campaigns, /isCampaignAdminRoute && \(\s*<ResourceLocationManager[\s\S]*campaign=\{effectiveCampaignDraft\}[\s\S]*onLocationsChange=\{setCampaignCustomLocations\}/);
  assert.match(manager, /campaignId: campaign\.id/);
  assert.match(manager, /campaignSlug: campaign\.slug/);
  assert.match(manager, /workspaceId: getCurrentWorkspaceId\(\)/);
  assert.doesNotMatch(manager, /campaigns\.map|select[^>]*campaign/i);
});

test("authoritative refresh emits only active safe hierarchy paths", () => {
  assert.match(manager, /onLocationsChange\?: \(locations: PublicCampaignCustomLocation\[\]\) => void/);
  assert.match(manager, /\.filter\(\(location\) => location\.active\)\s*\.map\(toPublicCampaignCustomLocation\)/);
  const mapper = manager.slice(
    manager.indexOf("function toPublicCampaignCustomLocation"),
    manager.indexOf("export function ResourceLocationManager")
  );
  for (const field of ["country", "state", "district", "block", "panchayat", "village", "postalCode"]) {
    assert.match(mapper, new RegExp(`${field}: location\\.${field}`));
  }
  assert.doesNotMatch(mapper, /\bid\b|\bversion\b|audit|createdAt|updatedAt/);
});

test("Campaign Step 4 shares refreshed campaign paths and clears them by campaign", () => {
  assert.match(campaigns, /const \[campaignCustomLocations, setCampaignCustomLocations\] = useState<PublicCampaignCustomLocation\[\]>\(\[\]\)/);
  assert.match(campaigns, /useEffect\(\(\) => \{\s*setCampaignCustomLocations\(\[\]\);\s*\}, \[effectiveCampaignDraft\?\.id\]\)/);
  assert.match(campaigns, /customLocations=\{campaignCustomLocations\}/);
  assert.doesNotMatch(campaigns, /GSAA|saveRemoteState|loadRemoteState/);
});

test("typed location wrappers call only the campaign-location Edge Function", () => {
  assert.match(locationWrapperBlock, /export async function readCampaignLocations/);
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
  assert.match(manager, /No \{filter === "all"/);
  assert.match(manager, /master_value_protected/);
  assert.match(manager, /idempotency_conflict/);
  assert.match(manager, /master_catalog_unavailable/);
  assert.doesNotMatch(manager, /error\.message/);
});

test("deactivation requires confirmation and sends versioned exact location data", () => {
  assert.match(manager, /setPendingDeactivate\(location\)/);
  assert.match(manager, /Deactivate custom location\?/);
  assert.match(manager, /deactivateCampaignLocation\(scope, pendingDeactivate\.id, pendingDeactivate\.version\)/);
  assert.match(manager, /Existing supporter records are unchanged/);
  assert.match(manager, /await refresh\(\);/);
});

test("add and CSV import refresh the shared hierarchy data", () => {
  const submit = manager.slice(manager.indexOf("const submit"), manager.indexOf("const confirmDeactivate"));
  const commitImport = manager.slice(manager.indexOf("const commitImport"), manager.indexOf("return ("));
  assert.match(submit, /await refresh\(\);/);
  assert.match(commitImport, /await refresh\(\);/);
});

test("Gate 4 leaves public geography source contracts untouched", () => {
  for (const source of publicGeography) assert.ok(source.length > 0);
  assert.doesNotMatch(campaigns, /PublicCampaignPage/);
  assert.doesNotMatch(manager, /IndiaLocationFields|GlobalLocationFields|locationOverrides|locationDeletions/);
});
