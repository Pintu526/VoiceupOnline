import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260802010000_public_campaign_journey_lookup.sql", import.meta.url),
  "utf8"
);
const edge = readFileSync(
  new URL("../supabase/functions/voiceup-public-campaign/index.ts", import.meta.url),
  "utf8"
);
const backend = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("journey RPC is published-only, read-only, service-role-only, and ambiguous-match safe", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /campaign_index\.status = 'Published'/);
  assert.match(migration, /if v_match_count <> 1 then\s+return null;/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /\b(insert|update|delete)\s+into\b/i);
});

test("journey lookup requires an exact persisted referral code and returns only allowlisted fields", () => {
  assert.match(migration, /signer ->> 'referralCode'/);
  assert.match(migration, /'supporterCode'[\s\S]*'displayName'[\s\S]*'campaignTitle'[\s\S]*'campaignSlug'/);
  assert.match(migration, /'joinedDate'[\s\S]*'state'[\s\S]*'district'[\s\S]*'status'[\s\S]*'referralCount'/);
  for (const field of ["phone", "email", "address", "postalCode", "workspaceId", "supporterId"]) {
    assert.doesNotMatch(migration, new RegExp(`'${field}'`));
  }
});

test("invalid, unknown, duplicate, unpublished, and legacy codes resolve to journey null", () => {
  assert.match(migration, /if v_code !~ '\^VU-/);
  assert.match(migration, /if v_match_count <> 1 then\s+return null;/);
  assert.match(migration, /coalesce\(signer ->> 'referralCode', ''\)/);
  assert.match(edge, /return jsonResponse\(\{ journey: data \?\? null \}\)/);
});

test("public edge journey action is isolated from the existing slug contract", () => {
  assert.match(edge, /body\?\.action === "read_campaign_journey"/);
  assert.match(edge, /admin\.rpc\("voiceup_read_public_campaign_journey"/);
  assert.match(edge, /const slug = String\(body\?\.slug \?\? ""\)\.trim\(\)/);
  assert.match(edge, /fetchCanonicalPublishedCampaignBySlug\(admin, slug\)/);
});

test("/r/:code uses only the server journey DTO and keeps public campaign loading unchanged", () => {
  assert.match(backend, /export async function loadPublicCampaignJourney/);
  assert.match(app, /loadPublicCampaignJourney\(supporterPortalCode\)/);
  assert.match(app, /<PublicCampaignJourneyPage journey=\{publicCampaignJourney\}/);
  assert.doesNotMatch(app, /supporterPortalResult/);
  assert.match(app, /const publicCampaign = await loadPublicCampaign\(publicCampaignSlug\)/);
});
