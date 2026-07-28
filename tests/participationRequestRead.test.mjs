import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toPublicParticipationRequest } from "../src/movementRequests.ts";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = readSource(
  "../supabase/migrations/20260728020000_participation_request_public_read.sql"
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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("authorized read reuses the verified public-signing identity and existing Edge boundary", () => {
  assert.match(edgeLogicSource, /"read_participation_requests"/);
  assert.match(edgeSource, /if \(action === "read_participation_requests"\)/);
  assert.match(edgeSource, /admin\.rpc\("voiceup_read_own_participation_requests"/);
  assert.match(migration, /challenge\.purpose = 'public-signing'/);
  assert.match(migration, /challenge\.verified_at is not null/);
  assert.match(migration, /challenge\.expires_at > v_now/);
  assert.match(migration, /digest\(p_verification_token, 'sha256'\)/);
  assert.match(migration, /challenge\.metadata ->> 'slug' = p_campaign_slug/);
  assert.match(migration, /campaignId', p_campaign_id\) = p_campaign_id/);
});

test("unauthorized or wrong-supporter reads fail closed without a browser supporter id", () => {
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(migration, /voiceup:otp_verification_required/);
  assert.match(migration, /voiceup:supporter_not_found/);
  assert.match(
    migration,
    /request_row\.requester_supporter_id = v_signer ->> 'id'/
  );
  assert.doesNotMatch(
    migration.match(/create or replace function[\s\S]*?\)\nreturns jsonb/)?.[0] ?? "",
    /supporter_id|request_id/
  );
  assert.match(
    edgeSource,
    /\["requestId", "supporterId", "requesterSupporterId"\]\.some/
  );
  assert.match(edgeSource, /action === "read_participation_requests"[\s\S]*body\.payload !== undefined/);
});

test("workspace and campaign boundaries are authoritative and published-only", () => {
  assert.match(migration, /workspace\.id = p_workspace_id/);
  assert.match(migration, /campaign_item ->> 'id' = p_campaign_id/);
  assert.match(migration, /campaign_item ->> 'slug' = p_campaign_slug/);
  assert.match(migration, /campaign_index\.workspace_id = p_workspace_id/);
  assert.match(migration, /campaign_index\.campaign_id = p_campaign_id/);
  assert.match(migration, /campaign_index\.status = 'Published'/);
  assert.match(migration, /request_row\.workspace_id = p_workspace_id/);
  assert.match(migration, /request_row\.resource_id = p_campaign_id/);
});

test("public response returns multiple own requests or an authoritative empty array", () => {
  assert.match(migration, /jsonb_agg\([\s\S]*order by request_row\.submitted_at desc/);
  assert.match(migration, /'requests', v_requests/);
  assert.match(migration, /'\[\]'::jsonb/);
  assert.match(backendSource, /export async function readOwnParticipationRequests/);
  assert.match(backendSource, /if \(!Array\.isArray\(data\.requests\)\)/);
  assert.match(typesSource, /export interface PublicParticipationRequest \{/);
});

test("public projection excludes privileged request, reviewer, routing, consent, and audit data", () => {
  const projection = sliceBetween(
    migration,
    "select coalesce(\n    jsonb_agg(",
    "\n    into v_requests"
  );
  for (const field of [
    "'id'",
    "'requestType'",
    "'requestedRole'",
    "'campaign'",
    "'status'",
    "'preferredLevel'",
    "'minimumAcceptableLevel'",
    "'geographicScope'",
    "'currentStage'",
    "'submittedAt'",
    "'updatedAt'"
  ]) {
    assert.match(projection, new RegExp(field));
  }
  assert.doesNotMatch(
    projection,
    /candidateApproverId|candidateApproverType|routingPath|routingMetadata|consentEvidence|auditMetadata|requesterSupporterId|reviewNotes|approvalComments/
  );
  assert.doesNotMatch(
    projection,
    /countryId|stateId|districtId|blockId|panchayatId|wardId/
  );
});

test("read function remains service-role-only and grants no browser table access", () => {
  assert.match(migration, /security definer/);
  assert.match(
    migration,
    /revoke all on function public\.voiceup_read_own_participation_requests\([\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.voiceup_read_own_participation_requests\([\s\S]*to service_role/
  );
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete) on table/i);
});

test("submission is reduced to the same public-safe model before entering dashboard state", () => {
  const request = toPublicParticipationRequest(
    {
      id: "request-1",
      workspaceId: "workspace-secret",
      applicationKey: "voiceup",
      resourceType: "campaign",
      resourceId: "campaign-1",
      requesterSupporterId: "supporter-secret",
      requestType: "coordinator",
      requestedRole: "coordinator",
      preferredLevel: "district",
      minimumAcceptableLevel: "block",
      geographicScope: { country: "India", state: "Odisha", district: "Puri" },
      skills: [],
      areasOfInterest: [],
      status: "pending",
      routingMetadata: {
        candidateApproverType: "coordinator",
        candidateApproverId: "reviewer-secret",
        approvalScope: {},
        nextLevel: "state",
        routingPath: ["state", "national", "campaign_owner"],
        resolvedAt: "2026-07-28T10:00:00.000Z",
        resolution: "candidate_resolved"
      },
      escalationState: "none",
      consentEvidence: {
        granted: true,
        recordedAt: "2026-07-28T10:00:00.000Z",
        version: "v1",
        textSnapshot: "secret consent",
        captureSource: "public",
        campaignId: "campaign-1",
        supporterId: "supporter-secret"
      },
      submittedAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:01:00.000Z",
      auditMetadata: {
        source: "public",
        submittedBy: "verified_supporter"
      }
    },
    { id: "campaign-1", slug: "campaign", title: "Campaign" }
  );
  assert.equal(request.currentStage, "pending_review");
  assert.equal(request.campaign.title, "Campaign");
  assert.equal("requesterSupporterId" in request, false);
  assert.equal("routingMetadata" in request, false);
  assert.equal("consentEvidence" in request, false);
  assert.equal("auditMetadata" in request, false);
});

test("refresh hydration is deduplicated in memory and cleared with the verified session", () => {
  assert.match(appSource, /async function hydratePublicMovementRequests/);
  assert.match(
    appSource,
    /publicMovementRequestLoadRef\.current\?\.key === key[\s\S]*return publicMovementRequestLoadRef\.current\.promise/
  );
  assert.match(
    appSource,
    /if \(restoredSigner\.status === "verified"\)[\s\S]*await hydratePublicMovementRequests\(phone, result\.verificationToken\)/
  );
  assert.match(appSource, /publicMovementRequestLoadGenerationRef\.current \+= 1/);
  assert.match(appSource, /setPublicMovementRequests\(\[\]\)/);
  assert.doesNotMatch(appSource, /localStorage.*publicMovementRequests|sessionStorage.*publicMovementRequests/);
  assert.match(publicPageSource, /onRefreshMovementRequests/);
});

test("loading, empty, error, refresh, and current-stage states are accessible and localized", () => {
  assert.match(publicPageSource, /public-request-loading" role="status" aria-live="polite"/);
  assert.match(publicPageSource, /movementRequestsError[\s\S]*role="alert"/);
  assert.match(publicPageSource, /disabled=\{movementRequestsLoading\}/);
  assert.match(publicPageSource, /public\.success\.noRequests/);
  assert.match(publicPageSource, /public\.success\.stage\.\$\{request\.currentStage\}/);
  const flatten = (value, prefix = "") =>
    Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return child && typeof child === "object" && !Array.isArray(child)
        ? flatten(child, path)
        : [path];
    });
  const englishKeys = flatten(locales.en.public.success).sort();
  assert.deepEqual(flatten(locales.hi.public.success).sort(), englishKeys);
  assert.deepEqual(flatten(locales.or.public.success).sort(), englishKeys);
});

test("existing request submission, participation, referrals, and QR paths remain unchanged", () => {
  assert.match(edgeSource, /admin\.rpc\("voiceup_submit_participation_request"/);
  assert.match(edgeSource, /admin\.rpc\("mutate_voiceup_public_participation"/);
  assert.match(publicPageSource, /getCampaignReferralUrl/);
  assert.match(publicPageSource, /<ReferralQrPreview/);
  assert.match(publicPageSource, /downloadQrPosterSvg/);
  assert.doesNotMatch(migration, /alter table|create table|drop table|delete from|truncate/i);
});
