import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(
  "src/growth/gauPoints/roundQualification.ts",
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

const {
  calculateRoundRequirements,
  highestQualifiedRound
} = module.exports;

test("N=2 produces correct fresh and cumulative requirements", () => {
  assert.deepEqual(calculateRoundRequirements(2, 4), [
    { round: 1, requiredFreshRegistrations: 2, cumulativeRequiredRegistrations: 2 },
    { round: 2, requiredFreshRegistrations: 4, cumulativeRequiredRegistrations: 6 },
    { round: 3, requiredFreshRegistrations: 8, cumulativeRequiredRegistrations: 14 },
    { round: 4, requiredFreshRegistrations: 16, cumulativeRequiredRegistrations: 30 }
  ]);
});

test("N=3 produces correct requirements", () => {
  assert.deepEqual(
    calculateRoundRequirements(3, 3).map(x => x.requiredFreshRegistrations),
    [3, 9, 27]
  );
});

test("qualifies only completed consecutive generations", () => {
  assert.equal(highestQualifiedRound(2, [2, 4, 8]), 3);
  assert.equal(highestQualifiedRound(2, [2, 3, 20]), 1);
  assert.equal(highestQualifiedRound(2, [1, 100]), 0);
});

test("zero rounds is valid", () => {
  assert.deepEqual(calculateRoundRequirements(2, 0), []);
  assert.equal(highestQualifiedRound(2, []), 0);
});

test("rejects invalid branch factors and round counts", () => {
  assert.throws(() => calculateRoundRequirements(1, 3));
  assert.throws(() => calculateRoundRequirements(2.5, 3));
  assert.throws(() => calculateRoundRequirements(2, -1));
});

test("rejects integer overflow", () => {
  assert.throws(() => calculateRoundRequirements(2, 54));
});

test("does not qualify using an incomplete generation", () => {
  assert.equal(highestQualifiedRound(3, [3, 8, 27]), 1);
});
