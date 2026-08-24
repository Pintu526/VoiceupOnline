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

test("public response reads only active paths from the exact published campaign scope", () => {
  assert.match(edge, /\.eq\("workspace_id", resolved\.row\.workspace_id\)/);
  assert.match(edge, /\.eq\("resource_id", resolved\.row\.campaign_id\)/);
  assert.match(edge, /\.eq\("application_key", "voiceup"\)/);
  assert.match(edge, /\.eq\("resource_type", "campaign"\)/);
  assert.match(edge, /\.eq\("active", true\)/);
  assert.match(edge, /customLocations:/);
  assert.doesNotMatch(edge, /id: location\.id|version: location\.version|actor_user_id|audit/);
});

test("public location loading retrieves every bounded page in stable order", () => {
  assert.match(edge, /const PUBLIC_LOCATION_PAGE_SIZE = 1_000/);
  assert.match(edge, /\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(edge, /for \(let offset = 0; offset < count; offset \+= PUBLIC_LOCATION_PAGE_SIZE\)/);
  assert.match(edge, /\.order\("normalized_path"\)\s*\.order\("id"\)\s*\.range\(offset, offset \+ PUBLIC_LOCATION_PAGE_SIZE - 1\)/);
});

test("public location loading rejects partial or duplicate page results", () => {
  assert.match(edge, /MAX_PUBLIC_CAMPAIGN_LOCATIONS = 60_000/);
  assert.match(edge, /Campaign location set exceeds the public response safety limit/);
  assert.match(edge, /locationIds\.has\(location\.id\)/);
  assert.match(edge, /Campaign location pagination returned a duplicate row/);
  assert.match(edge, /if \(locations\.length !== count\)/);
  assert.match(edge, /Campaign location pagination did not return the complete location set/);
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

test("Block suggestions retain catalog-only options when the VBOSS catalog is in play", () => {
  const blockOptions = options.slice(options.indexOf("const blockOptions"), options.indexOf("const panchayatOptions"));
  assert.match(blockOptions, /useCatalogOnly/);
  assert.match(blockOptions, /getBlockOptions/);
  assert.match(blockOptions, /catalogMatchesSelectedParents\(location, selectedCountry, values, \["state", "district"\]\)/);
  assert.match(india, /!verifiedSuggestionsOnly && blockOptions\.length === 0/);
});

test("custom lower hierarchy options require their exact selected parents", () => {
  const panchayatOptions = options.slice(options.indexOf("const panchayatOptions"), options.indexOf("const selectedCustomPath"));
  const selectedCustomPath = options.slice(options.indexOf("const selectedCustomPath"), options.indexOf("return {"));
  assert.match(panchayatOptions, /catalogMatchesSelectedParents\(location, selectedCountry, values, \["state", "district", "block"\]\)/);
  assert.match(selectedCustomPath, /catalogMatchesSelectedParents\(location, selectedCountry, values, \["state", "district", "block", "panchayat"\]\)/);
});

test("static geography and PIN directory cannot bypass a VBOSS catalog state", () => {
  assert.match(options, /allowsStaticIndiaLocationFallback/);
  assert.match(options, /useCatalogOnly/);
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
