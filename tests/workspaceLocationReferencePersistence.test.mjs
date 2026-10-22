import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeWorkspaceStateForSave } from "../supabase/functions/_shared/workspaceStateMerge.ts";
import {
  prepareWorkspaceLocationReferences,
  workspaceLocationVerificationState,
  WorkspaceLocationReferenceError
} from "../supabase/functions/_shared/workspaceLocationReferences.ts";

const edgeSource = readFileSync(new URL("../supabase/functions/voiceup-workspace-state/index.ts", import.meta.url), "utf8");
const publicIndexSource = readFileSync(new URL("../supabase/functions/_shared/voiceup.ts", import.meta.url), "utf8");
const campaignSource = readFileSync(new URL("../src/pages/app/CampaignsTab.tsx", import.meta.url), "utf8");
const publicPageSource = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
const publicSigningSource = readFileSync(new URL("../supabase/functions/voiceup-public-signing/index.ts", import.meta.url), "utf8");

function snapshot(overrides = {}) {
  return {
    canonicalNodeId: "in-state-odisha",
    officialCode: "21",
    labelSnapshot: "Odisha",
    level: "state",
    entityKind: "state",
    ...overrides
  };
}

function canonical(overrides = {}) {
  return {
    schemaVersion: "voiceup.location-reference/v1",
    verificationState: "canonical_verified",
    canonicalNodeId: "in-state-odisha-district-362-local-250520",
    officialCode: "250520",
    labelSnapshot: "Bhubaneswar",
    level: "local_body",
    entityKind: "municipal_corporation",
    authority: "LGD",
    sourceDataset: "india-lgd",
    datasetVersion: "lgd-2026-08-27",
    parents: [snapshot({
      canonicalNodeId: "in-state-odisha-district-362",
      officialCode: "362",
      labelSnapshot: "Khordha",
      level: "district",
      entityKind: "district"
    })],
    lineageSnapshot: [
      snapshot({ canonicalNodeId: "in", officialCode: "IN", labelSnapshot: "India", level: "country", entityKind: "country" }),
      snapshot(),
      snapshot({
        canonicalNodeId: "in-state-odisha-district-362",
        officialCode: "362",
        labelSnapshot: "Khordha",
        level: "district",
        entityKind: "district"
      })
    ],
    validation: { validatedAt: "2026-09-17T01:02:03.000Z", validatorVersion: "location-db-v1" },
    ...overrides
  };
}

function custom(overrides = {}) {
  return {
    schemaVersion: "voiceup.location-reference/v1",
    verificationState: "unverified_custom",
    canonicalNodeId: null,
    officialCode: null,
    labelSnapshot: "Village chowk",
    level: "locality",
    provenance: { source: "workspace_manual", recordedAt: "2026-09-17T01:02:03.000Z" },
    ...overrides
  };
}

function validators(trusted = canonical()) {
  return {
    validateCanonical: async (candidate) => {
      for (const field of [
        "canonicalNodeId", "officialCode", "labelSnapshot", "level", "entityKind",
        "authority", "sourceDataset", "datasetVersion"
      ]) {
        if (candidate[field] !== trusted[field]) {
          throw new WorkspaceLocationReferenceError("invalid_workspace_location_reference");
        }
      }
      if (JSON.stringify(candidate.parents) !== JSON.stringify(trusted.parents)
        || JSON.stringify(candidate.lineageSnapshot) !== JSON.stringify(trusted.lineageSnapshot)) {
        throw new WorkspaceLocationReferenceError("invalid_workspace_location_reference");
      }
      return structuredClone(trusted);
    },
    validateShape: async () => true
  };
}

test("canonical campaign persistence is rebuilt and dual-writes trusted legacy labels", async () => {
  const claim = canonical({ validation: { validatedAt: "2020-01-01T00:00:00Z", validatorVersion: "browser-claim/v1" } });
  const state = await prepareWorkspaceLocationReferences({
    campaigns: [{
      id: "campaign-1",
      country: "stale",
      state: "stale",
      district: "stale",
      block: "stale",
      panchayat: "stale",
      location: "stale",
      locationReference: claim
    }]
  }, validators());
  const campaign = state.campaigns[0];
  assert.deepEqual({
    country: campaign.country,
    state: campaign.state,
    district: campaign.district,
    block: campaign.block,
    panchayat: campaign.panchayat,
    location: campaign.location
  }, {
    country: "India",
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    panchayat: "",
    location: "Bhubaneswar"
  });
  assert.equal(campaign.locationReference.validation.validatorVersion, "location-db-v1");
});

