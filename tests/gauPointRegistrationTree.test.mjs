import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(
  "src/growth/gauPoints/registrationTree.ts",
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

const { buildVerifiedRegistrationGenerations } = module.exports;

test("builds distinct verified generations", () => {
  const result = buildVerifiedRegistrationGenerations("A", [
    { supporterId: "A", verified: true },
    { supporterId: "B", parentSupporterId: "A", verified: true },
    { supporterId: "C", parentSupporterId: "A", verified: true },
    { supporterId: "D", parentSupporterId: "B", verified: true },
    { supporterId: "E", parentSupporterId: "B", verified: true },
    { supporterId: "F", parentSupporterId: "C", verified: true },
    { supporterId: "G", parentSupporterId: "C", verified: true }
  ]);

  assert.deepEqual(result.generations, [
    ["B", "C"],
    ["D", "E", "F", "G"]
  ]);
  assert.deepEqual(result.violations, []);
});

test("excludes unverified registrations", () => {
  const result = buildVerifiedRegistrationGenerations("A", [
    { supporterId: "A", verified: true },
    { supporterId: "B", parentSupporterId: "A", verified: false },
    { supporterId: "C", parentSupporterId: "B", verified: true }
  ]);

  assert.deepEqual(result.generations, []);
});

test("excludes duplicated supporter identities", () => {
  const result = buildVerifiedRegistrationGenerations("A", [
    { supporterId: "A", verified: true },
    { supporterId: "B", parentSupporterId: "A", verified: true },
    { supporterId: "B", parentSupporterId: "A", verified: true }
  ]);

  assert.deepEqual(result.generations, []);
  assert.ok(result.violations.some(x => x.includes("Duplicate")));
});

test("rejects self-referral", () => {
  const result = buildVerifiedRegistrationGenerations("A", [
    { supporterId: "A", verified: true },
    { supporterId: "B", parentSupporterId: "B", verified: true }
  ]);

  assert.deepEqual(result.generations, []);
  assert.ok(result.violations.some(x => x.includes("Self-referral")));
});

test("does not traverse circular referral paths", () => {
  const result = buildVerifiedRegistrationGenerations("A", [
    { supporterId: "A", parentSupporterId: "C", verified: true },
    { supporterId: "B", parentSupporterId: "A", verified: true },
    { supporterId: "C", parentSupporterId: "B", verified: true }
  ]);

  assert.deepEqual(result.generations, [["B"], ["C"]]);
  assert.ok(result.violations.some(x => x.includes("Circular")));
});

test("does not count orphaned referral branches", () => {
  const result = buildVerifiedRegistrationGenerations("A", [
    { supporterId: "A", verified: true },
    { supporterId: "B", parentSupporterId: "MISSING", verified: true }
  ]);

  assert.deepEqual(result.generations, []);
});
