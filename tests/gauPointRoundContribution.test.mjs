import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(
  "src/growth/gauPoints/roundContribution.ts",
  "utf8"
);

const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

const module = { exports: {} };
new Function("module", "exports", js)(module, module.exports);

const { calculateGauPointRoundContribution } = module.exports;

test("round 1 contributes 50% of full available balance", () => {
  const result = calculateGauPointRoundContribution(1, 1000, 50, ["PARENT"]);
  assert.equal(result.contributionPoints, 500);
  assert.equal(result.remainingBalance, 500);
  assert.equal(result.allocatedPoints, 500);
  assert.equal(result.pendingPoints, 0);
});

test("round 2 splits contribution equally upstream", () => {
  const result = calculateGauPointRoundContribution(
    2, 1000, 50, ["PARENT", "GRANDPARENT"]
  );

  assert.deepEqual(result.shares.map(s => s.points), [250, 250]);
  assert.equal(result.allocatedPoints, 500);
});

test("missing ancestor share remains pending", () => {
  const result = calculateGauPointRoundContribution(
    3, 1200, 50, ["PARENT", null, "GREAT_GRANDPARENT"]
  );

  assert.equal(result.contributionPoints, 600);
  assert.equal(result.allocatedPoints, 400);
  assert.equal(result.pendingPoints, 200);
  assert.equal(result.remainingBalance, 600);
});

test("rounding conserves every GauPoint", () => {
  const result = calculateGauPointRoundContribution(
    3, 101, 50, ["PARENT", "GRANDPARENT", null]
  );

  assert.equal(result.contributionPoints, 50);
  assert.deepEqual(result.shares.map(s => s.points), [17, 17, 16]);
  assert.equal(
    result.allocatedPoints + result.pendingPoints,
    result.contributionPoints
  );
  assert.equal(
    result.remainingBalance + result.contributionPoints,
    result.openingBalance
  );
});

test("zero balance produces no deduction", () => {
  const result = calculateGauPointRoundContribution(
    2, 0, 50, ["PARENT", null]
  );

  assert.equal(result.contributionPoints, 0);
  assert.equal(result.remainingBalance, 0);
});

test("configurable contribution percentage works", () => {
  const result = calculateGauPointRoundContribution(
    1, 1000, 40, ["PARENT"]
  );

  assert.equal(result.contributionPoints, 400);
  assert.equal(result.remainingBalance, 600);
});

test("rejects invalid balances, rounds and percentages", () => {
  assert.throws(() => calculateGauPointRoundContribution(0, 100, 50, []));
  assert.throws(() => calculateGauPointRoundContribution(1, -1, 50, ["P"]));
  assert.throws(() => calculateGauPointRoundContribution(1, 100, 101, ["P"]));
  assert.throws(() => calculateGauPointRoundContribution(2, 100, 50, ["P"]));
});

test("rejects repeated ancestors", () => {
  assert.throws(() =>
    calculateGauPointRoundContribution(2, 1000, 50, ["PARENT", "PARENT"])
  );
});

test("received upstream points are included in available balance", () => {
  const earned = 500;
  const received = 300;
  const result = calculateGauPointRoundContribution(
    1, earned + received, 50, ["PARENT"]
  );

  assert.equal(result.contributionPoints, 400);
  assert.equal(result.remainingBalance, 400);
});
