import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const page = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");

test("screen OTP keeps anonymous precheck private and secure Sign In available", () => {
  assert.doesNotMatch(page, /supporterRoutingPrecheck\?\.supporterRoute/);
  assert.match(page, /routingToken=\{supporterRoutingPrecheck\?\.routingToken\}/);
  assert.match(page, /initialRoute=\{undefined\}/);
  assert.match(page, /applyVerificationOutcome\(outcome\)/);
  assert.match(page, /if \(outcome === "new_supporter"\) \{[\s\S]*setWizardStep\("profile"\)/);
  assert.match(page, /if \(outcome === "secure_access_required"\) \{[\s\S]*setAuthPopoverOpen\(true\)/);
  assert.match(page, /aria-controls="gsaa-header-auth-popover"[\s\S]*setAuthPopoverOpen/);
  assert.match(page, /id="gsaa-header-auth-popover"[\s\S]*<CampaignInlineAuthPanel/);
  assert.doesNotMatch(page, /Have you supported this campaign before\?/);
  assert.doesNotMatch(page, /Continue as new supporter/);
});

test("server-confirmed duplicate still redirects to sign-in", () => {
  assert.match(page, /publicMessage !== "existing_supporter_duplicate"\) return/);
  assert.match(page, /setVerificationOutcome\("secure_access_required"\)/);
});
