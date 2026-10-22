import assert from "node:assert/strict";
import test from "node:test";
import {
  CanonicalLocationUiController,
  createUnverifiedCustomLocation,
  toCanonicalLocationSelection
} from "../src/businessOs/location/ui/CanonicalLocationUiModel.ts";

const v1 = Object.freeze({ authority: "LGD", sourceDataset: "india-lgd", datasetVersion: "lgd-test-v1" });
const v2 = Object.freeze({ authority: "LGD", sourceDataset: "india-lgd", datasetVersion: "lgd-test-v2" });

function canonicalNode(nodeId, officialCode, label, level, entityKind, parent = null, dataset = v1) {
  return {
    nodeId,
    officialCode,
    label,
    level,
    entityKind,
    ...dataset,
    parents: parent ? [{
      nodeId: parent.nodeId,
      officialCode: parent.officialCode,
      level: parent.level,
      relationship: "administrative_parent",
      source: { ...dataset }
    }] : [],
    lineage: parent ? [...parent.lineage, {
      nodeId: parent.nodeId,
      officialCode: parent.officialCode,
      level: parent.level
    }] : []
  };
}

const india = canonicalNode("in", "IN", "India", "country", "country");
const odisha = canonicalNode("odisha", "21", "Odisha", "state", "state", india);
const khordha = canonicalNode("khordha", "362", "Khordha", "district", "district", odisha);
const bmc = canonicalNode("bmc", "250520", "Bhubaneswar", "local_body", "municipal_corporation", khordha);
const ward = canonicalNode("ward-1", "9001", "Ward 1", "ward", "ward", bmc);
const block = canonicalNode("block", "3456", "Balianta", "block", "development_block", khordha);
const gp = canonicalNode("gp", "120001", "Test GP", "local_body", "gram_panchayat", block);
const village = canonicalNode("village", "400001", "Test Village", "village", "village", gp);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeClient(options = {}) {
  let dataset = options.dataset ?? v1;
  const childMap = new Map(Object.entries(options.children ?? {
    in: [odisha],
    odisha: [khordha],
    khordha: [block, bmc],
    block: [gp],
    gp: [village],
    bmc: [ward],
    "ward-1": [],
    village: []
  }));
  const nodes = new Map([india, odisha, khordha, bmc, ward, block, gp, village].map((node) => [node.nodeId, node]));
  const calls = [];
  let clearCount = 0;
  return {
    calls,
    get clearCount() { return clearCount; },
    setDataset(value) { dataset = value; },
    setNode(nodeId, value) { nodes.set(nodeId, value); },
    setChildren(nodeId, value) { childMap.set(nodeId, value); },
    async metadata() {
      calls.push(["metadata"]);
      if (options.metadata) return await options.metadata(dataset, calls.length);
      return { ...dataset };
    },
    async node(nodeId) {
      calls.push(["node", nodeId]);
      if (options.node) return await options.node(nodeId);
      return nodes.get(nodeId);
    },
    async children(nodeId, limit) {
      calls.push(["children", nodeId, limit]);
      if (options.loadChildren) return await options.loadChildren(nodeId, limit);
      return childMap.get(nodeId) ?? [];
    },
    async search(query) {
      calls.push(["search", query]);
      return await options.search(query);
    },
    async resolve(query) {
      calls.push(["resolve", query]);
      return await options.resolve(query);
    },
    clearCache() {
      clearCount += 1;
      calls.push(["clearCache"]);
    }
  };
}

test("initial loading resolves the canonical root and loads bounded children on demand", async () => {
  const rootGate = deferred();
  const client = fakeClient({ node: async () => await rootGate.promise });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in", resultLimit: 25 });
  assert.equal(controller.getSnapshot().status, "idle");
  const loading = controller.initialize();
  assert.equal(controller.getSnapshot().status, "loading");
  rootGate.resolve(india);
  await loading;
  const state = controller.getSnapshot();
  assert.equal(state.status, "ready");
  assert.equal(state.root.nodeId, "in");
  assert.deepEqual(state.selection.map((node) => node.nodeId), ["in"]);
  assert.deepEqual(state.branches[0].options.map((node) => node.nodeId), ["odisha"]);
  assert.ok(client.calls.some((call) => call[0] === "children" && call[1] === "in" && call[2] === 25));
});

