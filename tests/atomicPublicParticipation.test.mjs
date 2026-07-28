import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PUBLIC_PARTICIPATION_ACTIONS,
  hasBase64Image,
  validateProfileFields
} from "../supabase/functions/voiceup-public-signing/logic.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260724010000_atomic_public_participation.sql", import.meta.url),
  "utf8"
);
const edge = readFileSync(
  new URL("../supabase/functions/voiceup-public-signing/index.ts", import.meta.url),
  "utf8"
);
const sharedEdge = readFileSync(
  new URL("../supabase/functions/_shared/voiceup.ts", import.meta.url),
  "utf8"
);
const backend = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const publicPage = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);
const coordinatorMigration = readFileSync(
  new URL("../supabase/migrations/20260720020000_coordinator_network_v1.sql", import.meta.url),
  "utf8"
);

function rpcSource() {
  return migration.slice(
    migration.indexOf("create or replace function public.mutate_voiceup_public_participation"),
    migration.indexOf("revoke all on function public.mutate_voiceup_public_participation")
  );
}

function jsonbBuildObjectCalls(source) {
  const calls = [];
  const callPattern = /\bjsonb_build_object\s*\(/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const openParenthesis = source.indexOf("(", match.index);
    let depth = 1;
    let argumentCount = 0;
    let hasArgumentToken = false;
    let closed = false;

    for (let index = openParenthesis + 1; index < source.length; index += 1) {
      const character = source[index];
      const nextCharacter = source[index + 1];

      if (character === "-" && nextCharacter === "-") {
        index = source.indexOf("\n", index + 2);
        if (index === -1) break;
        continue;
      }
      if (character === "/" && nextCharacter === "*") {
        const commentEnd = source.indexOf("*/", index + 2);
        assert.notEqual(commentEnd, -1, "Unterminated SQL block comment");
        index = commentEnd + 1;
        continue;
      }
      if (character === "'" || character === '"') {
        if (depth === 1) hasArgumentToken = true;
        const quote = character;
        for (index += 1; index < source.length; index += 1) {
          if (source[index] !== quote) continue;
          if (source[index + 1] === quote) {
            index += 1;
            continue;
          }
          break;
        }
        continue;
      }
      if (character === "(") {
        if (depth === 1) hasArgumentToken = true;
        depth += 1;
        continue;
      }
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          if (hasArgumentToken) argumentCount += 1;
          calls.push({
            argumentCount,
            line: source.slice(0, match.index).split("\n").length
          });
          closed = true;
          break;
        }
        continue;
      }
      if (depth === 1 && character === ",") {
        argumentCount += 1;
        hasArgumentToken = false;
        continue;
      }
      if (depth === 1 && !/\s/.test(character)) {
        hasArgumentToken = true;
      }
    }

    assert.equal(closed, true, `Unterminated jsonb_build_object call at offset ${match.index}`);
  }

  return calls;
}

test("RPC is additive, forward-only, service-role-only, and exposes only approved actions", () => {
  assert.deepEqual(PUBLIC_PARTICIPATION_ACTIONS, [
    "save_draft",
    "submit_support",
    "resume_verified_supporter",
    "update_profile",
    "record_consents",
    "submit_participation_request",
    "read_participation_requests",
    "submit_coordinator_application",
    "sync_coordinator_application_state"
  ]);
  assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/);
  assert.match(migration, /grant execute on function public\.mutate_voiceup_public_participation[\s\S]*to service_role/);
  assert.match(migration, /revoke all on function public\.mutate_voiceup_public_participation[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create table|alter table|drop table|drop column/i);
});

test("RPC fails closed on a null or unsupported action before payload handling and locking", () => {
  const rpc = rpcSource();
  const actionGuard = rpc.indexOf("if p_action is null or p_action not in (");
  assert.notEqual(actionGuard, -1);
  assert.ok(actionGuard < rpc.indexOf("if coalesce(jsonb_typeof(p_payload)"));
  assert.ok(actionGuard < rpc.indexOf("perform set_config('lock_timeout'"));
  assert.match(rpc, /voiceup:unsupported_action/);
});

test("RPC resolves pgcrypto from its installed Supabase schema", () => {
  assert.match(migration, /from pg_extension extension_info/);
  assert.match(migration, /extension_info\.extname = 'pgcrypto'/);
  assert.match(
    migration,
    /to_regprocedure\(format\('%I\.digest\(text,text\)', pgcrypto_schema\)\)/
  );
  assert.match(migration, /digest_return_type <> 'bytea'::regtype/);
  assert.match(
    migration,
    /alter function public\.mutate_voiceup_public_participation\(text,text,text,text,text,text,text,jsonb,jsonb\) set search_path = public, %I, pg_temp/
  );
});

test("every jsonb_build_object call remains within PostgreSQL's 100-argument limit", () => {
  const calls = jsonbBuildObjectCalls(migration);
  assert.ok(calls.length > 0);
  assert.ok(
    calls.every(({ argumentCount }) => argumentCount % 2 === 0),
    `jsonb_build_object requires key/value pairs: ${JSON.stringify(calls)}`
  );
  const oversizedCalls = calls.filter(({ argumentCount }) => argumentCount > 100);
  assert.deepEqual(oversizedCalls, []);
});

