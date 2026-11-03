import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SupporterAccountClaimError,
  claimSupporterAccount,
  findLinkedSupporterAccount,
  isSupporterClaimGrant,
  isUsableSupporterClaimGrant,
  readOwnSupporterAccountLinks
} from "../src/supporterAccountClaim.ts";

const validGrant = {
  token: `vusc_${"a".repeat(64)}`,
  expiresAt: "2099-10-30T00:00:00.000Z"
};

test("claim grants are validated in memory and expire closed", () => {
  assert.equal(isSupporterClaimGrant(validGrant), true);
  assert.equal(isUsableSupporterClaimGrant(validGrant, Date.parse("2026-10-29T00:00:00Z")), true);
  assert.equal(isUsableSupporterClaimGrant(validGrant, Date.parse(validGrant.expiresAt)), false);
  assert.equal(isSupporterClaimGrant({ ...validGrant, expiresAt: "not-a-date" }), false);
  assert.equal(isUsableSupporterClaimGrant({ ...validGrant, token: "not-a-token" }), false);
});

test("claiming sends only the opaque token to the authenticated RPC", async () => {
  const calls = [];
  const client = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return {
        data: {
          claimed: true,
          accountId: "account-1",
          workspaceId: "workspace-1",
          campaignId: "campaign-1",
          supporterId: "supporter-1",
          claimedAt: "2026-10-29T10:00:00.000Z"
        },
        error: null
      };
    }
  };

  const link = await claimSupporterAccount(validGrant, client);
  assert.deepEqual(calls, [{
    name: "voiceup_claim_supporter_account",
    parameters: { p_claim_token: validGrant.token }
  }]);
  assert.equal(link.supporterId, "supporter-1");
  assert.equal(link.campaignId, "campaign-1");
});

test("expired, consumed, invalid, and mismatched claims share a safe bounded error", async () => {
  const client = {
    async rpc() {
      return { data: null, error: { message: "voiceup:claim_grant_invalid private-detail" } };
    }
  };
  await assert.rejects(
    claimSupporterAccount(validGrant, client),
    (error) => error instanceof SupporterAccountClaimError
      && error.code === "supporter_claim_invalid"
      && !error.message.includes("private-detail")
  );
});

test("linked profiles are read only through the authenticated owner mapping", async () => {
  const calls = [];
  const client = {
    from(table) {
      calls.push(table);
      return {
        async select(columns) {
          calls.push(columns);
          return {
            data: [{
              id: "account-1",
              workspace_id: "workspace-1",
              campaign_id: "campaign-1",
              supporter_id: "supporter-1",
              claimed_at: "2026-10-29T10:00:00.000Z"
            }],
            error: null
          };
        }
      };
    }
  };

  const links = await readOwnSupporterAccountLinks(client);
  assert.deepEqual(calls, [
    "voiceup_supporter_accounts",
    "id,workspace_id,campaign_id,supporter_id,claimed_at"
  ]);
  assert.equal(findLinkedSupporterAccount(links, "campaign-1", "supporter-1")?.accountId, "account-1");
  assert.equal(findLinkedSupporterAccount(links, "campaign-2", "supporter-1"), null);
});

test("the signing grant stays out of URLs, logs, analytics, and browser storage", () => {
  const claimSource = readFileSync(new URL("../src/supporterAccountClaim.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(
    new URL("../src/components/SupporterAccountClaimPanel.tsx", import.meta.url),
    "utf8"
  );
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
  const pageSource = readFileSync(
    new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
    "utf8"
  );

  const sensitiveClientFlow = `${claimSource}\n${panelSource}`;
  assert.doesNotMatch(sensitiveClientFlow, /localStorage|sessionStorage|URLSearchParams|console\.|analytics|track/i);
  assert.match(panelSource, /location\.assign\(`\/account\/supporter\/\$\{encodeURIComponent\(link\.accountId\)\}`\)/);
  assert.doesNotMatch(panelSource, /location\.assign\([^)]*(?:grant|token)/i);
  assert.match(backendSource, /supporterAccountClaimGrant:\s*result\.supporterAccountClaimGrant/);
  assert.match(appSource, /setSupporterAccountClaimGrant/);
  assert.match(appSource, /setSupporterAccountClaimGrant\(null\)/);
  assert.match(pageSource, /SupporterAccountClaimPanel/);
  assert.match(pageSource, /const signingSteps:[\s\S]*"phone"[\s\S]*"otp"[\s\S]*"profile"[\s\S]*"address"[\s\S]*"review"[\s\S]*"done"/);
  assert.doesNotMatch(pageSource, /supporterAccountClaimGrant.*(?:href|src)=/);
});

test("account claiming remains separate from SQL, admin auth, and coordinator permissions", () => {
  const claimSource = readFileSync(new URL("../src/supporterAccountClaim.ts", import.meta.url), "utf8");
  const panelSource = readFileSync(
    new URL("../src/components/SupporterAccountClaimPanel.tsx", import.meta.url),
    "utf8"
  );
  const source = `${claimSource}\n${panelSource}`;
  assert.doesNotMatch(source, /voiceup_workspace_members|voiceup_coordinators|auth_user_id|insert\s+into|update\s+public\./i);
  assert.doesNotMatch(source, /signInWithSupabase|getCurrentAuthSession|campaign admin|saas admin/i);
});