test("navigation is API-driven, retains canonical identity, and resets descendants", async () => {
  const client = fakeClient();
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  await controller.select(0, "odisha");
  await controller.select(1, "khordha");
  await controller.select(2, "block");
  await controller.select(3, "gp");
  await controller.select(4, "village");
  assert.deepEqual(controller.getSnapshot().selection.map((node) => node.entityKind), [
    "country", "state", "district", "development_block", "gram_panchayat", "village"
  ]);
  const selectedVillage = controller.getSnapshot().selection[5];
  assert.equal(selectedVillage.canonicalNodeId, "village");
  assert.equal(selectedVillage.officialCode, "400001");
  assert.equal(selectedVillage.authority, "LGD");
  assert.equal(selectedVillage.sourceDataset, "india-lgd");
  assert.equal(selectedVillage.datasetVersion, "lgd-test-v1");
  assert.deepEqual(selectedVillage.lineage.map((node) => node.nodeId), ["in", "odisha", "khordha", "block", "gp"]);

  await controller.select(2, "bmc");
  assert.deepEqual(controller.getSnapshot().selection.map((node) => node.nodeId), ["in", "odisha", "khordha", "bmc"]);
  assert.equal(controller.getSnapshot().branches.length, 4);
  assert.deepEqual(controller.getSnapshot().branches[3].options.map((node) => node.nodeId), ["ward-1"]);
});

test("district-scoped municipal corporations and wards are not forced through development blocks", async () => {
  const controller = new CanonicalLocationUiController({ client: fakeClient(), rootNodeId: "in" });
  await controller.initialize();
  await controller.select(0, "odisha");
  await controller.select(1, "khordha");
  await controller.select(2, "bmc");
  await controller.select(3, "ward-1");
  const path = controller.getSnapshot().selection;
  assert.deepEqual(path.map((node) => node.entityKind), ["country", "state", "district", "municipal_corporation", "ward"]);
  assert.equal(path[3].officialCode, "250520");
  assert.equal(path[3].parents[0].nodeId, "khordha");
});

test("an old parent response cannot replace a newer branch selection", async () => {
  const slow = deferred();
  const alternate = canonicalNode("alternate", "99", "Alternate", "state", "state", india);
  const alternateChild = canonicalNode("alternate-child", "999", "Alternate Child", "district", "district", alternate);
  const client = fakeClient({
    children: { in: [odisha, alternate] },
    loadChildren: async (nodeId) => {
      if (nodeId === "in") return [odisha, alternate];
      if (nodeId === "odisha") return await slow.promise;
      if (nodeId === "alternate") return [alternateChild];
      return [];
    }
  });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  const oldRequest = controller.select(0, "odisha");
  await controller.select(0, "alternate");
  slow.resolve([khordha]);
  await oldRequest;
  assert.deepEqual(controller.getSnapshot().selection.map((node) => node.nodeId), ["in", "alternate"]);
  assert.deepEqual(controller.getSnapshot().branches[1].options.map((node) => node.nodeId), ["alternate-child"]);
});

test("recoverable API errors expose deterministic error state and retry", async () => {
  let failures = 1;
  const client = fakeClient({
    loadChildren: async (nodeId) => {
      if (nodeId === "in" && failures-- > 0) throw new Error("private infrastructure detail");
      return nodeId === "in" ? [odisha] : [];
    }
  });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().error.code, "request_failed");
  assert.doesNotMatch(controller.getSnapshot().error.message, /private infrastructure detail/u);
  await controller.retry();
  assert.equal(controller.getSnapshot().status, "ready");
});

test("empty canonical children produce an explicit empty state", async () => {
  const client = fakeClient({ children: { in: [] } });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  assert.equal(controller.getSnapshot().status, "empty");
  assert.equal(controller.getSnapshot().branches[0].status, "empty");
});

test("resolved search retains identity and waits for explicit confirmation", async () => {
  const client = fakeClient({ search: async () => ({ status: "resolved", node: odisha }) });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  await controller.search("Odisha");
  assert.equal(controller.getSnapshot().resolution.status, "resolved");
  assert.deepEqual(controller.getSnapshot().selection.map((node) => node.nodeId), ["in"]);
  await controller.confirmResolution("odisha");
  assert.deepEqual(controller.getSnapshot().selection.map((node) => node.nodeId), ["in", "odisha"]);
});

