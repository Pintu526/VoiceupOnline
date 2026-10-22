import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edge = readFileSync(new URL("../supabase/functions/voiceup-public-campaign/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
const india = readFileSync(new URL("../src/components/IndiaLocationFields.tsx", import.meta.url), "utf8");
const options = readFileSync(new URL("../src/components/indiaLocationOptions.ts", import.meta.url), "utf8");
const manager = readFileSync(new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/components/useCampaignLocationCatalog.ts", import.meta.url), "utf8");
const publicHook = readFileSync(new URL("../src/components/usePublicCampaignLocationCatalog.ts", import.meta.url), "utf8");
const backend = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const aggregateMigration = readFileSync(
  new URL("../supabase/migrations/20260918010000_campaign_location_aggregate_reads_v2.sql", import.meta.url),
  "utf8"
);

test("public response no longer hydrates campaign location rows", () => {
  assert.match(edge, /customLocations: \[\]/u);
  assert.doesNotMatch(edge, /vboss_resource_location_paths|PUBLIC_LOCATION_PAGE_SIZE|MAX_PUBLIC_CAMPAIGN_LOCATIONS/u);
  assert.doesNotMatch(edge, /for \(let offset|\.range\(|locationIds/u);
});

test("public hierarchy reads are published-scope, service-role-only, and database aggregated", () => {
  assert.match(edge, /fetchCanonicalPublishedCampaignBySlug\(admin, slug\)/u);
  assert.match(edge, /read_public_campaign_location_hierarchy_v2/u);
  assert.match(aggregateMigration, /campaign_index\.status = 'Published'/u);
  assert.match(aggregateMigration, /path\.active/u);
  assert.match(aggregateMigration, /split_part\(path\.normalized_path, '\|', child_depth\)/u);
  assert.match(aggregateMigration, /revoke all on function public\.read_public_campaign_location_hierarchy_v2[\s\S]*from public, anon, authenticated/u);
  assert.match(aggregateMigration, /grant execute on function public\.read_public_campaign_location_hierarchy_v2[\s\S]*to service_role/u);
});

test("public browser loads only selected direct hierarchy branches", () => {
  assert.match(backend, /export async function readPublicCampaignLocationHierarchy/u);
  assert.match(publicHook, /parentPaths: Partial<CampaignLocationPath>\[\] = \[\{ country: "India" \}\]/u);
  assert.match(publicHook, /readPublicCampaignLocationHierarchy\(campaignSlug, parentPath\)/u);
  assert.doesNotMatch(publicHook, /readCampaignLocations|while \(true\)|nextOffset|limit: 500/u);
  assert.match(page, /usePublicCampaignLocationCatalog\(campaign\.slug, publicLocationForm\)/u);
  assert.match(page, /catalogStatus=\{publicCampaignLocationCatalog\.status\}/u);
});

test("public location transport remains render-only", () => {
  assert.match(app, /customLocations=\{publicCampaignPayload\?\.customLocations \?\? \[\]\}/);
  assert.doesNotMatch(app, /setPublicCampaignPayload[\s\S]{0,150}customLocations/);
  assert.doesNotMatch(page, /saveRemoteState|loadRemoteState|\.from\("vboss_resource_location/);
});

test("master options remain primary while custom hierarchy values deduplicate by parent", () => {
  assert.match(india, /getIndiaLocationOptions\(/);
  assert.match(options, /indianStatesAndUnionTerritories/);
  assert.match(options, /normalizeIndiaLocationOptionKey/);
  assert.match(options, /locationMatchesSelectedParent/);
  assert.match(options, /customStates/);
  assert.match(options, /catalogMatchesSelectedParents/);
  assert.doesNotMatch(options, /campaignStateFilter/);
});

test("Block suggestions merge canonical choices with the parent-scoped campaign overlay", () => {
  const blockOptions = options.slice(options.indexOf("const blockOptions"), options.indexOf("const panchayatOptions"));
  assert.match(blockOptions, /canonicalHierarchyAvailable/);
  assert.match(blockOptions, /getBlockOptions/);
  assert.match(blockOptions, /customBlocks/);
  assert.match(blockOptions, /false/);
  assert.match(india, /!verifiedSuggestionsOnly && blockOptions\.length === 0/);
});

test("custom lower hierarchy options require their exact selected parents", () => {
  const panchayatOptions = options.slice(options.indexOf("const panchayatOptions"), options.indexOf("const selectedCustomPath"));
  const selectedCustomPath = options.slice(options.indexOf("const selectedCustomPath"), options.indexOf("return {"));
  assert.match(panchayatOptions, /catalogMatchesSelectedParents\(location, selectedCountry, values, \["state", "district", "block"\]\)/);
  assert.match(selectedCustomPath, /catalogMatchesSelectedParents\(location, selectedCountry, values, \["state", "district", "block", "panchayat"\]\)/);
});

test("campaign catalog failure stays fail-closed while ready overlays cannot erase canonical hierarchy", () => {
  assert.match(options, /allowsStaticIndiaLocationFallback/);
  assert.match(options, /catalogStatus !== "loading" && catalogStatus !== "error"/);
  assert.match(options, /allowStaticPinDirectory/);
  assert.match(india, /allowStaticLocationFallback \? findPinCode/);
  assert.match(india, /allowStaticLocationFallback \? findLocationByPin/);
  assert.match(hook, /status: "loading"/);
  assert.match(hook, /status: "error"/);
  assert.match(hook, /status: "ready"/);
});

test("public custom locations support village and PIN suggestions without changing manual fallback", () => {
  assert.match(page, /customLocations=\{signerLocationCatalog\}/);
  assert.match(options, /location\.village/);
  assert.match(options, /location\.postalCode/);
  assert.match(india, /allowInlineAdd = false/);
});

test("existing parent clearing and signing location payload remain intact", () => {
  assert.match(india, /district: ""/);
  assert.match(india, /block: ""/);
  assert.match(india, /panchayat: ""/);
  assert.match(page, /postalCode/);
});

test("datalist-backed hierarchy inputs disable browser autocomplete", () => {
  for (const listId of ["states", "districts", "blocks", "panchayats", "villages", "pins"]) {
    assert.match(
      india,
      new RegExp(`<input[\\s\\S]*?list=\\{\`\\$\\{idPrefix\\}-${listId}\`\\}[\\s\\S]*?autoComplete="off"`)
    );
  }
});

test("Campaign Admin uses canonical hierarchy fields and public India renders one address-backed village field", () => {
  for (const field of ["country", "state", "district", "block", "panchayat", "village", "postalCode"]) {
    assert.match(manager, new RegExp(`update\\("${field}"`));
  }
  assert.match(manager, /<Field label="State">/);
  assert.match(manager, /Block \/ ULB/);
  assert.match(manager, /Panchayat \/ Ward/);
  assert.equal((page.match(/addressLabel/g) ?? []).length > 0, true);
  assert.match(page, /values=\{\{ \.\.\.publicLocationForm, address: publicForm\.address, country: "India" \}\}/);
  assert.match(page, /address: values\.address \?\? publicForm\.address/);
});
