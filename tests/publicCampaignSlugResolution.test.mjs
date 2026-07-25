import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  fetchCanonicalPublishedCampaignBySlug,
  resolveCanonicalPublishedCampaign
} from "../supabase/functions/_shared/publicCampaignIndex.ts";
import {
  normalizePublicCampaignSlug,
  publicCampaignSlugsMatch
} from "../supabase/functions/_shared/publicCampaignSlug.ts";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const publicCampaignSource = readFileSync(
  new URL("../supabase/functions/voiceup-public-campaign/index.ts", import.meta.url),
  "utf8"
);
const publicSigningSource = readFileSync(
  new URL("../supabase/functions/voiceup-public-signing/index.ts", import.meta.url),
  "utf8"
);
const otpSource = readFileSync(
  new URL("../supabase/functions/voiceup-otp/index.ts", import.meta.url),
  "utf8"
);

function campaignRow(overrides = {}) {
  return {
    workspace_id: "workspace-1",
    campaign_id: "cmp-1",
    slug: "GSAA",
    status: "Published",
    campaign: { id: "cmp-1", slug: "GSAA", status: "Published" },
    ...overrides
  };
}

function createAdmin(rows) {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    ilike(column, value) {
      calls.push(["ilike", column, value]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    limit(value) {
      calls.push(["limit", value]);
      return Promise.resolve({ data: rows, error: null });
    }
  };
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      return query;
    }
  };
}

test("stored slug GSAA resolves for request GSAA", async () => {
  const admin = createAdmin([campaignRow()]);
  const result = await fetchCanonicalPublishedCampaignBySlug(admin, "GSAA");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.row.slug, "GSAA");
  assert.deepEqual(
    admin.calls.filter(([method]) => ["ilike", "eq", "limit"].includes(method)),
    [
      ["ilike", "slug", "gsaa"],
      ["eq", "status", "Published"],
      ["limit", 2]
    ]
  );
});

test("stored slug GSAA resolves for request gsaa", async () => {
  const result = await fetchCanonicalPublishedCampaignBySlug(
    createAdmin([campaignRow()]),
    "gsaa"
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.row.slug, "GSAA");
});

test("published rows differing only by slug case fail as ambiguous", () => {
  const result = resolveCanonicalPublishedCampaign(
    [
      campaignRow(),
      campaignRow({
        workspace_id: "workspace-2",
        campaign_id: "cmp-2",
        slug: "gsaa"
      })
    ],
    "GsAa"
  );

  assert.deepEqual(result, { ok: false, reason: "ambiguous" });
});

test("unpublished campaign remains unavailable", () => {
  const result = resolveCanonicalPublishedCampaign(
    [campaignRow({ status: "Draft" })],
    "GSAA"
  );

  assert.deepEqual(result, { ok: false, reason: "not_found" });
});

test("empty and invalid slugs remain unavailable", async () => {
  assert.equal(normalizePublicCampaignSlug(""), "");
  assert.equal(normalizePublicCampaignSlug("bad_slug"), "");
  assert.equal(publicCampaignSlugsMatch("GSAA", "gsaa"), true);

  const empty = await fetchCanonicalPublishedCampaignBySlug(createAdmin([]), "");
  const invalid = await fetchCanonicalPublishedCampaignBySlug(createAdmin([]), "bad_slug");
  assert.deepEqual(empty, { ok: false, reason: "not_found" });
  assert.deepEqual(invalid, { ok: false, reason: "not_found" });
});

test("frontend and all public Edge paths reuse canonical slug resolution", () => {
  assert.match(backendSource, /publicCampaignSlugsMatch\(campaign\.slug, normalizedSlug\)/);
  assert.match(appSource, /publicCampaignSlugsMatch\(c\.slug, publicCampaignSlug\)/);
  assert.match(
    appSource,
    /const publicParticipationSlug = publicCampaignSlug \|\| activeCampaign\?\.slug \|\| ""/
  );
  assert.match(publicCampaignSource, /fetchCanonicalPublishedCampaignBySlug\(admin, slug\)/);
  assert.match(publicSigningSource, /fetchCanonicalPublishedCampaignBySlug\(admin, slug\)/);
  assert.doesNotMatch(
    publicSigningSource,
    /String\(body\.slug \?\? ""\)\.trim\(\)\.toLowerCase\(\)/
  );
  assert.match(otpSource, /fetchCanonicalPublishedCampaignBySlug\(admin, publicSlug\)/);
});
