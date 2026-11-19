import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const inlineAuth = read("../src/components/CampaignInlineAuthPanel.tsx");
const claimPanel = read("../src/components/SupporterAccountClaimPanel.tsx");
const publicPage = read("../src/pages/PublicCampaignPage.tsx");

test("approved Google authentication is campaign-contextual account auth without an extra Email OTP", () => {
  const googleStart = inlineAuth.indexOf("async function continueWithGoogle()");
  const googleEnd = inlineAuth.indexOf("\n  function openDestination", googleStart);
  const googleFlow = inlineAuth.slice(googleStart, googleEnd);

  assert.match(googleFlow, /signInWithOAuth\(\{[\s\S]*provider:\s*"google"/);
  assert.match(googleFlow, /redirectTo:[\s\S]*\/c\/\$\{encodeURIComponent\(context\.campaignSlug/);
  assert.doesNotMatch(googleFlow, /requestSupporterEmailOtp|verifySupporterEmailOtp/);
});

test("approved non-Google authentication keeps password and optional Auth Email OTP separate from signing", () => {
  assert.match(inlineAuth, /type SignInMethod = "password" \| "email_otp"/);
  assert.match(inlineAuth, /loginSupporterWithEmail/);
  assert.match(inlineAuth, /requestSupporterEmailOtp/);
  assert.match(inlineAuth, /verifySupporterEmailOtp/);
  assert.doesNotMatch(claimPanel, /submitPublicSignature|mutatePublicParticipation|voiceup-public-signing/);
});

test("authenticated campaign routing checks exact owned participation before hiding the six-step journey", () => {
  const sessionStart = publicPage.indexOf("const [supporterSession,");
  const sessionEnd = publicPage.indexOf("const ownedCampaignSignature", sessionStart);
  const sessionFlow = publicPage.slice(sessionStart, sessionEnd);

  assert.match(sessionFlow, /manifest\.supporterOwnerships\.find\(\(item\) =>[\s\S]*item\.campaignId === campaign\.id/);
  assert.match(sessionFlow, /resolveCampaignSupporterDestination\(manifest/);
  assert.match(sessionFlow, /loadOwnedSupporterDashboard\(ownership\.accountId\)/);
  assert.match(publicPage, /const ownedCampaignSignature = supporterSession\?\.dashboard\?\.supporter\.status === "verified"/);
  assert.match(publicPage, /!hasSignedCampaign && !ownedCampaignSignature/);
});

test("an authenticated admin or unrelated account is never presented as a Supporter", () => {
  const sessionStart = publicPage.indexOf("const [supporterSession,");
  const sessionEnd = publicPage.indexOf("const ownedCampaignSignature", sessionStart);
  const sessionFlow = publicPage.slice(sessionStart, sessionEnd);

  assert.doesNotMatch(
    sessionFlow,
    /name:\s*dashboard\?\.supporter\.name\.trim\(\)\s*\|\|\s*ownership\?\.supporterName\.trim\(\)\s*\|\|\s*"Supporter"/
  );
});

test("Google-after-signing reuses authenticated ownership and the canonical claim path", () => {
  assert.match(claimPanel, /getCurrentSupporterIdentity\(\)/);
  assert.match(claimPanel, /readOwnSupporterAccountLinks\(\)/);
  assert.match(claimPanel, /claimSupporterAccount\(grant\)/);
  assert.match(claimPanel, /getCampaignLoginPath\(\{ campaignId, campaignSlug \}\)/);
  assert.doesNotMatch(claimPanel, /requestSupporterEmailOtp|verifySupporterEmailOtp|signInWithOtp/);
});

test("the approved routing update adds neither SMS auth nor a second signing engine", () => {
  assert.doesNotMatch(`${inlineAuth}\n${claimPanel}`, /signInWithPhone|smsOtp|requestSms|verifySms/);
  assert.doesNotMatch(claimPanel, /insert\s+into|update\s+public\.|voiceup_workspace_members|voiceup_coordinators/i);
  assert.match(publicPage, /const signingSteps:[\s\S]*"phone"[\s\S]*"otp"[\s\S]*"profile"[\s\S]*"address"[\s\S]*"review"[\s\S]*"done"/);
});
