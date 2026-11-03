import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  confirmSupporterEmail,
  readSupporterEmailConfirmationRequest
} from "../src/supporterEmailConfirmation.ts";

function fakeClient(overrides = {}) {
  const calls = { exchange: [], getSession: 0, getUser: 0, signOut: [] };
  const client = {
    auth: {
      async exchangeCodeForSession(code) {
        calls.exchange.push(code);
        return overrides.exchange ?? {
          data: { user: null, session: { access_token: "verified-session" } },
          error: null
        };
      },
      async getSession() {
        calls.getSession += 1;
        return overrides.session ?? { data: { session: null }, error: null };
      },
      async getUser() {
        calls.getUser += 1;
        return overrides.user ?? {
          data: {
            user: {
              id: "supporter-user",
              email: "supporter@example.com",
              email_confirmed_at: "2026-10-26T09:00:00.000Z"
            }
          },
          error: null
        };
      },
      async signOut(options) {
        calls.signOut.push(options);
        return { error: null };
      }
    }
  };
  return { client, calls };
}

test("valid PKCE confirmation requires code exchange and a remotely verified confirmed user", async () => {
  const code = "valid-pkce-authorization-code-1234";
  const request = readSupporterEmailConfirmationRequest(`?code=${code}`, "");
  const { client, calls } = fakeClient();

  assert.deepEqual(request, { code, invalid: false, returnPath: "/login" });
  assert.equal(await confirmSupporterEmail(request, client), "confirmed");
  assert.deepEqual(calls.exchange, [code]);
  assert.equal(calls.getUser, 1);
  assert.deepEqual(calls.signOut, []);
});

test("expired or reused confirmation codes fail closed and clear the supporter session", async () => {
  const { client, calls } = fakeClient({
    exchange: { data: { user: null, session: null }, error: { message: "expired" } }
  });
  const request = readSupporterEmailConfirmationRequest(
    "?code=expired-authorization-code-1234",
    ""
  );

  assert.equal(await confirmSupporterEmail(request, client), "invalid");
  assert.equal(calls.getUser, 0);
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("Supabase errors and malformed or credential-bearing links are rejected without exchange", async () => {
  const requests = [
    readSupporterEmailConfirmationRequest("?error=access_denied&error_code=otp_expired", ""),
    readSupporterEmailConfirmationRequest("?code=short", ""),
    readSupporterEmailConfirmationRequest("?code=first-valid-code-1234&code=second-valid-code-5678", ""),
    readSupporterEmailConfirmationRequest("", "#access_token=unexpected&refresh_token=unexpected")
  ];

  for (const request of requests) {
    const { client, calls } = fakeClient();
    assert.equal(request.invalid, true);
    assert.equal(await confirmSupporterEmail(request, client), "invalid");
    assert.deepEqual(calls.exchange, []);
    assert.equal(calls.getSession, 0);
    assert.equal(calls.getUser, 0);
  }
});

test("a missing link succeeds only for an existing remotely verified supporter session", async () => {
  const missing = readSupporterEmailConfirmationRequest("", "");
  const noSession = fakeClient();
  assert.equal(await confirmSupporterEmail(missing, noSession.client), "invalid");
  assert.equal(noSession.calls.getUser, 0);

  const verified = fakeClient({
    session: { data: { session: { access_token: "existing-supporter-session" } }, error: null }
  });
  assert.equal(await confirmSupporterEmail(missing, verified.client), "confirmed");
  assert.equal(verified.calls.getUser, 1);
});

test("an unconfirmed or unverifiable user never receives the success result", async () => {
  const { client, calls } = fakeClient({
    user: {
      data: { user: { id: "supporter-user", email_confirmed_at: null } },
      error: null
    }
  });
  const request = readSupporterEmailConfirmationRequest(
    "?code=valid-pkce-authorization-code-1234",
    ""
  );

  assert.equal(await confirmSupporterEmail(request, client), "invalid");
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("landing page uses CSP-compatible same-origin scripts and scrubs before body parsing", () => {
  const page = readFileSync(new URL("../supporter-email-confirmed.html", import.meta.url), "utf8");
  const bootstrap = readFileSync(
    new URL("../public/supporter-email-confirmation-bootstrap.js", import.meta.url),
    "utf8"
  );
  const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

  assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.match(page, /<script src="\/supporter-email-confirmation-bootstrap\.js"><\/script>/);
  assert.match(page, /<script type="module" src="\/src\/supporterEmailConfirmation\.ts"><\/script>/);
  assert.ok(page.indexOf("supporter-email-confirmation-bootstrap.js") < page.indexOf("<body>"));
  assert.match(page, /html\.confirmation-pending body \{ visibility: hidden; \}/);
  assert.match(bootstrap, /window\.history\.replaceState\(null, "", window\.location\.pathname\)/);
  assert.match(bootstrap, /search: window\.location\.search[\s\S]*hash: window\.location\.hash/);
  assert.match(viteConfig, /input: \["index\.html", "supporter-email-confirmed\.html", "supporter-reset-password\.html"\]/);
});
