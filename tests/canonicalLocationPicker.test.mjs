import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const picker = readFileSync(path.join(repoRoot, "src/businessOs/location/ui/CanonicalLocationPicker.tsx"), "utf8");
const model = readFileSync(path.join(repoRoot, "src/businessOs/location/ui/CanonicalLocationUiModel.ts"), "utf8");
const hook = readFileSync(path.join(repoRoot, "src/businessOs/location/ui/useCanonicalLocationUi.ts"), "utf8");
const barrel = readFileSync(path.join(repoRoot, "src/businessOs/location/ui/index.ts"), "utf8");

test("picker exposes deterministic async, empty, error, retry, clear, and disabled semantics", () => {
  assert.match(picker, /data-state=\{state\.status\}/u);
  assert.match(picker, /aria-busy=\{state\.status === "loading"\}/u);
  assert.match(picker, /role="status"/u);
  assert.match(picker, /role="alert"/u);
  assert.match(picker, /canonical-location-empty-/u);
  assert.match(picker, /canonical-location-retry/u);
  assert.match(picker, /canonical-location-clear/u);
  assert.match(picker, /onClear\?\.\(\)/u);
  assert.match(picker, /<fieldset[\s\S]*disabled=\{disabled\}/u);
});

test("controls have associated labels, native keyboard support, and explicit ambiguity keyboard handling", () => {
  assert.match(picker, /<label htmlFor=\{selectId\}>/u);
  assert.match(picker, /<select/u);
  assert.match(picker, /role="search"/u);
  assert.match(picker, /role="listbox"/u);
  assert.match(picker, /role="option"/u);
  assert.match(picker, /event\.key === "ArrowDown"/u);
  assert.match(picker, /event\.key === "ArrowUp"/u);
  assert.match(picker, /event\.key === "Enter"/u);
  assert.match(picker, /aria-selected=/u);
});

test("UI hierarchy is rendered from canonical branches instead of a fixed administrative-level ladder", () => {
  assert.match(picker, /state\.branches\.map/u);
  assert.match(picker, /branch\.options\.map/u);
  assert.match(picker, /option\.entityKind|option\.level/u);
  assert.doesNotMatch(picker, /\[\s*["']country["'][\s\S]*["']state["'][\s\S]*["']district["']/iu);
  assert.doesNotMatch(model, /switch\s*\([^)]*level[^)]*\)/iu);
});

test("search states require explicit resolved or ambiguous confirmation", () => {
  assert.match(picker, /state\.resolution\.status === "resolved"/u);
  assert.match(picker, /state\.resolution\.status === "ambiguous"/u);
  assert.match(picker, /state\.resolution\.status === "unresolved"/u);
  assert.match(picker, /actions\.confirmResolution/u);
  assert.match(model, /resolution\.status === "ambiguous"/u);
  assert.doesNotMatch(model, /candidates\[0\].*(select|confirm)/u);
});

test("manual UI explicitly emits an unverified object and never performs label matching", () => {
  assert.match(picker, /createUnverifiedCustomLocation\(customText\)/u);
  assert.match(picker, /Manual locations remain unverified/u);
  assert.match(model, /verificationStatus: "unverified_custom"/u);
  assert.match(model, /canonicalNodeId: null/u);
  assert.match(model, /officialCode: null/u);
  assert.doesNotMatch(model, /find\([^)]*label/u);
});

test("hook owns controller lifecycle without coupling to any application runtime", () => {
  assert.match(hook, /useSyncExternalStore/u);
  assert.match(hook, /controller\.initialize\(\)/u);
  assert.match(hook, /controller\.dispose\(\)/u);
  assert.match(barrel, /CanonicalLocationPicker/u);
  assert.doesNotMatch(hook + picker + model, /Campaign|workspace-state|voiceup-campaign-locations/u);
});

test("new UI imports only the Step-8 boundary and no static or generated geography authority", () => {
  const source = hook + picker + model + barrel;
  assert.match(model, /\.\.\/browser\/LocationBrowserCatalogClient\.ts/u);
  assert.match(model, /\.\.\/browser\/LocationBrowserCatalogContract\.ts/u);
  assert.doesNotMatch(source, /OdishaLgdGenerated|CanonicalGeographyEngine|indiaMasterGeography|from\s+["'][^"']*\/geography(?:\.ts)?["']/u);
  assert.doesNotMatch(source, /LOCATION_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL/u);
});

test("remaining compatibility-only sources do not become canonical UI authorities", () => {
  const protectedFiles = [
    "src/backend.ts",
    "src/components/IndiaLocationFields.tsx",
    "src/components/indiaLocationOptions.ts",
    "src/components/useCampaignLocationCatalog.ts",
    "src/businessOs/masterData/ResourceLocationManager.tsx",
    "src/geography.ts"
  ];
  for (const relativePath of protectedFiles) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /businessOs\/location\/ui|CanonicalLocationPicker|useCanonicalLocationUi/u, relativePath);
  }

  const campaignPage = readFileSync(path.join(repoRoot, "src/pages/app/CampaignsTab.tsx"), "utf8");
  assert.match(campaignPage, /WorkspaceCanonicalLocationPicker/u);

  const publicPage = readFileSync(path.join(repoRoot, "src/pages/PublicCampaignPage.tsx"), "utf8");
  assert.match(publicPage, /PublicCampaignCanonicalLocationDisplay/u);
  assert.doesNotMatch(publicPage, /CanonicalLocationPicker|useCanonicalLocationUi/u);
});
