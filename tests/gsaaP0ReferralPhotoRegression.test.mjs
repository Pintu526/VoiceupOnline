import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
const photo = readFileSync(new URL("../src/components/PublicSupporterPhoto.tsx", import.meta.url), "utf8");
test("backend signing does not reject referrals from the restricted public signer snapshot", () => {
  assert.match(app, /const localReferrer = isBackendConfigured\s*\? undefined\s*:\s*findReferrer/);
  assert.match(app, /if \(!isBackendConfigured && referralInput && !localReferrer\)/);
});
test("public referral UI does not disclose a matched supporter identity", () => {
  assert.doesNotMatch(page, /getSafeReferrerLabel|Referring supporter:/);
  assert.match(page, /\{copy\.referralOptional\}/);
});
test("photo upload preserves actionable error detail", () => {
  assert.match(photo, /setMessage\(copy\.uploadFailed\)/u);
  assert.doesNotMatch(photo, /error instanceof Error \? error\.message\.trim\(\)/u);
  assert.doesNotMatch(photo, /setMessage\([^;\n]*error\.message/u);
});
