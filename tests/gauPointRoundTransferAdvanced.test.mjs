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
    module, module.exports, name => {
      if (name === "./ledger") {
        return load("src/growth/gauPoints/ledger.ts");
      }
      if (name === "./roundContribution") {
        return load("src/growth/gauPoints/roundContribution.ts");
      }
      throw new Error("Unexpected dependency: " + name);
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

test("pending shares remain outside spendable balances", () => {
  const result = applyGauPointRoundTransfer(funded(), request);

  assert.equal(getGauPointBalance(result.state, "A"), 500);
  assert.equal(getGauPointBalance(result.state, "B"), 250);
  assert.equal(result.pendingPoints, 250);
});

test("replay preserves original accounting totals", () => {
  const first = applyGauPointRoundTransfer(funded(), request);
  const second = applyGauPointRoundTransfer(first.state, request);

  assert.equal(second.applied, false);
  assert.equal(second.contributedPoints, first.contributedPoints);
  assert.equal(second.allocatedPoints, first.allocatedPoints);
  assert.equal(second.pendingPoints, first.pendingPoints);
});

test("changing a completed round request must be rejected", () => {
  const first = applyGauPointRoundTransfer(funded(), request);

  assert.throws(() =>
    applyGauPointRoundTransfer(first.state, {
      ...request,
      upstreamAncestors: ["C", null]
    })
  );
});

test("pending share cannot be spent as wallet balance", () => {
  const first = applyGauPointRoundTransfer(funded(), {
    ...request,
    upstreamAncestors: [null, null]
  });

  assert.equal(getGauPointBalance(first.state, "A"), 500);

  assert.throws(() =>
    appendGauPointLedgerEntry(first.state, {
      idempotencyKey: "overspend",
      supporterId: "A",
      kind: "round_contribution",
      points: -501,
      referenceId: "overspend"
    })
  );
});

test("round transfer conserves contributor deduction", () => {
  const result = applyGauPointRoundTransfer(funded(1001), request);

  assert.equal(
    result.allocatedPoints + result.pendingPoints,
    result.contributedPoints
  );
  assert.equal(
    getGauPointBalance(result.state, "A") +
      result.contributedPoints,
    1001
  );
});

test("duplicate zero-point round does not create new entries", () => {
  const zeroRequest = {
    campaignId: "campaign-test",
    supporterId: "A",
    round: 1,
    contributionPercentage: 50,
    upstreamAncestors: [null]
  };

  const first = applyGauPointRoundTransfer(
    createEmptyGauPointLedger(), zeroRequest
  );

  const second = applyGauPointRoundTransfer(
    first.state, zeroRequest
  );

  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(first.state.entries.length, second.state.entries.length);
});