test("canonical C08 governance persistence retains labels plus trusted identity", async () => {
  const state = await prepareWorkspaceLocationReferences({
    organization: {
      id: "workspace-1",
      locationGovernance: {
        state: "old",
        district: "old",
        block: "old",
        panchayat: "old",
        lockLevel: "district",
        locationReference: canonical()
      }
    }
  }, validators());
  assert.deepEqual({
    state: state.organization.locationGovernance.state,
    district: state.organization.locationGovernance.district,
    block: state.organization.locationGovernance.block,
    panchayat: state.organization.locationGovernance.panchayat,
    lockLevel: state.organization.locationGovernance.lockLevel
  }, {
    state: "Odisha",
    district: "Khordha",
    block: "Bhubaneswar",
    panchayat: "",
    lockLevel: "district"
  });
  assert.equal(state.organization.locationGovernance.locationReference.canonicalNodeId, canonical().canonicalNodeId);
});

test("explicit custom references persist without canonical identity or label promotion", async () => {
  const state = await prepareWorkspaceLocationReferences({
    campaigns: [{ id: "campaign-1", state: "Manual State", locationReference: custom({ labelSnapshot: "Bhubaneswar" }) }]
  }, validators());
  assert.equal(state.campaigns[0].state, "Manual State");
  assert.equal(state.campaigns[0].locationReference.verificationState, "unverified_custom");
  assert.equal(state.campaigns[0].locationReference.canonicalNodeId, null);
});

test("malformed custom references are rejected even if a weak shape callback accepts them", async () => {
  await assert.rejects(
    prepareWorkspaceLocationReferences({
      campaigns: [{ id: "campaign-1", locationReference: custom({ authority: "LGD" }) }]
    }, validators()),
    (error) => error instanceof WorkspaceLocationReferenceError
      && error.code === "invalid_workspace_location_reference"
  );
});

test("wrong canonical code, level, entity kind, lineage and version are rejected", async () => {
  const variants = [
    canonical({ officialCode: "999" }),
    canonical({ level: "block" }),
    canonical({ entityKind: "municipality" }),
    canonical({ lineageSnapshot: [...canonical().lineageSnapshot].reverse() }),
    canonical({ datasetVersion: "lgd-old" })
  ];
  for (const locationReference of variants) {
    await assert.rejects(
      prepareWorkspaceLocationReferences({ campaigns: [{ id: "campaign-1", locationReference }] }, validators()),
      (error) => error instanceof WorkspaceLocationReferenceError
    );
  }
});

test("missing older-client references remain explicitly legacy-unresolved", () => {
  assert.equal(workspaceLocationVerificationState({ state: "Odisha", district: "Khordha" }), "legacy_unresolved");
  assert.equal(workspaceLocationVerificationState({ locationReference: null }), "legacy_unresolved");
});

test("older-client omission preserves verified campaign and governance references", () => {
  const base = {
    campaigns: [{ id: "campaign-1", title: "Old", state: "Odisha" }],
    organization: { name: "Workspace", locationGovernance: { state: "Odisha" } },
    signers: [],
    auditLogs: []
  };
  const server = {
    ...base,
    campaigns: [{ ...base.campaigns[0], state: "Odisha", district: "Khordha", locationReference: canonical() }],
    organization: {
      ...base.organization,
      locationGovernance: { ...base.organization.locationGovernance, locationReference: canonical() }
    }
  };
  const requested = {
    ...base,
    campaigns: [{ ...base.campaigns[0], title: "New title", state: "Stale state", district: "Stale district" }],
    organization: {
      ...base.organization,
      name: "New workspace",
      locationGovernance: { state: "Stale state" }
    }
  };
  const merged = mergeWorkspaceStateForSave(server, requested, base, base);
  assert.equal(merged.state.campaigns[0].title, "New title");
  assert.equal(merged.state.campaigns[0].locationReference.canonicalNodeId, canonical().canonicalNodeId);
  assert.equal(merged.state.campaigns[0].state, "Odisha");
  assert.equal(merged.state.campaigns[0].district, "Khordha");
  assert.equal(merged.state.organization.name, "New workspace");
  assert.equal(merged.state.organization.locationGovernance.locationReference.canonicalNodeId, canonical().canonicalNodeId);
  assert.equal(merged.state.organization.locationGovernance.state, "Odisha");
});

