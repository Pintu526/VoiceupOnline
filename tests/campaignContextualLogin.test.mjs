import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getCampaignLoginPath,
  readCampaignAuthContext,
  sanitizeVoiceupLoginReturnPath
} from "../src/campaignAuthContext.ts";
import {
  getCampaignAuthorizedDestinations,
  resolveCampaignAutomaticDestination
} from "../src/accountAccess.ts";
import {
  requestSupporterEmailOtp,
  verifySupporterEmailOtp
} from "../src/supporterAuth.ts";
import { readSupporterEmailConfirmationRequest } from "../src/supporterEmailConfirmation.ts";

const context = { campaignId: "campaign-1", campaignSlug: "save--river" };

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    user: { id: "user-1", email: "owner@example.com" },
    platformAdmin: false,
    supporterOwnerships: [],
    volunteerAssignments: [],
    coordinatorBindings: [],
    workspaceMemberships: [],
    hasAuthorizedAccess: true,
    ...overrides
  };
}

test("campaign context is exact, bounded, and cannot carry credentials or privilege hints", () => {
  const path = getCampaignLoginPath(context);
  assert.equal(path, "/login?campaign=save--river&campaignId=campaign-1");
  assert.deepEqual(readCampaignAuthContext("?campaign=save--river&campaignId=campaign-1"), context);
  assert.equal(readCampaignAuthContext("?campaign=save-river&campaignId=one&campaignId=two"), null);
  assert.equal(readCampaignAuthContext("?campaign=../admin&campaignId=campaign-1"), null);
  assert.equal(sanitizeVoiceupLoginReturnPath(path), path);
  assert.equal(sanitizeVoiceupLoginReturnPath("//evil.example/login"), "/login");
  assert.equal(sanitizeVoiceupLoginReturnPath("/login?campaign=save-river&campaignId=campaign-1&role=admin"), "/login");
  assert.equal(sanitizeVoiceupLoginReturnPath("/login?campaign=save-river&campaignId=campaign-1&access_token=secret"), "/login");
});

