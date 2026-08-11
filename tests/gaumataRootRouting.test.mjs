import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublicCampaignSlug } from "../src/utils/routing.ts";

test("Gaumata root resolves the canonical Gau Samman campaign", () => {
  const canonicalSlug = "gau-samman-ahvaan-abhiyan";
  assert.equal(resolvePublicCampaignSlug({ hostname: "gaumata.cloud", pathname: "/" }), canonicalSlug);
  assert.equal(resolvePublicCampaignSlug({ hostname: "www.gaumata.cloud", pathname: "/" }), canonicalSlug);
  assert.equal(resolvePublicCampaignSlug({ hostname: "gaumata.cloud", pathname: "" }), canonicalSlug);
});

test("direct campaigns and admin routes retain their existing precedence", () => {
  assert.equal(resolvePublicCampaignSlug({ hostname: "gaumata.cloud", pathname: "/c/GSAA" }), "GSAA");
  assert.equal(resolvePublicCampaignSlug({ hostname: "gaumata.cloud", pathname: "/c/other-slug" }), "other-slug");
  assert.equal(resolvePublicCampaignSlug({ hostname: "gaumata.cloud", pathname: "/admin" }), "");
  assert.equal(resolvePublicCampaignSlug({ hostname: "gaumata.cloud", pathname: "/admin/GSAA" }), "");
  assert.equal(resolvePublicCampaignSlug({ hostname: "voiceup.example", pathname: "/" }), "");
});
