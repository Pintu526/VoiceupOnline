import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createParticipationRequestIdempotencyKey,
  getMinimumParticipationLevels,
  parseParticipationRequestList,
  participationRequestFingerprint
} from "../src/movementRequests.ts";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = readSource(
  "../supabase/migrations/20260728010000_participation_requests.sql"
);
const edgeSource = readSource("../supabase/functions/voiceup-public-signing/index.ts");
const edgeLogicSource = readSource("../supabase/functions/voiceup-public-signing/logic.ts");
const backendSource = readSource("../src/backend.ts");
const appSource = readSource("../src/App.tsx");
const publicPageSource = readSource("../src/pages/PublicCampaignPage.tsx");
const typesSource = readSource("../src/types.ts");
const locales = Object.fromEntries(
  ["en", "hi", "or"].map((language) => [
    language,
    JSON.parse(readSource(`../src/i18n/locales/${language}.json`))
  ])
);

test("authoritative reusable request and audit tables are additive and tenant scoped", () => {
  assert.match(migration, /create table if not exists public\.voiceup_participation_requests/);
  assert.match(migration, /workspace_id text not null references public\.voiceup_workspaces\(id\)/);
  assert.match(migration, /application_key text not null/);
  assert.match(migration, /resource_type text not null/);
  assert.match(migration, /resource_id text not null/);
  assert.match(migration, /requester_supporter_id text not null/);
  assert.match(migration, /create table if not exists public\.voiceup_participation_request_audit/);
  assert.match(migration, /insert into public\.voiceup_participation_request_audit/);
  assert.doesNotMatch(migration, /alter table public\.(?:voiceup_workspaces|voiceup_coordinators|voiceup_otp_challenges)/i);
  assert.doesNotMatch(migration, /^\s*(?:delete from|truncate|drop table)\b/im);
});

