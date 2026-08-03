import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edge = readFileSync(new URL("../supabase/functions/voiceup-public-campaign/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
const india = readFileSync(new URL("../src/components/IndiaLocationFields.tsx", import.meta.url), "utf8");
const manager = readFileSync(new URL("../src/businessOs/masterData/ResourceLocationManager.tsx", import.meta.url), "utf8");

test("public response reads only active paths from the exact published campaign scope", () => {
  assert.match(edge, /\.eq\("workspace_id", resolved\.row\.workspace_id\)/);
  assert.match(edge, /\.eq\("resource_id", resolved\.row\.campaign_id\)/);
  assert.match(edge, /\.eq\("application_key", "voiceup"\)/);
  assert.match(edge, /\.eq\("resource_type", "campaign"\)/);
  assert.match(edge, /\.eq\("active", true\)/);
  assert.match(edge, /customLocations:/);
  assert.doesNotMatch(edge, /id: location\.id|version: location\.version|actor_user_id|audit/);
});

test("public location transport remains render-only", () => {
  assert.match(app, /customLocations=\{publicCampaignPayload\?\.customLocations \?\? \[\]\}/);
  assert.doesNotMatch(app, /setPublicCampaignPayload[\s\S]{0,150}customLocations/);
  assert.doesNotMatch(page, /saveRemoteState|loadRemoteState|\.from\("vboss_resource_location/);
});

test("master options remain primary while custom hierarchy values deduplicate by parent", () => {
  assert.match(india, /mergeOptions\(indianStatesAndUnionTerritories/);
  assert.match(india, /option\.trim\(\)\.toLowerCase\(\) === value\.trim\(\)\.toLowerCase\(\)/);
  assert.match(india, /location\.state\?\.trim\(\)\.toLowerCase\(\) === values\.state\.trim\(\)\.toLowerCase\(\)/);
  assert.match(india, /location\.district\?\.trim\(\)\.toLowerCase\(\) === values\.district\.trim\(\)\.toLowerCase\(\)/);
  assert.match(india, /location\.block\?\.trim\(\)\.toLowerCase\(\) === values\.block\.trim\(\)\.toLowerCase\(\)/);
});

test("Block suggestions retain master order and require the exact country, state, and district", () => {
  const blockOptions = india.slice(india.indexOf("const blockOptions"), india.indexOf("const panchayatOptions"));
  assert.match(blockOptions, /mergeOptions\(getBlockOptions/);
  assert.match(blockOptions, /location\.country\?\.trim\(\)\.toLowerCase\(\) === selectedCountry/);
  assert.match(blockOptions, /location\.state\?\.trim\(\)\.toLowerCase\(\) === values\.state\.trim\(\)\.toLowerCase\(\)/);
  assert.match(blockOptions, /location\.district\?\.trim\(\)\.toLowerCase\(\) === values\.district\.trim\(\)\.toLowerCase\(\)/);
  assert.match(india, /!verifiedSuggestionsOnly && blockOptions\.length === 0/);
});

test("public custom locations support village and PIN suggestions without changing manual fallback", () => {
  assert.match(page, /customLocations=\{customLocations\}/);
  assert.match(india, /location\.village/);
  assert.match(india, /location\.postalCode/);
  assert.match(india, /allowInlineAdd = false/);
});

test("existing parent clearing and signing location payload remain intact", () => {
  assert.match(india, /district: ""/);
  assert.match(india, /block: ""/);
  assert.match(india, /panchayat: ""/);
  assert.match(page, /postalCode/);
});

test("Campaign Admin uses canonical hierarchy fields and public India renders one address-backed village field", () => {
  for (const field of ["country", "state", "district", "block", "panchayat", "village", "postalCode"]) {
    assert.match(manager, new RegExp(`update\\("${field}"`));
  }
  assert.match(manager, /State \/ Union Territory/);
  assert.match(manager, /Block \/ Tehsil \/ Taluk \/ ULB/);
  assert.match(manager, /Gram Panchayat \/ Ward/);
  assert.equal((page.match(/addressLabel/g) ?? []).length > 0, true);
  assert.match(page, /\{isGlobalMode && <Field label=\{isRequired\("address"\)/);
});
