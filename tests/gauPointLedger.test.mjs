import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(
  "src/growth/gauPoints/ledger.ts", "utf8"
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
  createEmptyGauPointLedger,
  appendGauPointLedgerEntry,
  getGauPointBalance
} = module.exports;

const signing = {
  idempotencyKey: "sign-A",
  supporterId: "A",
  kind: "verified_signing",
  points: 500,
  referenceId: "signature-A"
};

test("verified signing credits 500 GauPoints", () => {
  const result = appendGauPointLedgerEntry(
    createEmptyGauPointLedger(), signing
  );
  assert.equal(result.applied, true);
  assert.equal(getGauPointBalance(result.state, "A"), 500);
});

test("replaying identical event does not award twice", () => {
  const first = appendGauPointLedgerEntry(
    createEmptyGauPointLedger(), signing
  );
  const second = appendGauPointLedgerEntry(first.state, signing);

  assert.equal(second.applied, false);
  assert.equal(second.state.entries.length, 1);
  assert.equal(getGauPointBalance(second.state, "A"), 500);
});

test("conflicting idempotency key is rejected", () => {
  const first = appendGauPointLedgerEntry(
    createEmptyGauPointLedger(), signing
  );

  assert.throws(() =>
    appendGauPointLedgerEntry(first.state, {
      ...signing,
      points: 600
    })
  );
});

test("round contribution deducts without negative balance", () => {
  const first = appendGauPointLedgerEntry(
    createEmptyGauPointLedger(), signing
  );

  const second = appendGauPointLedgerEntry(first.state, {
    idempotencyKey: "round-A-1",
    supporterId: "A",
    kind: "round_contribution",
    points: -250,
    referenceId: "round-1"
  });

  assert.equal(getGauPointBalance(second.state, "A"), 250);
});

test("insufficient balance prevents deduction", () => {
  assert.throws(() =>
    appendGauPointLedgerEntry(createEmptyGauPointLedger(), {
      idempotencyKey: "round-A-1",
      supporterId: "A",
      kind: "round_contribution",
      points: -250,
      referenceId: "round-1"
    })
  );
});

test("previous ledger state remains unchanged", () => {
  const empty = createEmptyGauPointLedger();
  const result = appendGauPointLedgerEntry(empty, signing);

  assert.equal(empty.entries.length, 0);
  assert.equal(result.state.entries.length, 1);
  assert.equal(Object.isFrozen(result.state.entries[0]), true);
});

test("rejects invalid ledger entries", () => {
  const empty = createEmptyGauPointLedger();

  assert.throws(() =>
    appendGauPointLedgerEntry(empty, { ...signing, points: 0 })
  );

  assert.throws(() =>
    appendGauPointLedgerEntry(empty, {
      ...signing,
      idempotencyKey: ""
    })
  );

  assert.throws(() =>
    appendGauPointLedgerEntry(empty, {
      ...signing,
      kind: "round_contribution",
      points: 100
    })
  );
});

test("upstream receipts increase recipient balance", () => {
  const result = appendGauPointLedgerEntry(
    createEmptyGauPointLedger(), {
      idempotencyKey: "receipt-B-1",
      supporterId: "B",
      kind: "upstream_receipt",
      points: 125,
      referenceId: "round-A-1"
    }
  );

  assert.equal(getGauPointBalance(result.state, "B"), 125);
});

test("rejects balance overflow", () => {
  const first = appendGauPointLedgerEntry(
    createEmptyGauPointLedger(), {
      ...signing,
      points: Number.MAX_SAFE_INTEGER
    }
  );

  assert.throws(() =>
    appendGauPointLedgerEntry(first.state, {
      ...signing,
      idempotencyKey: "overflow",
      referenceId: "overflow",
      points: 1
    })
  );
});