test("volunteer and coordinator requests persist every approved structured field", () => {
  for (const column of [
    "request_type",
    "requested_role",
    "preferred_level",
    "minimum_acceptable_level",
    "geographic_scope",
    "skills",
    "areas_of_interest",
    "motivation",
    "experience",
    "availability",
    "preferred_working_area",
    "status",
    "routing_metadata",
    "escalation_state",
    "consent_evidence",
    "submitted_at",
    "updated_at",
    "audit_metadata"
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migration, /request_type in \('volunteer', 'coordinator'\)/);
  assert.match(migration, /v_requested_role :=[\s\S]*v_requested_role <> v_request_type/);
  assert.match(migration, /v_preferred_level,[\s\S]*v_minimum_level,[\s\S]*v_geography/);
  assert.match(typesSource, /export interface ParticipationRequest \{/);
  assert.match(typesSource, /export interface ParticipationRequestSubmission \{/);
});

test("coordinator level and structured geographic ancestry are validated server-side", () => {
  assert.match(
    migration,
    /v_preferred_level[\s\S]*not in \('national', 'state', 'district', 'block', 'panchayat', 'ward'\)/
  );
  assert.match(migration, /v_preferred_rank <= 5[\s\S]*v_geography ->> 'state'/);
  assert.match(migration, /v_preferred_rank <= 4[\s\S]*v_geography ->> 'district'/);
  assert.match(migration, /v_preferred_rank <= 3[\s\S]*v_geography ->> 'block'/);
  assert.match(migration, /v_preferred_rank <= 2[\s\S]*v_geography ->> 'panchayat'/);
  assert.match(migration, /v_preferred_rank <= 1[\s\S]*v_geography ->> 'ward'/);
  assert.match(migration, /v_minimum_rank > v_preferred_rank/);
  assert.match(publicPageSource, /<IndiaLocationFields[\s\S]*idPrefix="public-coordinator-request"/);
  assert.match(publicPageSource, /minimumAcceptableLevel: coordinatorMinimumLevel \|\| undefined/);
});

test("public submission requires campaign, OTP proof, completed support, and explicit consent", () => {
  assert.match(migration, /campaign_index\.status = 'Published'/);
  assert.match(migration, /challenge\.purpose = 'public-signing'/);
  assert.match(migration, /challenge\.verified_at is not null/);
  assert.match(migration, /digest\(p_verification_token, 'sha256'\)/);
  assert.match(migration, /supportSubmittedAt/);
  assert.match(migration, /voiceup:support_completion_required/);
  assert.match(migration, /voiceup:request_consent_required/);
  assert.match(publicPageSource, /checked=\{volunteerConsent\}/);
  assert.match(publicPageSource, /checked=\{coordinatorConsent\}/);
});

test("the browser cannot set status, routing, approver, timestamps, or role activation", () => {
  assert.match(edgeSource, /const protectedRequestFields = new Set\(\[/);
  for (const field of [
    "status",
    "routingMetadata",
    "escalationState",
    "submittedAt",
    "updatedAt",
    "auditMetadata"
  ]) {
    assert.match(edgeSource, new RegExp(`"${field}"`));
  }
  assert.match(migration, /v_status := case when v_candidate_id is null then 'escalated' else 'pending' end/);
  assert.match(migration, /submitted_at[\s\S]*v_now,[\s\S]*v_now/);
  assert.doesNotMatch(migration, /insert into public\.voiceup_coordinators/i);
  assert.doesNotMatch(migration, /insert into public\.workspace_resource_members/i);
  assert.doesNotMatch(edgeSource, /grantPermission|activateRole|assignCoordinator/);
});

test("routing uses only authoritative assignments and escalates without fabricating an approver", () => {
  assert.match(migration, /from public\.voiceup_coordinators coordinator/);
  assert.match(migration, /join public\.voiceup_coordinator_campaigns campaign_link/);
  assert.match(migration, /from public\.workspace_resource_members assignment/);
  assert.match(migration, /assignment\.role = 'campaign_admin'/);
  assert.match(migration, /'resolution', case when v_candidate_id is null then 'no_authoritative_approver'/);
  assert.match(migration, /v_escalation_state := case when v_candidate_id is null then 'required'/);
});

test("idempotency and active-request uniqueness allow a new request only after rejection or withdrawal", () => {
  assert.match(
    migration,
    /create unique index if not exists voiceup_participation_requests_idempotency_idx[\s\S]*\(workspace_id, idempotency_key\)/
  );
  assert.match(
    migration,
    /voiceup_participation_requests_active_unique_idx[\s\S]*where status in \('pending', 'escalated', 'approved', 'assigned'\)/
  );
  assert.doesNotMatch(
    migration.match(/voiceup_participation_requests_active_unique_idx[\s\S]*?;/)?.[0] ?? "",
    /rejected|withdrawn/
  );
  const request = {
    requestType: "volunteer",
    requestedRole: "volunteer",
    geographicScope: {},
    consent: { granted: true, version: "v1" }
  };
  assert.equal(participationRequestFingerprint(request), participationRequestFingerprint(request));
  assert.match(createParticipationRequestIdempotencyKey(), /^participation-request:[A-Za-z0-9-]+$/);
  assert.match(publicPageSource, /movementRequestAttemptRef\.current\?\.fingerprint !== fingerprint/);
  assert.match(publicPageSource, /movementRequestAttemptRef\.current\.idempotencyKey/);
});

test("backend failure retains form state and never displays false success", () => {
  const persistStart = publicPageSource.indexOf("async function persistMovementRequest(");
  const persistEnd = publicPageSource.indexOf(
    "\n  async function submitVolunteerMovementRequest",
    persistStart
  );
  const persistSource = publicPageSource.slice(persistStart, persistEnd);
  assert.match(persistSource, /catch \(error\) \{/);
  assert.match(persistSource, /participationRequestErrorCode\(error\)/);
  assert.match(persistSource, /t\("public\.requests\.retry"\)/);
  assert.doesNotMatch(
    persistSource.slice(persistSource.indexOf("catch (error) {")),
    /setVolunteer|setCoordinatorLocation|setSavedMovementRequest\(saved\)/
  );
  assert.match(publicPageSource, /savedMovementRequest && \(/);
  assert.match(publicPageSource, /movementRequestError && \(/);
});

test("existing Edge boundary and typed backend adapter return the authoritative saved request", () => {
  assert.match(edgeLogicSource, /"submit_participation_request"/);
  assert.match(edgeSource, /admin\.rpc\("voiceup_submit_participation_request"/);
  assert.match(edgeSource, /if \(action === "submit_participation_request"\)/);
  assert.match(backendSource, /export async function submitParticipationRequest/);
  assert.match(backendSource, /payload: \{ request: input\.request \}/);
  assert.match(backendSource, /if \(!data\.request \|\| !data\.message\)/);
  assert.match(appSource, /async function submitPublicMovementRequest/);
  assert.match(appSource, /onSubmitMovementRequest=\{isBackendConfigured \? submitPublicMovementRequest/);
});

test("legacy coordinator application, atomic support, referral, and QR paths remain present", () => {
  assert.match(typesSource, /export interface PublicCoordinatorApplication \{/);
  assert.match(edgeLogicSource, /"submit_coordinator_application"/);
  assert.match(appSource, /async function submitPublicCoordinatorApplication\(\)/);
  assert.match(publicPageSource, /getCampaignReferralUrl/);
  assert.match(publicPageSource, /<ReferralQrPreview/);
  assert.match(publicPageSource, /downloadQrPosterSvg/);
  assert.match(edgeSource, /mutate_voiceup_public_participation/);
});

test("request copy has exact English, Hindi, and Odia parity", () => {
  const flatten = (value, prefix = "") =>
    Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" && !Array.isArray(child)
        ? flatten(child, path)
        : [path];
    });
  const englishKeys = flatten(locales.en.public.requests).sort();
  assert.deepEqual(flatten(locales.hi.public.requests).sort(), englishKeys);
  assert.deepEqual(flatten(locales.or.public.requests).sort(), englishKeys);
});

test("request list normalization is bounded and minimum service levels only move downward", () => {
  assert.deepEqual(
    parseParticipationRequestList(" outreach, logistics, outreach ,  social   media "),
    ["outreach", "logistics", "social media"]
  );
  assert.deepEqual(getMinimumParticipationLevels("district"), [
    "district",
    "block",
    "panchayat",
    "ward"
  ]);
});
