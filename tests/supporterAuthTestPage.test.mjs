import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SupporterAuthError } from "../src/supporterAuth.ts";
import {
  isLocalSupporterAuthTestHost,
  safeSupporterAuthTestError
} from "../src/supporterAuthTestPage.ts";
import { getSupporterLoginPath } from "../src/supporterEmailConfirmation.ts";

test("supporter auth test page is restricted to loopback hostnames", () => {
  assert.equal(isLocalSupporterAuthTestHost("localhost"), true);
  assert.equal(isLocalSupporterAuthTestHost("127.0.0.1"), true);
  assert.equal(isLocalSupporterAuthTestHost("::1"), true);
  assert.equal(isLocalSupporterAuthTestHost("voiceup.live"), false);
  assert.equal(isLocalSupporterAuthTestHost("localhost.example.com"), false);
});

test("test page reports only bounded safe authentication errors", () => {
  assert.equal(
    safeSupporterAuthTestError("login", new Error("raw provider response with account details")),
    "Login failed. Check your credentials and confirmation status."
  );
  assert.equal(
    safeSupporterAuthTestError(
      "register",
      new SupporterAuthError("supporter_email_confirmation_not_enforced")
    ),
    "Registration is unavailable because email confirmation is not enabled."
  );
  assert.equal(
    safeSupporterAuthTestError("login", new SupporterAuthError("supporter_email_not_confirmed")),
    "Confirm your email before signing in."
  );
  assert.equal(
    safeSupporterAuthTestError("recover", new Error("private provider response")),
    "Password recovery could not be started. Try again later."
  );
});

test("confirmation page returns to the test login on localhost only", () => {
  assert.equal(getSupporterLoginPath("localhost"), "/login");
  assert.equal(getSupporterLoginPath("127.0.0.1"), "/login");
  assert.equal(getSupporterLoginPath("voiceup.live"), "/login");
});

test("test page is unlinked from GSAA and excluded from production build inputs", () => {
  const page = readFileSync(new URL("../supporter-auth-test.html", import.meta.url), "utf8");
  const moduleSource = readFileSync(
    new URL("../src/supporterAuthTestPage.ts", import.meta.url),
    "utf8"
  );
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const publicPageSource = readFileSync(
    new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
    "utf8"
  );
  const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

  assert.match(page, /id="supporter-auth-email"/);
  assert.match(page, /id="supporter-auth-password"/);
  assert.match(page, />Register</);
  assert.match(page, />Login</);
  assert.match(page, />Forgot password\?</);
  assert.match(moduleSource, /registerSupporterWithEmail/);
  assert.match(moduleSource, /loginSupporterWithEmail/);
  assert.match(moduleSource, /requestSupporterPasswordRecovery/);
  assert.doesNotMatch(appSource, /supporter-auth-test|SupporterAuthTest/);
  assert.doesNotMatch(publicPageSource, /supporter-auth-test|SupporterAuthTest/);
  assert.doesNotMatch(viteConfig, /supporter-auth-test\.html/);
});