test("ambiguous search never selects the first result and requires an explicit candidate", async () => {
  const alternate = canonicalNode("odisha-alt", "121", "Odisha", "state", "state", india);
  const client = fakeClient({
    search: async () => ({ status: "ambiguous", candidates: [odisha, alternate], reason: "multiple_matches" })
  });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  await controller.search("Odisha");
  assert.equal(controller.getSnapshot().resolution.status, "ambiguous");
  assert.deepEqual(controller.getSnapshot().selection.map((node) => node.nodeId), ["in"]);
  await controller.confirmResolution("odisha-alt");
  assert.deepEqual(controller.getSnapshot().selection.map((node) => node.nodeId), ["in", "odisha-alt"]);
});

test("unresolved search creates no canonical identity", async () => {
  const client = fakeClient({ search: async () => ({ status: "unresolved", reason: "not_found" }) });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  await controller.search("Unknown place");
  assert.equal(controller.getSnapshot().resolution.status, "unresolved");
  assert.deepEqual(controller.getSnapshot().selection.map((node) => node.nodeId), ["in"]);
});

test("bounded resolve uses the selected canonical parent context", async () => {
  let request;
  const client = fakeClient({ resolve: async (value) => {
    request = value;
    return { status: "resolved", node: odisha };
  } });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in", resultLimit: 12 });
  await controller.initialize();
  await controller.resolve({ officialCode: "21", expectedLevel: "state" });
  assert.deepEqual(request, { officialCode: "21", expectedLevel: "state", parentNodeId: "in", resultLimit: 12 });
});

test("dataset changes invalidate option state and require refresh and reselection", async () => {
  const client = fakeClient();
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  client.setDataset(v2);
  await controller.select(0, "odisha");
  const changed = controller.getSnapshot();
  assert.equal(changed.status, "error");
  assert.equal(changed.error.code, "dataset_changed");
  assert.equal(changed.requiresReselection, true);
  assert.deepEqual(changed.selection, []);
  assert.deepEqual(changed.branches, []);
  assert.equal(client.clearCount, 1);
  client.setNode("in", canonicalNode("in", "IN", "India", "country", "country", null, v2));
  client.setChildren("in", []);
  await controller.retry();
  assert.equal(controller.getSnapshot().dataset.datasetVersion, "lgd-test-v2");
  assert.equal(controller.getSnapshot().requiresReselection, false);
});

test("mixed-version nodes fail closed and clear canonical state", async () => {
  const mixedOdisha = canonicalNode("odisha-v2", "21", "Odisha", "state", "state", india, v2);
  const client = fakeClient({ children: { in: [mixedOdisha] } });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  await controller.initialize();
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().error.code, "mixed_dataset");
  assert.equal(controller.getSnapshot().requiresReselection, true);
  assert.equal(client.clearCount, 1);
});

test("manual locations stay structurally separate and label equality cannot canonicalize", () => {
  const custom = createUnverifiedCustomLocation("Bhubaneswar");
  assert.deepEqual(custom, {
    label: "Bhubaneswar",
    verificationStatus: "unverified_custom",
    canonicalNodeId: null,
    officialCode: null
  });
  const canonical = toCanonicalLocationSelection(bmc);
  assert.equal(canonical.canonicalNodeId, "bmc");
  assert.notDeepEqual(custom, canonical);
});

test("clear cancels pending work and disabled controllers do not load", async () => {
  const gate = deferred();
  const client = fakeClient({ node: async () => await gate.promise });
  const controller = new CanonicalLocationUiController({ client, rootNodeId: "in" });
  const pending = controller.initialize();
  controller.clear();
  gate.resolve(india);
  await pending;
  assert.equal(controller.getSnapshot().status, "idle");
  assert.deepEqual(controller.getSnapshot().selection, []);

  const disabled = new CanonicalLocationUiController({ client: fakeClient(), rootNodeId: "in", disabled: true });
  await disabled.initialize();
  assert.equal(disabled.getSnapshot().status, "idle");
  assert.equal(disabled.getSnapshot().disabled, true);
});
