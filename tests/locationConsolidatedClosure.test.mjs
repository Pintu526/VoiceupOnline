import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalScopeMatches,
  createObservedLocationReference,
  createUnverifiedLocationReference,
  locationReferenceDisplay
} from "../src/businessOs/location/persistence/LocationReferenceGovernance.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260917010000_location_consolidated_persistence.sql", import.meta.url),
  "utf8"
);
const publicSigning = readFileSync(
  new URL("../supabase/functions/voiceup-public-signing/index.ts", import.meta.url),
  "utf8"
);
const backend = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const ocrPipeline = readFileSync(
  new URL("../src/documentIntelligence/defaultPipeline.ts", import.meta.url),
  "utf8"
);
const ledger = readFileSync(
  new URL("../docs/location-consumer-migration-ledger.md", import.meta.url),
  "utf8"
);

function canonical(nodeId, label, lineage = []) {
  return {
    schemaVersion: "voiceup.location-reference/v1",
    verificationState: "canonical_verified",
    canonicalNodeId: nodeId,
    officialCode: null,
    labelSnapshot: label,
    level: nodeId.includes("district") ? "district" : "state",
    entityKind: nodeId.includes("district") ? "district" : "state",
    authority: "LGD",
    sourceDataset: "india-lgd",
    datasetVersion: "lgd-2026-08-27",
    parents: [],
    lineageSnapshot: lineage,
    validation: { validatedAt: "2026-09-17T01:02:03.000Z", validatorVersion: "location-db-v1" }
  };
}

test("manual and observed values cannot acquire canonical identity", () => {
  const custom = createUnverifiedLocationReference(
    { country: "India", state: "Typed State" },
    "test_manual"
  );
  const observed = createObservedLocationReference(
    { country: "India", state: "Suggested State" },
    "test_pin",
    [{ kind: "pin", valueSnapshot: "751001" }]
  );
  assert.equal(custom.verificationState, "unverified_custom");
  assert.equal(custom.canonicalNodeId, null);
  assert.equal(custom.officialCode, null);
  assert.equal(observed.verificationState, "unverified_observation");
  assert.equal(observed.canonicalNodeId, null);
  assert.equal(observed.officialCode, null);
});

test("downstream matching and grouping are canonical-first with legacy fallback", () => {
  const state = canonical("in-state-odisha", "Odisha");
  const district = canonical("in-state-odisha-district-362", "Khordha", [{
    canonicalNodeId: state.canonicalNodeId,
    officialCode: "21",
    labelSnapshot: "Odisha",
    level: "state",
    entityKind: "state"
  }]);
  assert.equal(canonicalScopeMatches(state, district), true);
  assert.equal(locationReferenceDisplay(district, { district: "Old label" }, "district").label, "Khordha");
  assert.equal(locationReferenceDisplay(null, { district: "Legacy Khordha" }, "district").label, "Legacy Khordha");
});

test("consolidated migration delegates to existing protected RPCs and validates every additive write", () => {
  assert.match(migration, /voiceup_prepare_location_reference_v1/u);
  assert.match(migration, /voiceup_validate_persisted_location_reference_v1/u);
  assert.match(migration, /mutate_voiceup_public_participation\(/u);
  assert.match(migration, /voiceup_submit_participation_request\(/u);
  assert.match(migration, /upsert_voiceup_coordinator\(/u);
  assert.match(migration, /get_voiceup_coordinator_network\(/u);
  assert.match(migration, /voiceup_validate_scan_location_reference_v1/u);
  assert.match(migration, /vboss_prepare_resource_location_reference_v1/u);
  assert.match(migration, /'canonicalNodeId', null/u);
  assert.match(migration, /'officialCode', null/u);
  assert.doesNotMatch(migration, /\blower\s*\(|\bilike\b|unaccent\s*\(/iu);
  assert.doesNotMatch(migration, /location\.dataset_releases[\s\S]*(?:insert|update|delete|truncate)/iu);
});

test("new RPCs retain least privilege and browser code receives no Location API secret", () => {
  assert.match(migration, /revoke all on function public\.mutate_voiceup_public_participation_with_location[\s\S]*from public, anon, authenticated/iu);
  assert.match(migration, /grant execute on function public\.mutate_voiceup_public_participation_with_location[\s\S]*to service_role/iu);
  assert.match(migration, /revoke all on function public\.upsert_voiceup_coordinator_with_location[\s\S]*from public, anon/iu);
  assert.match(migration, /grant execute on function public\.upsert_voiceup_coordinator_with_location[\s\S]*to authenticated/iu);
  assert.match(publicSigning, /preparePublicLocationReference/u);
  assert.doesNotMatch(publicSigning + backend, /VITE_LOCATION|LOCATION_API_KEY/u);
});

test("canonical OCR vocabulary is active with compatibility fallback only on catalog failure", () => {
  assert.match(ocrPipeline, /createCanonicalIndiaDocumentReferenceData/u);
  assert.match(ocrPipeline, /canonicalLocationReader/u);
  assert.match(ocrPipeline, /using compatibility vocabulary/u);
});

test("the immutable C01-C29 ledger is fully accounted for", () => {
  const rows = [...ledger.matchAll(/^\| C(\d{2}) \|.*\| (MIGRATED|PARTIAL|NOT_STARTED|DEFERRED_WITH_REASON) \|$/gmu)];
  assert.equal(rows.length, 29);
  assert.deepEqual(rows.map((row) => row[1]), Array.from({ length: 29 }, (_, index) => String(index + 1).padStart(2, "0")));
  assert.ok(rows.every((row) => row[2] === "MIGRATED"));
});
