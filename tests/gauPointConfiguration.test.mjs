import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(
  "src/growth/gauPoints/configuration.ts",
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
  createDefaultGauPointConfiguration,
  validateGauPointConfiguration
} = module.exports;

test("GauPoints disabled by default", () => {
  const config = createDefaultGauPointConfiguration();
  assert.equal(config.enabled, false);
  assert.equal(config.redeemable, false);
});

test("initial reward values and round settings", () => {
  const config = createDefaultGauPointConfiguration();
  assert.equal(config.verifiedSigningPoints, 500);
  assert.equal(config.verifiedRegistrationReferralPoints, 300);
  assert.equal(config.branchFactor, 2);
  assert.equal(config.maximumRound, 12);
  assert.equal(config.roundContributionPercentage, 50);
  assert.deepEqual(validateGauPointConfiguration(config), []);
});

test("campaign can configure reward points", () => {
  const config = {
    ...createDefaultGauPointConfiguration(),
    verifiedSigningPoints: 750,
    verifiedRegistrationReferralPoints: 250,
    branchFactor: 3,
    maximumRound: 8,
    roundContributionPercentage: 40
  };
  assert.deepEqual(validateGauPointConfiguration(config), []);
});

test("reject invalid reward and round settings", () => {
  const base = createDefaultGauPointConfiguration();
  assert.ok(validateGauPointConfiguration({
    ...base,
    verifiedSigningPoints: -1,
    branchFactor: 1,
    maximumRound: 13,
    roundContributionPercentage: 110
  }).length >= 3);
});

test("reject redeemable GauPoints", () => {
  const config = {
    ...createDefaultGauPointConfiguration(),
    redeemable: true
  };
  assert.ok(validateGauPointConfiguration(config).length > 0);
});
