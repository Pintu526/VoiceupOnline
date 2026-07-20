import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

const loginSource = slice(appSource, "async function submitAppLogin", "async function logoutAppAdmin");
const provisionSource = slice(
  appSource,
  "async function provisionCampaignAdminAccount",
  "  function createCampaign()"
);
const campaignAdminLoginSource = slice(
  appSource,
  "async function submitCampaignAdminLogin",
  "async function logoutCampaignAdmin"
);
const logoutSource = slice(appSource, "async function logoutAppAdmin", "async function submitPublicSignature");

// ── 1 & 4: local/.env-only state cannot independently authenticate ─────────

test("local/.env fallback credentials can only authenticate when Supabase Auth is entirely unavailable", () => {
  assert.match(loginSource, /const allowLocalFallback = !isSupabaseAuthAvailable;/);
  assert.match(loginSource, /if \(allowLocalFallback && matchesConfiguredPlatformAdminCredentials/);
  // The old behavior (falling back to local credentials after a Supabase auth/role failure
  // while Supabase IS available) must be gone -- there is exactly one guarded fallback branch.
  const fallbackMatches = [...loginSource.matchAll(/matchesConfiguredPlatformAdminCredentials\(email, passcode\)/g)];
  assert.equal(fallbackMatches.length, 1);
});

test("a failed Supabase sign-in never sets local authenticated state inside the try/catch", () => {
  const signInBlock = loginSource.slice(
    loginSource.indexOf("if (isSupabaseAuthAvailable) {"),
    loginSource.indexOf("if (supabaseUser) {")
  );
  assert.doesNotMatch(signInBlock, /setIsPlatformAdminAuthenticated\(true\)/);
  assert.doesNotMatch(signInBlock, /writePlatformAdminSession/);
});

test("Supabase sign-in requires a real session (session + user + access token), not just a returned user", () => {
  assert.match(loginSource, /const session = signedInUser \? await getCurrentAuthSession\(\) : null;/);
  assert.match(loginSource, /if \(!signedInUser \|\| !session\)/);
});

test("the exact required SaaS Admin authentication-failure message is used", () => {
  assert.match(appSource, /const SAAS_ADMIN_AUTH_FAILURE_MESSAGE = "SaaS Admin email or password is incorrect\."/);
  assert.match(loginSource, /setAppLoginMessage\(SAAS_ADMIN_AUTH_FAILURE_MESSAGE\)/);
});

// ── 2 & 3: fail-fast session check gates provisioning before functions.invoke ──

test("missing Supabase session blocks provisioning before provisionWorkspaceMember (functions.invoke) is called", () => {
  const sessionCheckIndex = provisionSource.indexOf("await getCurrentAuthSession()");
  const invokeIndex = provisionSource.indexOf("await provisionWorkspaceMember(");
  assert.ok(sessionCheckIndex >= 0);
  assert.ok(invokeIndex > sessionCheckIndex);
  assert.match(provisionSource, /if \(!saasAdminSession\) {\s*setCampaignAdminProvisioningMessage\(SAAS_ADMIN_SESSION_DISCONNECTED_MESSAGE\);\s*return;\s*}/);
});

test("the exact required session-disconnected message is used", () => {
  assert.match(
    appSource,
    /const SAAS_ADMIN_SESSION_DISCONNECTED_MESSAGE =\s*"SaaS Admin session is not connected to Supabase\. Sign out and sign in again\."/
  );
});

test("getCurrentAuthSession requires session, user id, and access token all present", () => {
  const fnSource = slice(backendSource, "export async function getCurrentAuthSession", "export async function");
  assert.match(fnSource, /supabase\.auth\.getSession\(\)/);
  assert.match(fnSource, /session\?\.user\?\.id/);
  assert.match(fnSource, /session\.access_token/);
  // Never returns or logs the raw token -- only a minimal { userId } shape is returned.
  assert.match(fnSource, /return \{ userId: session\.user\.id \};/);
  assert.doesNotMatch(fnSource, /console\.(log|warn|error|debug)/);
});

// ── 5: SaaS Admin logout clears the Supabase session ────────────────────────

test("SaaS Admin logout calls Supabase signOut (only for an owned session) and clears only SaaS Admin state", () => {
  assert.match(logoutSource, /signOutSupabase\(\)/);
  assert.match(logoutSource, /clearPlatformAdminSession\(\)/);
  assert.match(logoutSource, /isSupabaseSessionOwnedBy\(ownership, "platform_admin"/);
  assert.doesNotMatch(logoutSource, /clearCampaignAdminSupabaseSession/);
});

// ── 6: no service-role secret referenced by browser code ───────────────────

test("no service-role secret is referenced anywhere in src/", () => {
  assert.doesNotMatch(appSource, /SUPABASE_SERVICE_ROLE|service_role_key/i);
  assert.doesNotMatch(backendSource, /SUPABASE_SERVICE_ROLE|service_role_key/i);
});

// ── 7, 8, 9: Campaign Admin login / Field Collection / public signing untouched ──

test("Campaign Admin login source is unaffected by the SaaS Admin hotfix", () => {
  assert.doesNotMatch(campaignAdminLoginSource, /SAAS_ADMIN_AUTH_FAILURE_MESSAGE/);
  assert.doesNotMatch(campaignAdminLoginSource, /SAAS_ADMIN_SESSION_DISCONNECTED_MESSAGE/);
  assert.doesNotMatch(campaignAdminLoginSource, /allowLocalFallback/);
  // Still uses its own, pre-existing exact message constants (Step 3 behavior intact).
  assert.match(campaignAdminLoginSource, /CAMPAIGN_ADMIN_ACCESS_MESSAGES\.authenticationFailure/);
});

test("Field Collection / secure field-upload source is unaffected by the SaaS Admin hotfix", () => {
  const secureUploadSource = readFileSync(new URL("../src/secureFieldUploadAuth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(secureUploadSource, /SAAS_ADMIN_AUTH_FAILURE_MESSAGE/);
  assert.doesNotMatch(secureUploadSource, /getCurrentAuthSession/);
  assert.match(secureUploadSource, /Field Collection is not included in the current plan\./);
  assert.match(secureUploadSource, /Secure field upload is not included in the current plan\./);
});

test("public signing source is unaffected by the SaaS Admin hotfix", () => {
  const fnSource = slice(
    backendSource,
    "export async function submitPublicSignatureSecure",
    "export async function uploadFileToStorage"
  );
  assert.match(fnSource, /voiceup-public-signing/);
  assert.doesNotMatch(fnSource, /getCurrentAuthSession/);
  assert.doesNotMatch(fnSource, /SAAS_ADMIN/);
});
