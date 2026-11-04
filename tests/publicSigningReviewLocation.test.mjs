import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicCampaignPage = readFileSync(
  new URL("../src/pages/PublicCampaignPage.tsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Review displays the selected public-signing location hierarchy while submission retains canonical identity", () => {
  const reviewStart = publicCampaignPage.indexOf('{wizardStep === "review"');
  const reviewEnd = publicCampaignPage.indexOf('{wizardStep === "done"', reviewStart);

  assert.ok(reviewStart >= 0, "expected the Review step");
  assert.ok(reviewEnd > reviewStart, "expected the completed step after Review");

  const reviewSource = publicCampaignPage.slice(reviewStart, reviewEnd);
  for (const field of ["state", "district", "block", "panchayat"]) {
    assert.match(reviewSource, new RegExp(`publicForm\\.${field}`));
    assert.match(reviewSource, new RegExp(`copy\\.locationLabels\\.${field}`));
  }

  assert.match(
    publicCampaignPage,
    /onConfirmCanonicalReference=\{\(locationReference\) =>[\s\S]*?locationReference/
  );
  assert.match(appSource, /const signerPayload = \{[\s\S]*?\.\.\.restrictedPublicForm/);
  assert.match(appSource, /makePublicSigner\([\s\S]*?\.\.\.restrictedPublicForm/);
});
