import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function loadModule(path) {
  const source = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;

  const module = { exports: {} };
  new Function("module", "exports", js)(module, module.exports);
  return module.exports;
}

const { buildVerifiedRegistrationGenerations } = loadModule(
  "src/growth/gauPoints/registrationTree.ts"
);

const { highestQualifiedRound } = loadModule(
  "src/growth/gauPoints/roundQualification.ts"
);

function evaluate(rootId, registrations, branchFactor) {
  const tree = buildVerifiedRegistrationGenerations(rootId, registrations);

  return {
    generationCounts: tree.generations.map(g => g.length),
    highestRound: highestQualifiedRound(
      branchFactor,
      tree.generations.map(g => g.length)
    ),
    violations: tree.violations
  };
}

const completeBinaryTree = [
  { supporterId: "A", verified: true },
  { supporterId: "B", parentSupporterId: "A", verified: true },
  { supporterId: "C", parentSupporterId: "A", verified: true },
  { supporterId: "D", parentSupporterId: "B", verified: true },
  { supporterId: "E", parentSupporterId: "B", verified: true },
  { supporterId: "F", parentSupporterId: "C", verified: true },
  { supporterId: "G", parentSupporterId: "C", verified: true }
];

test("complete binary tree qualifies for round 2", () => {
  const result = evaluate("A", completeBinaryTree, 2);
  assert.deepEqual(result.generationCounts, [2, 4]);
  assert.equal(result.highestRound, 2);
  assert.deepEqual(result.violations, []);
});

test("unverified member prevents round 2", () => {
  const registrations = completeBinaryTree.map(node =>
    node.supporterId === "G" ? { ...node, verified: false } : node
  );

  const result = evaluate("A", registrations, 2);
  assert.deepEqual(result.generationCounts, [2, 3]);
  assert.equal(result.highestRound, 1);
});

test("duplicate member cannot complete round 2", () => {
  const registrations = [
    ...completeBinaryTree.filter(node => node.supporterId !== "G"),
    { supporterId: "F", parentSupporterId: "C", verified: true }
  ];

  const result = evaluate("A", registrations, 2);
  assert.equal(result.highestRound, 1);
  assert.ok(result.violations.some(x => x.includes("Duplicate")));
});

test("changing N changes qualification requirements", () => {
  const binary = evaluate("A", completeBinaryTree, 2);
  const ternary = evaluate("A", completeBinaryTree, 3);

  assert.equal(binary.highestRound, 2);
  assert.equal(ternary.highestRound, 0);
});

test("an incomplete earlier generation blocks later qualification", () => {
  const registrations = [
    { supporterId: "A", verified: true },
    { supporterId: "B", parentSupporterId: "A", verified: true },
    { supporterId: "D", parentSupporterId: "B", verified: true },
    { supporterId: "E", parentSupporterId: "B", verified: true },
    { supporterId: "F", parentSupporterId: "B", verified: true },
    { supporterId: "G", parentSupporterId: "B", verified: true }
  ];

  assert.equal(evaluate("A", registrations, 2).highestRound, 0);
});
