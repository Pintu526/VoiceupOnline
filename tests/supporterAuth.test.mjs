import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SUPPORTER_AUTH_STORAGE_KEY,
  SupporterAuthError,
  getCurrentSupporterIdentity,
  loginSupporterWithEmail,
  logoutSupporter,
  registerSupporterWithEmail
} from "../src/supporterAuth.ts";

function fakeClient(overrides = {}) {
  const calls = { signUp: [], signIn: [], signOut: [] };
  const client = {
    auth: {
      async signUp(input) {
        calls.signUp.push(input);
        return overrides.signUp ?? { data: { user: { id: "new-user" }, session: null }, error: null };
      },
      async signInWithPassword(input) {
        calls.signIn.push(input);
        return overrides.signIn ?? {
          data: {
            user: {
              id: "supporter-user",
              email: "supporter@example.com",
              email_confirmed_at: "2026-10-26T09:00:00.000Z"
            },
            session: { access_token: "supporter-only-token" }
          },
          error: null
        };
      },
      async getUser() {
        return overrides.getUser ?? {
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

test("supporter registration requests email confirmation without creating an active session", async () => {
  const { client, calls } = fakeClient();
  const result = await registerSupporterWithEmail(
    "  Supporter@Example.COM ",
    "correct horse battery staple",
    "https://gaumata.cloud/c/gau-samman-ahvaan-abhiyan",
    client
  );

  assert.deepEqual(result, { status: "confirmation_required", email: "supporter@example.com" });
  assert.deepEqual(calls.signUp, [{
    email: "supporter@example.com",
    password: "correct horse battery staple",
    options: { emailRedirectTo: "https://gaumata.cloud/supporter-email-confirmed.html" }
  }]);
  assert.deepEqual(calls.signOut, []);
});

test("registration fails closed when Supabase email confirmation is disabled", async () => {
  const { client, calls } = fakeClient({
    signUp: {
      data: {
        user: { id: "new-user", email_confirmed_at: "2026-10-26T09:00:00.000Z" },
        session: { access_token: "unexpected-token" }
      },
      error: null
    }
  });

  await assert.rejects(
    registerSupporterWithEmail("supporter@example.com", "password", "https://voiceup.live", client),
    (error) => error instanceof SupporterAuthError
      && error.code === "supporter_email_confirmation_not_enforced"
  );
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("supporter login accepts only a confirmed email identity", async () => {
  const { client, calls } = fakeClient();
  const identity = await loginSupporterWithEmail(" SUPPORTER@example.com ", "password", client);

  assert.deepEqual(identity, { id: "supporter-user", email: "supporter@example.com" });
  assert.deepEqual(calls.signIn, [{ email: "supporter@example.com", password: "password" }]);
  assert.deepEqual(calls.signOut, []);
});

test("supporter login clears any local session returned for an unconfirmed identity", async () => {
  const { client, calls } = fakeClient({
    signIn: {
      data: {
        user: { id: "unconfirmed-user", email: "supporter@example.com", email_confirmed_at: null },
        session: { access_token: "unconfirmed-token" }
      },
      error: null
    }
  });

  await assert.rejects(
    loginSupporterWithEmail("supporter@example.com", "password", client),
    (error) => error instanceof SupporterAuthError && error.code === "supporter_email_not_confirmed"
  );
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("supporter logout is local to the supporter session namespace", async () => {
  const { client, calls } = fakeClient();
  await logoutSupporter(client);
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("current supporter identity is accepted only from a confirmed isolated session", async () => {
  const { client } = fakeClient();
  assert.deepEqual(await getCurrentSupporterIdentity(client), {
    id: "supporter-user",
    email: "supporter@example.com"
  });

  const unconfirmed = fakeClient({
    getUser: {
      data: {
        user: {
          id: "supporter-user",
          email: "supporter@example.com",
          email_confirmed_at: null
        }
      },
      error: null
    }
  });
  assert.equal(await getCurrentSupporterIdentity(unconfirmed.client), null);
  assert.deepEqual(unconfirmed.calls.signOut, [{ scope: "local" }]);
});

test("supporter and Business OS entry points share one Supabase Auth session without mixing authorization logic", () => {
  const source = readFileSync(new URL("../src/supporterAuth.ts", import.meta.url), "utf8");
  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");

  assert.equal(SUPPORTER_AUTH_STORAGE_KEY, "voiceup-auth-session-v2");
  assert.match(source, /storageKey:\s*SUPPORTER_AUTH_STORAGE_KEY/);
  assert.match(backendSource, /storageKey:\s*VOICEUP_AUTH_STORAGE_KEY/);
  assert.match(source, /detectSessionInUrl:\s*false/);
  assert.match(source, /flowType:\s*"pkce"/);
  assert.doesNotMatch(source, /signInWithSupabase|voiceup_claim_supporter_account|submitPublicSignature/);
});
