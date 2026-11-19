import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const cache = new Map();

function load(file) {
  if (cache.has(file)) return cache.get(file).exports;

  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  const module = { exports: {} };
  cache.set(file, module);

  new Function("module", "exports", "require", js)(
    module,
    module.exports,
    name => {
      const resolved = name.startsWith(".")
        ? new URL(name + ".ts", new URL(
            "file://" + process.cwd().replace(/\\/g, "/") +
            "/src/growth/gauPoints/roundTransfer.ts"
          )).pathname
        : name;

      if (name === "./ledger") {
        return load("src/growth/gauPoints/ledger.ts");
      }

      if (name === "./roundContribution") {
        return load("src/growth/gauPoints/roundContribution.ts");
      }

      throw new Error("Unexpected dependency: " + resolved);
    }
  );

  return module.exports;
}

const {
  createEmptyGauPointLedger,
  appendGauPointLedgerEntry,
  getGauPointBalance
} = load("src/growth/gauPoints/ledger.ts");

const { applyGauPointRoundTransfer } = load(
  "src/growth/gauPoints/roundTransfer.ts"
);

function funded(points = 1000) {
  return appendGauPointLedgerEntry(
    createEmptyGauPointLedger(),
    {
      idempotencyKey: "sign-A",
      supporterId: "A",
      kind: "verified_signing",
      points,
      referenceId: "sign-A"
    }
  ).state;
}

const request = {
  campaignId: "campaign-test",
  supporterId: "A",
  round: 2,
  contributionPercentage: 50,
  upstreamAncestors: ["B", null]
};

test("pending shares do not increase contributor balance", () => {
  const result = applyGauPointRoundTransfer(funded(), request);

  assert.equal(result.contributedPoints, 500);
  assert.equal(result.allocatedPoints, 250);
  assert.equal(result.pendingPoints, 250);
  assert.equal(getGauPointBalance(result.state, "A"), 500);
  assert.equal(getGauPointBalance(result.state, "B"), 250);
});

test("round replay does not deduct twice", () => {
  const first = applyGauPointRoundTransfer(funded(), request);
  const second = applyGauPointRoundTransfer(first.state, request);

  assert.equal(second.applied, false);
  assert.equal(second.state.entries.length, first.state.entries.length);
});

test("zero-point round can be recorded exactly once", () => {
  const state = createEmptyGauPointLedger();

  const first = applyGauPointRoundTransfer(state, {
    campaignId: "campaign-test",
    supporterId: "A",
    round: 1,
    contributionPercentage: 50,
    upstreamAncestors: [null]
  });

  assert.equal(first.applied, true);

  const second = applyGauPointRoundTransfer(first.state, {
    campaignId: "campaign-test",
    supporterId: "A",
    round: 1,
    contributionPercentage: 50,
    upstreamAncestors: [null]
  });

  assert.equal(second.applied, false);
});

test("failed transaction leaves original state unchanged", () => {
  const state = funded();
  const before = state.entries.length;

  assert.throws(() =>
    applyGauPointRoundTransfer(state, {
      ...request,
      upstreamAncestors: ["B", "B"]
    })
  );

  assert.equal(state.entries.length, before);
  assert.equal(getGauPointBalance(state, "A"), 1000);
});

test("no contributor may receive own upstream share", () => {
  assert.throws(() =>
    applyGauPointRoundTransfer(funded(), {
      ...request,
      upstreamAncestors: ["A", "B"]
    })
  );
});
