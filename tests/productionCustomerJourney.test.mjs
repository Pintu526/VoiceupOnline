import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function objectKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child)
      ? [path, ...objectKeys(child, path)]
      : [path];
  });
}

const publicPage = source("../src/pages/PublicCampaignPage.tsx");
const inlineAuth = source("../src/components/CampaignInlineAuthPanel.tsx");
const claimPanel = source("../src/components/SupporterAccountClaimPanel.tsx");
const signingEdge = source("../supabase/functions/voiceup-public-signing/index.ts");
const receiptEdge = source("../supabase/functions/voiceup-participation-receipts/index.ts");
const receiptMigration = source("../supabase/migrations/20261030010000_participation_email_receipts.sql");

test("the campaign container offers accessible support and sign-in paths without changing six-step signing", () => {
  assert.match(publicPage, /className="public-campaign-sign-in"/);
  assert.match(publicPage, /CampaignInlineAuthPanel/);
  assert.match(publicPage, /const campaignAccountAccessPath = getCampaignLoginPath\(\{/);
  assert.match(
    publicPage,
    /const signingSteps:[\s\S]*"phone"[\s\S]*"otp"[\s\S]*"profile"[\s\S]*"address"[\s\S]*"review"[\s\S]*"done"/
  );
  assert.equal((publicPage.match(/\{ id: "(?:phone|otp|profile|address|review|done)" \}/g) ?? []).length, 6);
});

test("inline auth reuses verified Supabase email auth, recovery, and authoritative campaign routing", () => {
  assert.match(inlineAuth, /loginSupporterWithEmail/);
  assert.match(inlineAuth, /requestSupporterEmailOtp/);
  assert.match(inlineAuth, /verifySupporterEmailOtp/);
  assert.match(inlineAuth, /requestSupporterPasswordRecovery/);
  assert.match(inlineAuth, /PasswordField/);
  assert.match(inlineAuth, /loadVoiceupAccessManifest/);
  assert.match(inlineAuth, /resolveCampaignSupporterDestination/);
  assert.match(inlineAuth, /getCampaignLoginPath/);
  assert.match(inlineAuth, /noCampaignAccess/);
  assert.doesNotMatch(inlineAuth, /signInWithPhone|type="tel"|phoneOtp|email.*(?:role|permission)/iu);
});

test("campaign header account access opens the contextual account creation and login experience", () => {
  const loginPage = source("../src/pages/VoiceupLoginPage.tsx");
  assert.match(loginPage, /type LoginMode = "sign_in" \| "register"/);
  assert.match(loginPage, /registerSupporterWithEmailForContext\(email, password, returnPath\)/);
  assert.match(loginPage, /readCampaignAuthContext\(window\.location\.search\)/);
  assert.doesNotMatch(loginPage, /submitPublicSignature|onSubmitMovementRequest|voiceup-public-signing/);
});

test("optional claiming reuses the participation email and preserves memory-only server claiming", () => {
  assert.match(claimPanel, /const email = signingEmail/);
  assert.match(claimPanel, /claimSupporterAccount\(grant\)/);
  assert.match(claimPanel, /requestSupporterPasswordRecovery/);
  assert.match(claimPanel, /copy\.emailMismatch/);
  assert.match(claimPanel, /href=\{`\/account\/supporter\/\$\{encodeURIComponent\(linked\.accountId\)\}`\}/);
  assert.doesNotMatch(claimPanel, /type="email"|localStorage|sessionStorage|URLSearchParams|console\./);
});

test("post-sign account access remains inside the signing journey without nesting forms", () => {
  assert.doesNotMatch(claimPanel, /<form\b/);
  assert.match(claimPanel, /PasswordField/);
  assert.match(claimPanel, /autoComplete=\{authMode === "register" \? "new-password" : "current-password"\}/);
  assert.match(claimPanel, /registerSupporterWithEmailForContext\(email, password, campaignLoginPath\)/);
  assert.match(claimPanel, /role="tablist"/);
  assert.match(claimPanel, /aria-busy=\{busy\}/);
});

test("receipt SQL is private, canonical, idempotent, and retry-safe", () => {
  assert.match(receiptMigration, /create table if not exists public\.voiceup_participation_email_receipts/i);
  assert.match(receiptMigration, /unique \(workspace_id, campaign_id, supporter_id\)/i);
  assert.match(receiptMigration, /unique \(workspace_id, signing_idempotency_key\)/i);
  assert.match(receiptMigration, /on conflict \(workspace_id, campaign_id, supporter_id\) do nothing/i);
  assert.match(receiptMigration, /jsonb_array_elements\(coalesce\(v_workspace -> 'signers'/i);
  assert.match(receiptMigration, /campaign\.value ->> 'status' = 'Published'/i);
  assert.match(receiptMigration, /enable row level security/i);
  assert.match(receiptMigration, /revoke all on table[\s\S]*from public, anon, authenticated/i);
  assert.equal((receiptMigration.match(/voiceup:service_role_required/g) ?? []).length, 3);
  assert.match(receiptMigration, /for update skip locked/i);
  assert.match(receiptMigration, /attempt_count < 5/i);
  assert.match(receiptMigration, /status = 'retry'[\s\S]*interval '2 minutes'[\s\S]*interval '10 minutes'[\s\S]*interval '1 hour'[\s\S]*interval '6 hours'/i);
  assert.doesNotMatch(receiptMigration, /grant execute[\s\S]{0,180}\b(?:anon|authenticated)\b/i);
});

test("backend-confirmed participation queues receipts fail-open after signing", () => {
  const successCheck = signingEdge.indexOf("if (!data?.ok)");
  const queueCall = signingEdge.lastIndexOf("await queueParticipationReceipt(");
  assert.ok(successCheck >= 0 && queueCall > successCheck);
  assert.match(signingEdge, /voiceup_enqueue_participation_email_receipt/);
  assert.match(signingEdge, /voiceup-participation-receipts/);
  assert.match(signingEdge, /catch \{\s*return \{ status: "queued" \};\s*\}/);
  assert.match(signingEdge, /responseData = \{ \.\.\.responseData, participationReceipt \}/);
  assert.match(signingEdge, /grant failure must never roll back/i);
});

test("receipt worker authenticates a dedicated scheduler secret and sends only safe participation content", () => {
  assert.match(receiptEdge, /VOICEUP_RECEIPT_WORKER_SECRET/);
  assert.match(receiptEdge, /authorizedWorkerRequest/);
  assert.match(receiptEdge, /expected\.length < 32/);
  assert.match(receiptEdge, /difference \|= left\[index\] \^ right\[index\]/);
  assert.match(receiptEdge, /RESEND_API_KEY/);
  assert.match(receiptEdge, /VOICEUP_RECEIPT_FROM_EMAIL/);
  assert.match(receiptEdge, /https:\/\/api\.resend\.com\/emails/);
  assert.match(receiptEdge, /dev-mail\.voiceup\.live/);
  assert.match(receiptEdge, /"Idempotency-Key": job\.receiptId/);
  assert.match(receiptEdge, /Authorization: `Bearer \$\{sender\.apiKey\}`/);
  assert.match(receiptEdge, /from: `\$\{sender\.name\} <\$\{sender\.email\}>`/);
  assert.match(receiptEdge, /const messageId = typeof data\.id === "string"/);
  assert.match(receiptEdge, /ravweavcfrpiykfgtmbf/);
  assert.doesNotMatch(receiptEdge, /seseeabxmnsrhghthemd/);
  assert.doesNotMatch(receiptEdge, /BREVO_API_KEY|api\.brevo\.com/);
  assert.match(receiptEdge, /Supporter reference/);
  assert.match(receiptEdge, /Recorded/);
  assert.match(receiptEdge, /Campaign:/);
  assert.match(receiptEdge, /Referral link:/);
  assert.doesNotMatch(receiptEdge, /QR journey|Account sign in|Forgot password/);
  assert.match(receiptEdge, /does not verify account ownership or grant campaign permissions/);
  assert.match(receiptEdge, /parsed\.search/);
  assert.match(receiptEdge, /parsed\.hash/);
  assert.doesNotMatch(receiptEdge, /claimGrant|claim_token|access_token|refresh_token|password:|otp:/i);
  assert.doesNotMatch(receiptEdge, /console\.(?:log|info|debug)/);
  assert.doesNotMatch(receiptEdge, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(signingEdge, /VOICEUP_RECEIPT_WORKER_SECRET/);
  assert.doesNotMatch(signingEdge, /Authorization: `Bearer \$\{serviceRoleKey\}`/);
});

test("new customer-journey copy remains structurally complete in English, Hindi, and Odia", () => {
  const locales = ["en", "hi", "or"].map((locale) => JSON.parse(
    source(`../src/i18n/locales/${locale}.json`)
  ));
  for (const path of [["account", "login"], ["public", "success", "receipt"]]) {
    const values = locales.map((locale) => path.reduce((value, key) => value?.[key], locale));
    const expected = objectKeys(values[0]).sort();
    assert.ok(expected.length > 0);
    assert.deepEqual(objectKeys(values[1]).sort(), expected);
    assert.deepEqual(objectKeys(values[2]).sort(), expected);
  }
});