test("two concurrent submissions for the same phone serialize and resolve one canonical supporter", () => {
  const rpc = rpcSource();
  assert.match(rpc, /from public\.voiceup_workspaces workspace[\s\S]*for update/);
  assert.match(rpc, /canonicalPhone[\s\S]*voiceup_normalize_public_phone/);
  assert.match(rpc, /limit 1/);
  assert.match(rpc, /if v_original_signer is null[\s\S]*jsonb_build_array\(v_signer\) \|\| v_signers/);
});

test("concurrent submissions for different phones preserve both supporters", () => {
  const rpc = rpcSource();
  assert.match(rpc, /jsonb_build_array\(v_signer\) \|\| v_signers/);
  assert.match(rpc, /jsonb_agg\([\s\S]*else signer_item end/);
  assert.equal((rpc.match(/update public\.voiceup_workspaces/g) ?? []).length, 1);
});

test("repeated idempotency key returns the original successful result", () => {
  const rpc = rpcSource();
  assert.match(rpc, /publicParticipationIdempotency/);
  assert.match(rpc, /return v_existing_idempotency -> 'result'/);
  assert.match(rpc, /limit 100/);
});

test("refresh with a new key does not duplicate completed support", () => {
  const rpc = rpcSource();
  assert.match(rpc, /v_support_already_complete/);
  assert.match(rpc, /supportSubmittedAt/);
  assert.match(rpc, /digitalSupportedAt/);
});

test("equivalent Indian phone formats share one canonical identity including a leading zero", () => {
  assert.match(migration, /\^0\[6-9\]\[0-9\]\{9\}\$/);
  assert.match(migration, /\^91\[6-9\]\[0-9\]\{9\}\$/);
  assert.match(sharedEdge, /digits\.startsWith\("0"\)|\/\^0\[6-9\]/);
  assert.match(sharedEdge, /\/\^91\[6-9\]/);
});

test("invalid OTP proof cannot resume or update a profile", () => {
  const rpc = rpcSource();
  assert.match(rpc, /voiceup_otp_challenges/);
  assert.match(rpc, /verificationTokenHash/);
  assert.match(rpc, /challenge\.expires_at > v_now/);
  assert.match(rpc, /voiceup:otp_verification_required/);
});

test("one supporter cannot read another supporter's profile", () => {
  const rpc = rpcSource();
  assert.match(rpc, /challenge\.phone_hash = encode\(/);
  assert.match(rpc, /identityHash/);
  assert.match(rpc, /v_safe_signer := jsonb_strip_nulls/);
  assert.doesNotMatch(rpc, /'signers', v_signers[\s\S]*'result'/);
});

test("verified drafts are server-backed and resume after a new browser session", () => {
  assert.match(publicPage, /onSaveDraft/);
  assert.match(app, /action:\s*"save_draft"/);
  assert.match(app, /action:\s*"resume_verified_supporter"/);
  assert.match(backend, /mutatePublicParticipation/);
});

test("stale drafts fill blanks without erasing newer completed fields", () => {
  const rpc = rpcSource();
  assert.match(rpc, /v_is_stale/);
  assert.match(rpc, /A stale browser may fill blanks but cannot erase or replace newer data/);
  assert.match(rpc, /A completed support record can be enriched but never returned to draft/);
});

test("campaign-support consent is mandatory while communication consent is optional", () => {
  const rpc = rpcSource();
  assert.match(rpc, /campaignSupport,granted/);
  assert.match(rpc, /voiceup:consent_required/);
  assert.match(publicPage, /name="campaignCommunicationConsent"/);
  assert.doesNotMatch(publicPage, /required[^>]*name="campaignCommunicationConsent"/);
});

test("consent withdrawal remains in bounded historical audit evidence", () => {
  const rpc = rpcSource();
  assert.match(rpc, /'granted', \(v_value ->> 'granted'\)::boolean/);
  assert.match(rpc, /consentHistory/);
  assert.match(rpc, /limit 50/);
  assert.match(rpc, /public_participation\.' \|\| p_action/);
});

test("one pending coordinator application is created and duplicate active applications are blocked", () => {
  const rpc = rpcSource();
  assert.match(rpc, /'status', 'Pending Approval'/);
  assert.match(rpc, /not in \('Incomplete', 'Pending Approval'\)/);
  assert.match(rpc, /voiceup:active_coordinator_application_exists/);
});

test("public callers cannot approve themselves and sync reads authoritative Coordinator Network state", () => {
  const rpc = rpcSource();
  assert.match(rpc, /coordinator_authority_protected/);
  assert.match(rpc, /from public\.voiceup_coordinators coordinator/);
  assert.match(rpc, /from public\.voiceup_coordinator_campaigns campaign_link/);
  assert.match(rpc, /then 'Approved'/);
  assert.doesNotMatch(publicPage, /applicationStatus:\s*"Approved"/);
});

test("existing authorized Coordinator approval RPC remains unchanged and usable", () => {
  assert.match(coordinatorMigration, /create or replace function public\.set_voiceup_coordinator_status/);
  assert.match(coordinatorMigration, /voiceup_can_manage_coordinator_network/);
  assert.match(coordinatorMigration, /grant execute on function public\.set_voiceup_coordinator_status/);
  assert.doesNotMatch(migration, /create or replace function public\.set_voiceup_coordinator_status/);
});

test("paper-origin provenance survives later digital support", () => {
  const rpc = rpcSource();
  assert.match(rpc, /v_signer ->> 'source' in \('scan', 'field'\)/);
  assert.match(rpc, /participationSources/);
  assert.match(rpc, /\["paper","digital"\]/);
});

test("public metrics are aggregate-only and keep paper, digital, geography, and coordinator counts separate", () => {
  const rpc = rpcSource();
  for (const key of [
    "digitalSupporters",
    "paperRecordsReceived",
    "paperRecordsDigitised",
    "paperRecordsPending",
    "verifiedSupporters",
    "activeGeographyCoverage",
    "coordinatorCounts"
  ]) assert.match(rpc, new RegExp(`'${key}'`));
  const metricProjection = rpc.slice(
    rpc.indexOf("select jsonb_build_object(\n      'total'"),
    rpc.indexOf("if v_signer is not null then", rpc.indexOf("select jsonb_build_object(\n      'total'"))
  );
  assert.doesNotMatch(metricProjection, /'phone'|'email'|'name'/);
});

test("legacy online signers and legacy campaign-support consent remain readable", () => {
  const rpc = rpcSource();
  assert.match(rpc, /v_signer ->> 'source' = 'online'[\s\S]*v_signer ->> 'status' = 'verified'/);
  assert.match(rpc, /when coalesce\(v_signer ->> 'consentAccepted', 'false'\) = 'true'/);
  assert.match(rpc, /legacy-campaign-support/);
});

test("existing public submission response fields and route integration remain compatible", () => {
  assert.match(edge, /rawAction === "submit" \? "submit_support"/);
  assert.match(edge, /signer:\s*mutation\.data\.signer/);
  assert.match(edge, /message:\s*mutation\.data\.message/);
  assert.match(edge, /metrics:\s*mutation\.data\.metrics/);
  assert.match(app, /submitPublicSignatureSecure/);
});

test("busy lock timeout is retryable and preserves the idempotency key", () => {
  const rpc = rpcSource();
  assert.match(rpc, /lock_timeout', '2000ms'/);
  assert.match(rpc, /when lock_not_available or query_canceled/);
  assert.match(rpc, /'retryable', true/);
  assert.match(rpc, /same idempotency key/);
  assert.match(edge, /busy:\s*\{\s*status:\s*503/);
});

test("base64 profile images cannot be persisted", () => {
  assert.equal(hasBase64Image({ profilePhotoPath: "data:image/png;base64,AAAA" }), true);
  assert.equal(hasBase64Image({ profilePhotoPath: "workspace/supporter/photo.jpg" }), false);
  assert.match(migration, /voiceup:base64_not_allowed/);
  assert.match(edge, /hasBase64Image\(body\)/);
});

test("unsupported patch fields and authority fields are rejected", () => {
  assert.equal(validateProfileFields({ name: "Asha", districtId: "district-1" }), true);
  assert.equal(validateProfileFields({ role: "platform_owner" }), false);
  assert.equal(validateProfileFields({ approvalStatus: "Approved" }), false);
  assert.match(migration, /unsupported_profile_field/);
  assert.match(migration, /coordinator_authority_protected/);
});

test("whole-workspace JSON cannot be supplied or overwritten by the public client", () => {
  const rpc = rpcSource();
  assert.match(rpc, /'workspaceData', 'campaigns', 'signers', 'auditLogs'/);
  assert.match(rpc, /voiceup:protected_patch_field/);
  assert.doesNotMatch(edge, /writeWorkspace|readWorkspace/);
  assert.doesNotMatch(backend.slice(backend.indexOf("mutatePublicParticipation")), /workspaceData/);
});

test("Edge validation is bounded, action-specific, service-role mediated, and does not expose raw database errors", () => {
  assert.match(edge, /MAX_PUBLIC_BODY_BYTES = 64 \* 1024/);
  assert.match(edge, /normalizePublicCampaignSlug\(slug\)/);
  assert.match(edge, /isPublicParticipationAction/);
  assert.match(edge, /admin\.rpc\("mutate_voiceup_public_participation"/);
  assert.match(edge, /rpcErrorCode/);
  assert.doesNotMatch(edge, /console\.(log|info|debug|warn)/);
  assert.match(edge, /console\.error\("voiceup-public-signing RPC failure"/);
  assert.match(edge, /console\.error\("voiceup-public-signing unexpected failure"/);
  assert.doesNotMatch(edge, /error instanceof Error \? error\.message/);
});
