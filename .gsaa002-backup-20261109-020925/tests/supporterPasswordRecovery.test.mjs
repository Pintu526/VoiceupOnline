import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { requestSupporterPasswordRecovery } from "../src/supporterAuth.ts";
import {
  createSupporterRecoveryController,
  readSupporterRecoveryRequest
} from "../src/supporterPasswordResetPage.ts";

function fakeRecoveryClient(overrides = {}) {
  const calls = {
    exchange: [],
    getUser: 0,
    reset: [],
    signOut: [],
    unsubscribe: 0,
    update: []
  };
  let authCallback = () => {};
  const user = { id: "supporter-recovery-user", email: "supporter@example.com" };
  const client = {
    auth: {
      onAuthStateChange(callback) {
        authCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe() {
                calls.unsubscribe += 1;
              }
            }
          }
        };
      },
      async exchangeCodeForSession(code) {
        calls.exchange.push(code);
        const event = overrides.event ?? "PASSWORD_RECOVERY";
        const eventUser = overrides.eventUser ?? user;
        authCallback(event, { user: eventUser });
        return overrides.exchange ?? {
          data: { user, session: { user }, redirectType: "recovery" },
          error: null
        };
      },
      async getUser() {
        calls.getUser += 1;
        return overrides.verified ?? { data: { user }, error: null };
      },
      async updateUser(input) {
        calls.update.push(input);
        return overrides.update ?? { data: { user }, error: null };
      },
      async resetPasswordForEmail(email, options) {
        calls.reset.push({ email, options });
        return overrides.reset ?? { data: {}, error: null };
      },
      async signOut(options) {
        calls.signOut.push(options);
        return { error: null };
      }
    }
  };
  return { client, calls };
}

test("supporter recovery email uses the isolated localhost reset route", async () => {
  const { client, calls } = fakeRecoveryClient();
  await requestSupporterPasswordRecovery(
    " Supporter@Example.com ",
    "http://localhost:5173/supporter-auth-test.html",
    client
  );
  assert.deepEqual(calls.reset, [{
    email: "supporter@example.com",
    options: { redirectTo: "http://localhost:5173/supporter-reset-password.html" }
  }]);
});

test("a valid recovery requires PASSWORD_RECOVERY, recovery redirect type, and matching remote user", async () => {
  const code = "valid-supporter-recovery-code-1234";
  const request = readSupporterRecoveryRequest(`?code=${code}`, "");
  const { client, calls } = fakeRecoveryClient();
  const controller = createSupporterRecoveryController(client);

  assert.equal(await controller.establish(request), "ready");
  assert.equal(await controller.updatePassword("a-new-password-with-12-characters"), true);
  assert.deepEqual(calls.exchange, [code]);
  assert.equal(calls.getUser, 2);
  assert.deepEqual(calls.update, [{ password: "a-new-password-with-12-characters" }]);
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
  assert.equal(calls.unsubscribe, 1);
});

test("an ordinary supporter sign-in event cannot open the recovery gate", async () => {
  const { client, calls } = fakeRecoveryClient({ event: "SIGNED_IN" });
  const controller = createSupporterRecoveryController(client);
  const request = readSupporterRecoveryRequest("?code=ordinary-sign-in-code-12345", "");

  assert.equal(await controller.establish(request), "invalid");
  assert.equal(await controller.updatePassword("not-authorized-password"), false);
  assert.deepEqual(calls.update, []);
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("an existing supporter session alone cannot update a password", async () => {
  const { client, calls } = fakeRecoveryClient();
  const controller = createSupporterRecoveryController(client);
  assert.equal(await controller.updatePassword("not-authorized-password"), false);
  assert.equal(calls.getUser, 0);
  assert.deepEqual(calls.update, []);
});

test("expired, missing, credential-bearing, and malformed links fail before exchange", async () => {
  const requests = [
    readSupporterRecoveryRequest("", ""),
    readSupporterRecoveryRequest("?error=access_denied&error_code=otp_expired", ""),
    readSupporterRecoveryRequest("?code=short", ""),
    readSupporterRecoveryRequest("?code=first-valid-recovery-code&code=second-valid-recovery-code", ""),
    readSupporterRecoveryRequest("", "#access_token=unexpected&refresh_token=unexpected")
  ];

  for (const request of requests) {
    const { client, calls } = fakeRecoveryClient();
    const controller = createSupporterRecoveryController(client);
    assert.equal(await controller.establish(request), "invalid");
    assert.deepEqual(calls.exchange, []);
    assert.deepEqual(calls.update, []);
  }
});

test("supporter recovery remains isolated from GSAA/admin and is included as a secure build entry", () => {
  const page = readFileSync(new URL("../supporter-reset-password.html", import.meta.url), "utf8");
  const bootstrap = readFileSync(
    new URL("../public/supporter-password-recovery-bootstrap.js", import.meta.url),
    "utf8"
  );
  const resetSource = readFileSync(
    new URL("../src/supporterPasswordResetPage.ts", import.meta.url),
    "utf8"
  );
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const publicPageSource = readFileSync(
    new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
    "utf8"
  );
  const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

  assert.match(page, /supporter-password-recovery-bootstrap\.js/);
  assert.ok(page.indexOf("supporter-password-recovery-bootstrap.js") < page.indexOf("<body>"));
  assert.match(bootstrap, /history\.replaceState\(null, "", window\.location\.pathname\)/);
  assert.match(resetSource, /event === "PASSWORD_RECOVERY"/);
  assert.match(resetSource, /data\.redirectType !== "recovery"/);
  assert.match(resetSource, /signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(resetSource, /signOutSupabase|updatePasswordFromRecovery|SaasAdmin/);
  assert.doesNotMatch(appSource, /supporter-reset-password|SupporterPasswordReset/);
  assert.doesNotMatch(publicPageSource, /supporter-reset-password|SupporterPasswordReset/);
  assert.match(viteConfig, /supporter-reset-password\.html/);
});