test("email OTP is existing-account-only, retains safe campaign context, and verifies confirmed identity", async () => {
  const calls = { request: [], verify: [], signOut: [] };
  const client = {
    auth: {
      async signInWithOtp(input) {
        calls.request.push(input);
        return { data: {}, error: null };
      },
      async verifyOtp(input) {
        calls.verify.push(input);
        return {
          data: {
            user: {
              id: "user-1",
              email: "owner@example.com",
              email_confirmed_at: "2026-10-30T00:00:00.000Z"
            },
            session: { user: { id: "user-1" } }
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
  const returnPath = getCampaignLoginPath(context);
  await requestSupporterEmailOtp(" Owner@Example.COM ", returnPath, "http://localhost:5173", client);
  assert.equal(calls.request[0].email, "owner@example.com");
  assert.equal(calls.request[0].options.shouldCreateUser, false);
  const redirect = new URL(calls.request[0].options.emailRedirectTo);
  assert.equal(redirect.pathname, "/supporter-email-confirmed.html");
  assert.equal(redirect.searchParams.get("return_to"), returnPath);
  assert.doesNotMatch(redirect.toString(), /token|password|claim/iu);

  assert.deepEqual(await verifySupporterEmailOtp("owner@example.com", "123456", client), {
    id: "user-1",
    email: "owner@example.com"
  });
  assert.deepEqual(calls.verify, [{ email: "owner@example.com", token: "123456", type: "email" }]);
  assert.deepEqual(calls.signOut, []);
});

test("confirmation accepts only a safe contextual return and rejects duplicate return parameters", () => {
  const valid = readSupporterEmailConfirmationRequest(
    `?code=valid-pkce-authorization-code-1234&return_to=${encodeURIComponent(getCampaignLoginPath(context))}`,
    ""
  );
  assert.equal(valid.invalid, false);
  assert.equal(valid.returnPath, getCampaignLoginPath(context));

  const duplicate = readSupporterEmailConfirmationRequest(
    "?code=valid-pkce-authorization-code-1234&return_to=%2Flogin&return_to=%2Flogin",
    ""
  );
  assert.equal(duplicate.invalid, true);
  assert.equal(duplicate.returnPath, "/login");

  const external = readSupporterEmailConfirmationRequest(
    "?code=valid-pkce-authorization-code-1234&return_to=https%3A%2F%2Fevil.example%2Flogin",
    ""
  );
  assert.equal(external.invalid, false);
  assert.equal(external.returnPath, "/login");
});

test("same-campaign supporter and approved volunteer access outrank other roles", () => {
  const value = manifest({
    supporterOwnerships: [{
      accountId: "account-1", workspaceId: "ws-1", workspaceName: "One",
      campaignId: "campaign-1", campaignSlug: "save--river", campaignTitle: "Save River",
      supporterId: "supporter-1", supporterName: "Owner", referralCode: "VU-1", claimedAt: "now"
    }],
    volunteerAssignments: [{
      requestId: "request-1", accountId: "account-1", workspaceId: "ws-1",
      campaignId: "campaign-1", supporterId: "supporter-1", role: "volunteer",
      status: "approved", geographicScope: {}, approvedAt: "now"
    }],
    workspaceMemberships: [{
      workspaceId: "ws-1", workspaceName: "One", role: "campaign_admin", permissions: [],
      campaignAssignments: [{ assignmentId: "assignment-1", applicationKey: "voiceup", role: "campaign_admin", resourceType: "campaign", resourceId: "campaign-1", resourceSlug: "save--river" }]
    }]
  });
  const destinations = getCampaignAuthorizedDestinations(value, context);
  assert.deepEqual(destinations.map((item) => item.campaignRoles), [
    ["supporter", "approved_volunteer"],
    ["admin"]
  ]);
  assert.equal(resolveCampaignAutomaticDestination(value, context)?.path, "/account/supporter/account-1");
});

test("coordinator routing requires both campaign binding and independent workspace authority", () => {
  const coordinator = {
    coordinatorId: "coordinator-1", workspaceId: "ws-1", fullName: "Coordinator",
    role: "district_coordinator", status: "active", geography: null,
    campaignIds: ["campaign-1"], workspaceRole: "viewer", canOpenBusinessOs: true
  };
  assert.deepEqual(getCampaignAuthorizedDestinations(manifest({ coordinatorBindings: [coordinator] }), context), []);

  const authorized = manifest({
    coordinatorBindings: [coordinator],
    workspaceMemberships: [{ workspaceId: "ws-1", workspaceName: "One", role: "viewer", permissions: [], campaignAssignments: [] }]
  });
  const [destination] = getCampaignAuthorizedDestinations(authorized, context);
  assert.equal(destination.kind, "coordinator");
  assert.equal(destination.path, "/app?campaign=save--river&campaignId=campaign-1");
});

test("campaign admin routing requires an exact server-returned campaign assignment", () => {
  const baseMembership = {
    workspaceId: "ws-1", workspaceName: "One", role: "campaign_admin", permissions: [],
    campaignAssignments: [{ assignmentId: "assignment-1", applicationKey: "voiceup", role: "campaign_admin", resourceType: "campaign", resourceId: "another-campaign", resourceSlug: "save--river" }]
  };
  assert.deepEqual(getCampaignAuthorizedDestinations(manifest({ workspaceMemberships: [baseMembership] }), context), []);
  const exact = manifest({
    workspaceMemberships: [{
      ...baseMembership,
      campaignAssignments: [{ ...baseMembership.campaignAssignments[0], resourceId: "campaign-1" }]
    }]
  });
  assert.equal(resolveCampaignAutomaticDestination(exact, context)?.path, "/admin/save--river");
});

test("missing campaign access stays optional and the public page exposes contextual account access without phone auth", () => {
  assert.equal(resolveCampaignAutomaticDestination(manifest({ hasAuthorizedAccess: false }), context), null);
  const publicSource = readFileSync(new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url), "utf8");
  const inlineSource = readFileSync(new URL("../src/components/CampaignInlineAuthPanel.tsx", import.meta.url), "utf8");
  const loginSource = readFileSync(new URL("../src/pages/VoiceupLoginPage.tsx", import.meta.url), "utf8");
  assert.match(publicSource, /CampaignInlineAuthPanel/);
  assert.match(publicSource, /campaign-participation-tabs/);
  assert.match(publicSource, /public-campaign-sign-in/);
  assert.match(publicSource, /href=\{campaignAccountAccessPath\}/);
  assert.match(publicSource, /campaignSignUpLoginAria/);
  assert.match(inlineSource, /getCampaignLoginPath/);
  assert.match(inlineSource, /loadVoiceupAccessManifest/);
  assert.match(inlineSource, /requestSupporterEmailOtp/);
  assert.match(loginSource, /loadVoiceupAccessManifest/);
  assert.match(loginSource, /requestSupporterEmailOtp/);
  assert.match(loginSource, /registerSupporterWithEmailForContext/);
  assert.match(loginSource, /type LoginMode = "sign_in" \| "register"/);
  assert.match(loginSource, /noCampaignAccess/);
  assert.doesNotMatch(loginSource, /submitPublicSignature|voiceup-public-signing/);
  assert.doesNotMatch(`${inlineSource}\n${loginSource}`, /signInWithPhone|type="tel"|phoneOtp/iu);
});
