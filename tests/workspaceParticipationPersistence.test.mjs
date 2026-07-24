import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  mergeWorkspaceStateForSave,
  nextWorkspaceUpdatedAt
} from "../supabase/functions/_shared/workspaceStateMerge.ts";

const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const workspaceEdgeSource = readFileSync(
  new URL("../supabase/functions/voiceup-workspace-state/index.ts", import.meta.url),
  "utf8"
);

const campaign = { id: "cmp-1", title: "Original campaign" };
const adminSigner = {
  id: "sig-paper",
  campaignId: "cmp-1",
  status: "pending",
  source: "scan",
  reviewerNote: ""
};
const publicSigner = {
  id: "sig-public",
  campaignId: "cmp-1",
  phone: "9876543210",
  canonicalPhone: "9876543210",
  otpVerified: true,
  source: "online",
  status: "verified",
  name: "Asha",
  profileUpdatedAt: "2026-07-24T10:00:00.000Z",
  supportSubmittedAt: "2026-07-24T10:00:00.000Z"
};

test("authenticated saves preserve an RPC-added supporter, audit, and idempotency while saving admin state", () => {
  const base = {
    campaigns: [campaign],
    organization: { name: "Original organization" },
    signers: [adminSigner],
    auditLogs: [{ id: "audit-old", action: "campaign.created", createdAt: "2026-07-23T00:00:00.000Z" }]
  };
  const server = {
    ...base,
    signers: [publicSigner, adminSigner],
    auditLogs: [
      {
        id: "audit-public",
        action: "public_participation.submit_support",
        createdAt: "2026-07-24T10:00:00.000Z"
      },
      ...base.auditLogs
    ],
    publicParticipationIdempotency: [{ key: "support-key", result: { ok: true } }]
  };
  const requested = {
    ...base,
    campaigns: [{ ...campaign, title: "Admin-edited campaign" }],
    organization: { name: "Admin-edited organization" },
    signers: [{ ...adminSigner, status: "verified", reviewerNote: "Checked by admin" }],
    auditLogs: [
      {
        id: "audit-admin",
        action: "signer.status_updated",
        createdAt: "2026-07-24T10:01:00.000Z"
      },
      ...base.auditLogs
    ]
  };

  const result = mergeWorkspaceStateForSave(server, requested, base, base);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.state.campaigns[0].title, "Admin-edited campaign");
  assert.equal(result.state.organization.name, "Admin-edited organization");
  assert.equal(result.state.signers.find((signer) => signer.id === "sig-paper").status, "verified");
  assert.equal(result.state.signers.find((signer) => signer.id === "sig-paper").reviewerNote, "Checked by admin");
  assert.deepEqual(
    result.state.signers.find((signer) => signer.id === "sig-public"),
    publicSigner
  );
  assert.deepEqual(
    new Set(result.state.auditLogs.map((entry) => entry.id)),
    new Set(["audit-old", "audit-public", "audit-admin"])
  );
  assert.deepEqual(result.state.publicParticipationIdempotency, server.publicParticipationIdempotency);
});

test("a stale client preserves a server-added campaign and its RPC-added supporter", () => {
  const base = {
    campaigns: [campaign],
    signers: [adminSigner],
    auditLogs: []
  };
  const addedCampaign = { id: "cmp-2", title: "Concurrent campaign" };
  const addedSigner = {
    ...publicSigner,
    id: "sig-concurrent-campaign",
    campaignId: addedCampaign.id
  };
  const server = {
    ...base,
    campaigns: [...base.campaigns, addedCampaign],
    signers: [...base.signers, addedSigner]
  };
  const requested = {
    ...base,
    organization: { name: "Admin edit from stale client" }
  };

  const result = mergeWorkspaceStateForSave(server, requested, base, base);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.state.campaigns.some((item) => item.id === addedCampaign.id), true);
  assert.equal(result.state.signers.some((item) => item.id === addedSigner.id), true);
});

