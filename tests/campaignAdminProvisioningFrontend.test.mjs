import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyCampaignAdminProvisioningFailure,
  applyCampaignAdminProvisioningSuccess,
  CAMPAIGN_ADMIN_PROVISIONING_MESSAGES,
  describeCampaignAdminProvisioningStatus,
  evaluateCampaignAdminProvisioningGate,
  formatCampaignAdminProvisioningFailure,
  shouldWarnBeforeReplacingCampaignAdmin
} from "../src/utils/campaignAdminProvisioning.ts";

function baseCampaign(overrides = {}) {
  return {
    id: "cmp-1",
    slug: "test-campaign",
    title: "Test Campaign",
    adminEmail: "",
    adminPasscode: "",
    adminProvisioningStatus: undefined,
    ...overrides
  };
}

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function extractFunctionBody(source, functionSignaturePattern) {
  const match = source.match(functionSignaturePattern);
  assert.ok(match, `expected to find a function matching ${functionSignaturePattern}`);
  const startIndex = match.index + match[0].length;
  let depth = 1;
  let index = startIndex;
  while (depth > 0 && index < source.length) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    index += 1;
  }
  return source.slice(startIndex, index - 1);
}

// ── 1. Every new campaign can use a different Campaign Admin email ─────────
test("provisioning accepts whatever email is submitted -- no fixed/global email is enforced", () => {
  const gateA = evaluateCampaignAdminProvisioningGate({
    isSavedCampaign: true,
    email: "first-admin@example.org",
    password: "correct-horse-battery-staple",
    hasCampaignAdminAccessFeature: true,
    provisioningInProgress: false
  });
  const gateB = evaluateCampaignAdminProvisioningGate({
    isSavedCampaign: true,
    email: "second-admin@example.org",
    password: "another-strong-password",
    hasCampaignAdminAccessFeature: true,
    provisioningInProgress: false
  });
  assert.deepEqual(gateA, { allowed: true });
  assert.deepEqual(gateB, { allowed: true });

  const appSource = readSource("../src/App.tsx");
  const body = extractFunctionBody(appSource, /async function provisionCampaignAdminAccount\(email: string, password: string\) \{/);
  assert.match(body, /email:\s*trimmedEmail/);
  assert.doesNotMatch(body, /email:\s*["'][^"']+@[^"']+["']/);
});

// ── 2. Stable campaign/workspace/resource IDs are sent ──────────────────────
test("the provisioning call sends the campaign's own stable id/slug and the current workspace id", () => {
  const appSource = readSource("../src/App.tsx");
  const body = extractFunctionBody(appSource, /async function provisionCampaignAdminAccount\(email: string, password: string\) \{/);
  assert.match(body, /workspaceId:\s*getCurrentWorkspaceId\(\)/);
  assert.match(body, /resourceId:\s*campaignDraft\.id/);
  assert.match(body, /resourceSlug:\s*campaignDraft\.slug/);
});

// ── 3. Password is passed only to the Edge Function invocation ─────────────
test("the raw password is never passed to a logging, audit, or persistence sink", () => {
  const appSource = readSource("../src/App.tsx");
  const body = extractFunctionBody(appSource, /async function provisionCampaignAdminAccount\(email: string, password: string\) \{/);
  const provisionCallMatch = body.match(/await provisionWorkspaceMember\(\{[\s\S]*?\}\);/);
  assert.ok(provisionCallMatch, "expected a provisionWorkspaceMember({...}) call");
  const gateCallMatch = body.match(/evaluateCampaignAdminProvisioningGate\(\{[\s\S]*?\}\);/);
  assert.ok(gateCallMatch, "expected an evaluateCampaignAdminProvisioningGate({...}) call");
  // `password` may only be read inside the gate-validation call and the Edge Function call
  // (both legitimate, transient uses); everywhere else in this function it must be absent
  // (comments that merely mention the word, e.g. "never includes the password", are fine).
  const outsideLegitimateUses = body
    .replace(provisionCallMatch[0], "")
    .replace(gateCallMatch[0], "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(outsideLegitimateUses, /\bpassword\b/);
  // And explicitly, it must never reach any logging/audit/persistence call.
  assert.doesNotMatch(body, /console\.(log|info|warn|error)\([^)]*\bpassword\b/i);
  assert.doesNotMatch(body, /addAuditLog\([^)]*\bpassword\b/i);
  assert.doesNotMatch(body, /setCampaign(s|Draft)\([^)]*\bpassword\b/i);
});

// ── 4. Password is not persisted in Campaign JSON ───────────────────────────
test("applyCampaignAdminProvisioningSuccess never includes a password field and clears legacy adminPasscode", () => {
  const campaign = baseCampaign({ adminPasscode: "old-plaintext-leftover" });
  const result = applyCampaignAdminProvisioningSuccess(campaign, "new-admin@example.org");
  assert.equal(result.adminEmail, "new-admin@example.org");
  assert.equal(result.adminPasscode, "");
  assert.equal("password" in result, false);
  assert.equal(JSON.stringify(result).toLowerCase().includes("password"), false);
});

// ── 5. Password is not logged or returned ───────────────────────────────────
test("provisionCampaignAdminAccount never logs the password and pure helpers never echo it back in a result", () => {
  const appSource = readSource("../src/App.tsx");
  const body = extractFunctionBody(appSource, /async function provisionCampaignAdminAccount\(email: string, password: string\) \{/);
  assert.doesNotMatch(body, /console\.(log|info|warn|error)\([^)]*password/i);

  const provisioningSource = readSource("../src/utils/campaignAdminProvisioning.ts");
  // The module legitimately accepts `password` as an input parameter/type, but must never
  // interpolate it into a returned message or a persisted Campaign field.
  assert.doesNotMatch(provisioningSource, /message:\s*[^,}]*input\.password/);
  assert.doesNotMatch(provisioningSource, /return\s*\{[^}]*password/i);
});

// ── 6. Legacy adminPasscode is no longer generated for new campaigns ───────
test("createCampaign() never calls createAdminPasscode() and leaves adminPasscode blank", () => {
  const appSource = readSource("../src/App.tsx");
  const body = extractFunctionBody(appSource, /function createCampaign\(\) \{/);
  assert.doesNotMatch(body, /createAdminPasscode\(/);
  assert.match(body, /adminPasscode:\s*["']["']/);
  assert.match(body, /adminProvisioningStatus:\s*["']unprovisioned["']/);
});

// ── 7. Provisioning success finalizes the campaign ──────────────────────────
test("a successful provisioning transition marks the campaign as provisioned", () => {
  const campaign = baseCampaign({ adminProvisioningStatus: "unprovisioned" });
  const result = applyCampaignAdminProvisioningSuccess(campaign, "admin@example.org");
  assert.equal(result.adminProvisioningStatus, "provisioned");
});

// ── 8. Provisioning failure does not produce a fully configured campaign ───
test("a failed first-time provisioning attempt is recorded as provisioning_failed, not provisioned", () => {
  const campaign = baseCampaign({ adminProvisioningStatus: "unprovisioned" });
  const result = applyCampaignAdminProvisioningFailure(campaign);
  assert.equal(result.adminProvisioningStatus, "provisioning_failed");
  assert.notEqual(result.adminProvisioningStatus, "provisioned");
});

test("a failed REPLACEMENT attempt does not downgrade an already-working Campaign Admin", () => {
  const campaign = baseCampaign({ adminProvisioningStatus: "provisioned", adminEmail: "existing-admin@example.org" });
  const result = applyCampaignAdminProvisioningFailure(campaign);
  assert.equal(result.adminProvisioningStatus, "provisioned");
  assert.equal(result, campaign);
});

// ── 9. Campaign replacement updates email only after success ───────────────
test("campaignDraft/campaigns are only updated with the new email AFTER the Edge Function call resolves", () => {
  const appSource = readSource("../src/App.tsx");
  const body = extractFunctionBody(appSource, /async function provisionCampaignAdminAccount\(email: string, password: string\) \{/);
  const provisionCallIndex = body.indexOf("await provisionWorkspaceMember(");
  const successUpdateIndex = body.indexOf("applyCampaignAdminProvisioningSuccess(campaignDraft, trimmedEmail)");
  assert.ok(provisionCallIndex >= 0 && successUpdateIndex >= 0);
  assert.ok(provisionCallIndex < successUpdateIndex, "email must only be updated after the provisioning call");
});

// ── 10. Previous assignment replacement is delegated to the Edge Function ──
test("the frontend never attempts its own revoke/replace logic -- it delegates entirely to the Edge Function", () => {
  const appSource = readSource("../src/App.tsx");
  const body = extractFunctionBody(appSource, /async function provisionCampaignAdminAccount\(email: string, password: string\) \{/);
  assert.doesNotMatch(body, /revoke/i);
  assert.doesNotMatch(body, /\.from\(["']workspace_resource_members["']\)/);
});

// ── 11. Legacy campaign can be re-provisioned ───────────────────────────────
test("a saved legacy campaign with no adminProvisioningStatus at all can still be (re-)provisioned", () => {
  const gate = evaluateCampaignAdminProvisioningGate({
    isSavedCampaign: true,
    email: "legacy-admin@example.org",
    password: "correct-horse-battery-staple",
    hasCampaignAdminAccessFeature: true,
    provisioningInProgress: false
  });
  assert.deepEqual(gate, { allowed: true });
});

// ── 12. Re-provisioning requires a new password ─────────────────────────────
test("the gate rejects an empty or too-short password even for an already-provisioned campaign", () => {
  const rejectedEmpty = evaluateCampaignAdminProvisioningGate({
    isSavedCampaign: true,
    email: "admin@example.org",
    password: "",
    hasCampaignAdminAccessFeature: true,
    provisioningInProgress: false
  });
  assert.equal(rejectedEmpty.allowed, false);
  assert.equal(rejectedEmpty.allowed === false && rejectedEmpty.reason, "invalid_credentials");

  const rejectedShort = evaluateCampaignAdminProvisioningGate({
    isSavedCampaign: true,
    email: "admin@example.org",
    password: "short",
    hasCampaignAdminAccessFeature: true,
    provisioningInProgress: false
  });
  assert.equal(rejectedShort.allowed, false);
});

test("the re-provisioning password field is never pre-filled from a stored campaign value", () => {
  const campaignsTabSource = readSource("../src/pages/app/CampaignsTab.tsx");
  assert.match(campaignsTabSource, /\/\/ Ephemeral, local-only input[\s\S]{0,300}useState\(""\)/);
  assert.doesNotMatch(campaignsTabSource, /campaignAdminNewPassword,\s*setCampaignAdminNewPassword\]\s*=\s*useState\(campaignDraft/);
});

// ── 13. campaign_admin_access restriction blocks provisioning ──────────────
test("the gate rejects provisioning when campaign_admin_access is not included, even with valid credentials", () => {
  const gate = evaluateCampaignAdminProvisioningGate({
    isSavedCampaign: true,
    email: "admin@example.org",
    password: "correct-horse-battery-staple",
    hasCampaignAdminAccessFeature: false,
    provisioningInProgress: false
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.allowed === false && gate.reason, "plan_restricted");
  assert.equal(gate.allowed === false && gate.message, CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.planRestricted);
});

// ── 14. Upgrade action appears when restricted ──────────────────────────────
test("CampaignsTab renders the plan-restricted message and an Upgrade action when campaign_admin_access is unavailable", () => {
  const campaignsTabSource = readSource("../src/pages/app/CampaignsTab.tsx");
  assert.match(campaignsTabSource, /campaignEntitlements\.features\.campaign_admin_access !== true/);
  assert.match(campaignsTabSource, /CAMPAIGN_ADMIN_PROVISIONING_MESSAGES\.planRestricted/);
  assert.match(campaignsTabSource, /onClick=\{onNavigateToUpgrade\}/);
  assert.match(campaignsTabSource, /CAMPAIGN_ADMIN_PROVISIONING_MESSAGES\.upgradeAction/);
});

// ── 15. Successful upgrade refreshes entitlements and permits provisioning ─
test("campaignEntitlements is recomputed from organization on every change and threaded live into CampaignsTab (no stale cache, no logout)", () => {
  const appShellSource = readSource("../src/layouts/AppShell.tsx");
  assert.match(
    appShellSource,
    /const campaignEntitlements = useMemo\(\(\) => getCampaignEntitlements\(organization\), \[organization\]\);/
  );
  assert.match(appShellSource, /campaignEntitlements=\{campaignEntitlements\}/);
  assert.match(appShellSource, /onNavigateToUpgrade=\{\(\) => setActiveTab\("saas"\)\}/);
});

// ── 16. Duplicate provisioning submission is blocked ────────────────────────
test("the gate rejects a submission while one is already in progress, before any other check", () => {
  const gate = evaluateCampaignAdminProvisioningGate({
    isSavedCampaign: true,
    email: "admin@example.org",
    password: "correct-horse-battery-staple",
    hasCampaignAdminAccessFeature: true,
    provisioningInProgress: true
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.allowed === false && gate.reason, "already_in_progress");
});

test("the provisioning button is disabled while a submission is pending", () => {
  const campaignsTabSource = readSource("../src/pages/app/CampaignsTab.tsx");
  assert.match(campaignsTabSource, /disabled=\{campaignAdminProvisioningPending \|\|/);
});

// ── 17. SaaS Admin session is not replaced or logged out ────────────────────
test("provisionCampaignAdminAccount never signs in/out or mutates SaaS Admin authentication state", () => {
  const appSource = readSource("../src/App.tsx");
  const body = extractFunctionBody(appSource, /async function provisionCampaignAdminAccount\(email: string, password: string\) \{/);
  assert.doesNotMatch(body, /signInWithSupabase|signOutSupabase|setIsPlatformAdminAuthenticated|writePlatformAdminSession|clearPlatformAdminSession/);
});

// ── 18. Role-constraint migration includes every legitimate role used in the repo ─
test("the role-constraint reconciliation migration preserves every role value actually used with voiceup_workspace_members", () => {
  const migration = readSource(
    "../supabase/migrations/20260720_workspace_members_role_constraint_reconciliation.sql"
  );
  for (const role of ["platform_owner", "workspace_admin", "campaign_admin", "field_officer", "viewer"]) {
    assert.match(migration, new RegExp(`'${role}'`));
  }
  assert.match(
    migration,
    /check \(role in \('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer', 'viewer'\)\)/
  );
  // Detects/drops the OLD constraint by its ACTUAL name (never a guessed literal name).
  assert.match(migration, /select conname\s*\n\s*from pg_constraint/);
  assert.match(migration, /execute format\('alter table public\.voiceup_workspace_members drop constraint %I', constraint_record\.conname\)/);
  // Never deletes or rewrites membership rows.
  assert.doesNotMatch(migration, /delete from public\.voiceup_workspace_members/i);
  assert.doesNotMatch(migration, /update public\.voiceup_workspace_members/i);
  // Never invalidates pre-existing rows.
  assert.match(migration, /not valid/);
});

// ── Supporting pure-logic coverage for the shared UI copy/state helpers ────
test("shouldWarnBeforeReplacingCampaignAdmin is true only when a Campaign Admin is already provisioned", () => {
  assert.equal(shouldWarnBeforeReplacingCampaignAdmin("provisioned"), true);
  assert.equal(shouldWarnBeforeReplacingCampaignAdmin("unprovisioned"), false);
  assert.equal(shouldWarnBeforeReplacingCampaignAdmin("provisioning_failed"), false);
  assert.equal(shouldWarnBeforeReplacingCampaignAdmin(undefined), false);
});

test("describeCampaignAdminProvisioningStatus reports incomplete until provisioning has actually succeeded", () => {
  assert.equal(describeCampaignAdminProvisioningStatus(undefined), CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.incomplete);
  assert.equal(describeCampaignAdminProvisioningStatus("unprovisioned"), CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.incomplete);
  assert.equal(describeCampaignAdminProvisioningStatus("provisioning_failed"), CAMPAIGN_ADMIN_PROVISIONING_MESSAGES.incomplete);
  assert.equal(describeCampaignAdminProvisioningStatus("provisioned"), null);
});

test("formatCampaignAdminProvisioningFailure prefixes the safe message with the required exact copy", () => {
  assert.equal(
    formatCampaignAdminProvisioningFailure("Something went wrong."),
    "Campaign Admin provisioning failed: Something went wrong."
  );
});
