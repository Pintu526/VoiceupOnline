import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../src/pages/SaasAppLoginPage.tsx", import.meta.url), "utf8");
const resetSource = readFileSync(new URL("../src/pages/SaasAdminPasswordResetPage.tsx", import.meta.url), "utf8");
const routingSource = readFileSync(new URL("../src/utils/routing.ts", import.meta.url), "utf8");

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

test("the dedicated reset route is rendered before homepage routing", () => {
  assert.match(routingSource, /window\.location\.pathname === "\/admin\/reset-password"/);
  assert.match(routingSource, /return slug === "reset-password" \? "" : slug;/);
  const resetRouteIndex = appSource.indexOf("if (isSaasAdminPasswordResetRoute)");
  const homepageRouteIndex = appSource.indexOf("if (isLandingPageRoute || isStartRoute)");
  assert.ok(resetRouteIndex >= 0);
  assert.ok(homepageRouteIndex > resetRouteIndex);
});

test("only Supabase PASSWORD_RECOVERY opens the in-memory reset gate", () => {
  const listenerSource = slice(
    backendSource,
    "supabase.auth.onAuthStateChange",
    "export const isSupabaseAuthAvailable"
  );
  assert.match(listenerSource, /event === "PASSWORD_RECOVERY"/);
  assert.match(listenerSource, /setPasswordRecoverySession\(session\.user\.id\)/);
  assert.doesNotMatch(listenerSource, /event === "SIGNED_IN"/);
});

test("password update requires the recovery user and current session user to match", () => {
  const updateSource = slice(
    backendSource,
    "export async function updatePasswordFromRecovery",
    "export async function signOutSupabase"
  );
  const gateIndex = updateSource.indexOf("!supabase || !passwordRecoveryUserId");
  const userMatchIndex = updateSource.indexOf("sessionData.session.user.id !== recoveryUserId");
  const updateIndex = updateSource.indexOf("supabase.auth.updateUser({ password: newPassword })");
  assert.ok(gateIndex >= 0);
  assert.ok(userMatchIndex > gateIndex);
  assert.ok(updateIndex > userMatchIndex);
  assert.doesNotMatch(updateSource, /console\.(log|warn|error|debug)/);
});

test("recovery requests use a fixed reset route and do not reveal account existence", () => {
  assert.match(backendSource, /new URL\("\/admin\/reset-password", window\.location\.origin\)/);
  assert.match(backendSource, /resetPasswordForEmail\(email, \{ redirectTo \}\)/);
  assert.match(loginSource, /If the account exists, a password recovery link has been sent\./);
});

test("reset UI includes confirmation, expiry handling and a safe return to admin login", () => {
  assert.match(resetSource, />New Password</);
  assert.match(resetSource, />Confirm Password</);
  assert.match(resetSource, /newPassword !== confirmPassword/);
  assert.match(resetSource, /errorCode === "otp_expired"/);
  assert.match(resetSource, /invalid or has already been used/);
  assert.match(resetSource, /signOutSupabase\(\)/);
  assert.match(resetSource, /window\.location\.replace\("\/admin\?passwordReset=success"\)/);
  assert.doesNotMatch(resetSource, /console\.(log|warn|error|debug)/);
});

test("existing SaaS Admin role authorization remains required after sign-in", () => {
  const loginHandler = slice(appSource, "async function submitAppLogin", "async function logoutAppAdmin");
  assert.match(loginHandler, /signInWithSupabase\(email, passcode\)/);
  assert.match(loginHandler, /if \(context\.platformAdmin\)/);
  assert.match(loginHandler, /const allowLocalFallback = !isSupabaseAuthAvailable;/);
});