test("a later autosave cannot regress participation fields that the client has not refreshed", () => {
  const loaded = {
    campaigns: [campaign],
    organization: { name: "Original organization" },
    signers: [{
      ...publicSigner,
      name: "Old public profile",
      profileUpdatedAt: "2026-07-24T09:00:00.000Z"
    }],
    auditLogs: []
  };
  const serverAfterRpc = {
    ...loaded,
    signers: [{
      ...publicSigner,
      name: "New public profile",
      profileUpdatedAt: "2026-07-24T10:00:00.000Z"
    }]
  };
  const staleClientSave = {
    ...loaded,
    organization: { name: "First admin edit" }
  };

  const first = mergeWorkspaceStateForSave(serverAfterRpc, staleClientSave, loaded, loaded);
  assert.deepEqual(first.conflicts, []);
  assert.equal(first.state.signers[0].name, "New public profile");

  const secondClientSave = {
    ...staleClientSave,
    organization: { name: "Second admin edit" }
  };
  const second = mergeWorkspaceStateForSave(
    first.state,
    secondClientSave,
    first.state,
    staleClientSave
  );
  assert.deepEqual(second.conflicts, []);
  assert.equal(second.state.organization.name, "Second admin edit");
  assert.equal(second.state.signers[0].name, "New public profile");
  assert.equal(second.state.signers[0].profileUpdatedAt, "2026-07-24T10:00:00.000Z");
});

test("an explicit admin signer status change is retained when the server did not change that field", () => {
  const base = {
    campaigns: [campaign],
    signers: [{ ...publicSigner, status: "pending", supportSubmittedAt: undefined }],
    auditLogs: []
  };
  const requested = {
    ...base,
    signers: [{ ...base.signers[0], status: "rejected", reviewerNote: "Rejected by admin" }]
  };

  const result = mergeWorkspaceStateForSave(base, requested, base, base);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.state.signers[0].status, "rejected");
  assert.equal(result.state.signers[0].reviewerNote, "Rejected by admin");
});

test("a concurrent RPC and admin change to the same participation field fails explicitly", () => {
  const baseSigner = {
    ...publicSigner,
    status: "pending",
    supportSubmittedAt: undefined,
    profileUpdatedAt: "2026-07-24T09:00:00.000Z"
  };
  const base = { campaigns: [campaign], signers: [baseSigner], auditLogs: [] };
  const server = {
    ...base,
    signers: [{
      ...baseSigner,
      status: "verified",
      supportSubmittedAt: "2026-07-24T10:00:00.000Z"
    }]
  };
  const requested = {
    ...base,
    signers: [{ ...baseSigner, status: "rejected", reviewerNote: "Admin decision" }]
  };

  const result = mergeWorkspaceStateForSave(server, requested, base, base);
  assert.deepEqual(result.conflicts, ["signers.sig-public.status"]);
  assert.equal(result.state.signers[0].status, "verified");
  assert.equal(result.state.signers[0].reviewerNote, "Admin decision");
});

test("workspace persistence uses compare-and-swap and the legacy Edge writer fails closed without a baseline", () => {
  assert.match(backendSource, /for \(let attempt = 0; attempt < 5; attempt \+= 1\)/);
  assert.match(backendSource, /\.eq\("updated_at", snapshot\.updatedAt\)/);
  assert.match(backendSource, /serverState:\s*merged\.state/);
  assert.match(backendSource, /clientState:\s*state/);
  assert.match(workspaceEdgeSource, /baseState:\s*snapshot\.state/);
  assert.match(workspaceEdgeSource, /updatedAt:\s*snapshot\.updatedAt/);
  assert.match(workspaceEdgeSource, /workspace_save_baseline_required/);
  assert.match(workspaceEdgeSource, /\.eq\("updated_at", snapshot\.updatedAt\)/);
  assert.doesNotMatch(workspaceEdgeSource, /writeWorkspace\(admin,\s*workspaceId,\s*nextState\)/);
});

test("workspace updated_at always advances beyond the compared version", () => {
  assert.equal(
    nextWorkspaceUpdatedAt("2026-07-24T10:00:00.000Z", Date.parse("2026-07-24T09:00:00.000Z")),
    "2026-07-24T10:00:00.001Z"
  );
});