test("an explicit new-client null can clear a workspace-owned reference", () => {
  const server = {
    campaigns: [{ id: "campaign-1", locationReference: canonical() }],
    signers: [],
    auditLogs: []
  };
  const requested = {
    campaigns: [{ id: "campaign-1", locationReference: null }],
    signers: [],
    auditLogs: []
  };
  const merged = mergeWorkspaceStateForSave(server, requested, server, server);
  assert.equal(merged.state.campaigns[0].locationReference, null);
});

test("workspace Edge validation remains behind authorization and before CAS persistence", () => {
  const authorization = edgeSource.indexOf("await requireWorkspaceAccess");
  const preparation = edgeSource.indexOf("prepareWorkspaceLocationReferences(nextState");
  const save = edgeSource.indexOf("const saved = await saveVersionedWorkspace");
  assert.ok(authorization >= 0 && preparation > authorization && save > preparation);
  assert.match(edgeSource, /voiceup_validate_persisted_location_reference_v1/u);
  assert.match(edgeSource, /voiceup_is_persisted_location_reference_v1_shape/u);
  assert.match(edgeSource, /workspace_state_conflict/u);
  assert.doesNotMatch(edgeSource, /VITE_|LOCATION_API_KEY/u);
});

test("public index strips workspace campaign identity while signer identity uses trusted validation", () => {
  assert.match(publicIndexSource, /const \{ locationReference: _workspaceLocationReference, \.\.\.publicCampaign \} = campaign/u);
  assert.match(publicIndexSource, /campaign: sanitizePublicCampaign\(campaign\)/u);
  assert.match(publicPageSource, /onConfirmCanonicalReference/u);
  assert.match(publicSigningSource, /preparePublicLocationReference/u);
  assert.match(publicSigningSource, /voiceup_validate_persisted_location_reference_v1/u);
  assert.match(publicSigningSource, /mutate_voiceup_public_participation_screen_safe/u);
  assert.doesNotMatch(publicSigningSource, /VITE_|LOCATION_API_KEY/u);
});

test("CampaignsTab adds canonical selection without removing the existing save boundary", () => {
  assert.match(campaignSource, /WorkspaceCanonicalLocationPicker/u);
  assert.match(campaignSource, /createUnverifiedLocationReference/u);
  assert.match(campaignSource, /createObservedLocationReference/u);
  assert.match(campaignSource, /onSaveCampaign/u);
});

test("workspace preparation covers additive signer, scan, authority and overlay references", async () => {
  const state = await prepareWorkspaceLocationReferences({
    signers: [{ id: "signer-1", state: "old", locationReference: canonical() }],
    scanItems: [{ id: "scan-1", locationReference: custom(), parsedSigner: { locationReference: custom() } }],
    authorities: [{ id: "authority-1", jurisdictionLocationReference: canonical() }],
    locationOverrideReferences: { "india|odisha|khordha": custom() }
  }, validators());
  assert.equal(state.signers[0].state, "Odisha");
  assert.equal(state.scanItems[0].locationReference.verificationState, "unverified_custom");
  assert.equal(state.scanItems[0].parsedSigner.locationReference.verificationState, "unverified_custom");
  assert.equal(state.authorities[0].district, "Khordha");
  assert.equal(state.locationOverrideReferences["india|odisha|khordha"].canonicalNodeId, null);
});

test("GPS, OCR and PIN references remain observations without canonical identity", async () => {
  for (const kind of ["gps", "ocr", "pin"]) {
    const observation = {
      schemaVersion: "voiceup.location-reference/v1",
      verificationState: "unverified_observation",
      canonicalNodeId: null,
      officialCode: null,
      provenance: { source: kind, recordedAt: "2026-09-17T01:02:03.000Z" },
      evidence: [{ kind, valueSnapshot: "evidence only", confidence: 0.5 }]
    };
    const state = await prepareWorkspaceLocationReferences({
      signers: [{ id: `signer-${kind}`, locationReference: observation }]
    }, validators());
    assert.equal(state.signers[0].locationReference.verificationState, "unverified_observation");
    assert.equal(state.signers[0].locationReference.canonicalNodeId, null);
  }
});
