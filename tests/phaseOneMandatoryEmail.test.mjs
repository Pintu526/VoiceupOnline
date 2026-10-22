import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isValidPublicSignerEmail } from "../src/publicSigningJourney.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../src/App.tsx");
const page = read("../src/pages/PublicCampaignPage.tsx");
const blueprint = read("../src/config/goudhanCampaignBlueprint.ts");
const signingEdge = read("../supabase/functions/voiceup-public-signing/index.ts");
const signingLogic = read("../supabase/functions/voiceup-public-signing/logic.ts");
const workspaceMerge = read("../supabase/functions/_shared/workspaceStateMerge.ts");
const migration = read("../supabase/migrations/20261019010000_screen_otp_public_signing.sql");

test("Phase 1 email validation accepts a bounded address and rejects absent or malformed values", () => {
  assert.equal(isValidPublicSignerEmail(" signer@example.org "), true);
  assert.equal(isValidPublicSignerEmail(""), false);
  assert.equal(isValidPublicSignerEmail("signer-at-example.org"), false);
  assert.equal(isValidPublicSignerEmail("signer@example"), false);
  assert.equal(isValidPublicSignerEmail(`${"a".repeat(248)}@x.test`), false);
});

test("GSAA requires email in the campaign model and client journey even for persisted campaigns", () => {
  assert.match(blueprint, /requiredFields:\s*\["phone", "name", "email", "state", "district", "block"\]/);
  assert.match(page, /const emailRequired = isRequired\("email"\) \|\| isGoudhanExperience/);
  assert.match(page, /const emailReady = publicForm\.email\.trim\(\)[\s\S]*isValidPublicSignerEmail\(publicForm\.email\)[\s\S]*!emailRequired/);
  assert.match(app, /isGoudhanProductionCampaign\(activeCampaign, organization\)[\s\S]*!isValidPublicSignerEmail\(phaseOneEmail\)/);
});

test("the service-only screen-signing wrapper independently rejects a missing or invalid email", () => {
  const screenBranch = migration.slice(migration.indexOf("if v_method <> 'screen_otp'"));
  assert.match(screenBranch, /if p_action = 'submit_support' then/);
  assert.match(screenBranch, /p_payload #>> '\{profile,email\}'/);
  assert.match(screenBranch, /length\(v_email\) > 254/);
  assert.match(screenBranch, /voiceup:invalid_email/);
  assert.match(signingEdge, /invalid_email:\s*\{ status: 400/);
});

test("screen signing records verification evidence without ownership claims", () => {
  assert.match(signingLogic, /"emailOwnershipVerified"/);
  assert.match(workspaceMerge, /"emailOwnershipVerified"/);
  assert.ok((migration.match(/'emailOwnershipVerified', false/g) ?? []).length >= 6);
  assert.match(app, /verificationMethod: result\.verificationMethod,[\s\S]*emailOwnershipVerified: false/);
  assert.match(page, /Mobile number and email ownership were not verified/);
});

test("GSAA public controls use verification wording without changing generic OTP contracts", () => {
  assert.match(page, /requestVerification: "Continue to verification"/);
  assert.match(page, /verifyCode: "Verify"/);
  assert.match(page, /isGoudhanExperience \? copy\.requestVerification : t\("public\.sendOtp"\)/);
  assert.match(page, /isGoudhanExperience \? copy\.verifyCode : t\("public\.verifyOtp"\)/);
  assert.match(page, /requestVerification: "सत्यापन के लिए आगे बढ़ें"/);
  assert.match(page, /requestVerification: "ଯାଞ୍ଚ ପାଇଁ ଆଗକୁ ବଢ଼ନ୍ତୁ"/);
});
