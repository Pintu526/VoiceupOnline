import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const publicPageSource = readSource("../src/pages/PublicCampaignPage.tsx");
const publicCss = readSource("../src/publicSigningExperience.css");
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

test("premium success uses only the authoritative signer, campaign, and aggregate metrics", () => {
  const successSource = sliceBetween(
    publicPageSource,
    'className="public-premium-success"',
    'className="public-celebration"'
  );
  assert.match(successSource, /lastSignedSigner\?\.name/);
  assert.match(successSource, /lastSignedSigner\?\.id/);
  assert.match(successSource, /displayCampaign\.title/);
  assert.match(successSource, /metrics\.total\.toLocaleString\(\)/);
  assert.match(successSource, /configuredCampaignGoal !== null/);
  assert.match(successSource, /metrics\.progress/);
  assert.match(successSource, /t\("public\.success\.recorded"\)/);
  assert.match(successSource, /t\("public\.success\.partOfMovement"\)/);
  assert.doesNotMatch(successSource, /projected|estimated|achievement|rank|millions/i);
});

test("celebration reuses configured campaign copy and fabricates no impact claim", () => {
  const celebrationSource = sliceBetween(
    publicPageSource,
    'className="public-celebration"',
    '<section className="public-post-sign-sharing"'
  );
  assert.match(celebrationSource, /displayCampaign\.thankYouMessage/);
  assert.match(celebrationSource, /t\("goudhanCampaign\.tagline"\)/);
  assert.doesNotMatch(celebrationSource, /million|recognition|reward|achievement/i);
});

test("one post-sign share surface uses the existing personal referral URL for every channel", () => {
  assert.equal(
    (publicPageSource.match(/className="public-post-sign-sharing"/g) ?? []).length,
    1
  );
  assert.match(publicPageSource, /whatsapp:.*personalReferralUrl/);
  assert.match(publicPageSource, /telegram:.*personalReferralUrl/);
  assert.match(publicPageSource, /facebook:.*personalReferralUrl/);
  assert.match(publicPageSource, /x:.*personalReferralUrl/);
  const shareSource = sliceBetween(
    publicPageSource,
    '<section className="public-post-sign-sharing"',
    "{isGoudhanExperience && personalReferralCode"
  );
  for (const channel of ["whatsapp", "facebook", "x", "telegram"]) {
    assert.match(shareSource, new RegExp(`shareLinks\\.${channel}`));
    assert.match(shareSource, new RegExp(`trackShareClick\\("${channel}"\\)`));
  }
  assert.match(shareSource, /value=\{personalReferralUrl\}/);
  assert.match(shareSource, /public-personal-referral-url.*personalReferralUrl/);
  assert.match(shareSource, /copyReferralText\(t\("public\.referralLink"\), personalReferralUrl, "copy"\)/);
  assert.match(shareSource, /downloadActQr/);
});

test("get involved presents supporter, volunteer, and coordinator paths without granting access", () => {
  const involvementSource = sliceBetween(
    publicPageSource,
    '<div className="public-involvement-options">',
    "{savedMovementRequest &&"
  );
  assert.equal((involvementSource.match(/<article>/g) ?? []).length, 3);
  assert.match(involvementSource, /public\.success\.continueSupporter/);
  assert.match(involvementSource, /public\.requests\.volunteerTitle/);
  assert.match(involvementSource, /public\.requests\.coordinatorTitle/);
  assert.match(publicPageSource, /onSubmitMovementRequest/);
  assert.doesNotMatch(involvementSource, /approve|reject|assignRole|grantPermission/i);
});

test("authoritative coordinator response displays selected level, minimum, geography, and responsibility", () => {
  const resultSource = sliceBetween(
    publicPageSource,
    "{savedMovementRequest &&",
    "{movementRequestError &&"
  );
  assert.match(resultSource, /savedMovementRequest\.id/);
  assert.match(resultSource, /savedMovementRequest\.status/);
  assert.match(resultSource, /savedMovementRequest\.preferredLevel/);
  assert.match(resultSource, /savedMovementRequest\.minimumAcceptableLevel/);
  assert.match(resultSource, /formatParticipationRequestGeography\(savedMovementRequest\)/);
  assert.match(resultSource, /public\.requests\.responsibility/);
  assert.match(resultSource, /movementRequestResultRef.*tabIndex=\{-1\}/);
});

test("request tracker displays only server-returned public request fields", () => {
  const trackerSource = sliceBetween(
    publicPageSource,
    'className="public-request-tracker"',
    "{isGoudhanExperience && ("
  );
  assert.match(trackerSource, /savedMovementRequests\.map/);
  assert.match(trackerSource, /request\.id/);
  assert.match(trackerSource, /request\.status/);
  assert.match(trackerSource, /request\.submittedAt/);
  assert.match(trackerSource, /request\.requestType/);
  assert.match(trackerSource, /request\.campaign\.title/);
  assert.match(trackerSource, /request\.currentStage/);
  assert.match(trackerSource, /request\.updatedAt/);
  assert.doesNotMatch(trackerSource, /routingMetadata|candidateApprover|reviewer|auditMetadata/);
  assert.doesNotMatch(trackerSource, /approvedAt|assignedAt|reviewedAt|new Date\(\)/);
});

test("movement dashboard has one entry control and only the approved initial surfaces", () => {
  const dashboardSource = sliceBetween(
    publicPageSource,
    'className="public-movement-dashboard-entry"',
    "{(!isGoudhanExperience || !onSubmitMovementRequest)"
  );
  assert.equal(
    (dashboardSource.match(/t\("public\.success\.movementDashboard"\)/g) ?? []).length,
    2,
    "one visible button label and one accessible dashboard label are expected"
  );
  assert.match(dashboardSource, /aria-expanded=\{showMovementDashboard\}/);
  assert.match(dashboardSource, /aria-controls="public-movement-dashboard"/);
  assert.match(dashboardSource, /public\.success\.mySupport/);
  assert.match(dashboardSource, /public\.success\.myRequests/);
  assert.match(dashboardSource, /public\.success\.myReferralLink/);
  assert.match(dashboardSource, /public\.success\.mySharedLinks/);
  assert.doesNotMatch(
    dashboardSource,
    /Certificates|Recognition|Volunteer Activity|Coordinator Activity/
  );
});

test("multiple authoritative request responses remain available in the current tracker", () => {
  assert.match(publicPageSource, /useState<PublicParticipationRequest\[]>\(\[\]\)/);
  assert.match(
    publicPageSource,
    /setSavedMovementRequests\(\(current\) => \[[\s\S]*saved,[\s\S]*current\.filter/
  );
  assert.match(publicPageSource, /item\.requestType !== saved\.requestType/);
});

test("premium success UI is responsive, keyboard-focused, and motion-safe", () => {
  assert.match(publicCss, /\.public-premium-success[\s\S]*border-radius:\s*22px/);
  assert.match(publicCss, /\.public-involvement-options[\s\S]*repeat\(3/);
  assert.match(publicCss, /\.public-dashboard-share-links a[\s\S]*min-height:\s*44px/);
  assert.match(publicCss, /@media \(max-width: 600px\)[\s\S]*\.public-success-facts,[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(publicCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(publicPageSource, /movementRequestResultRef\.current\?\.focus\(\)/);
});

test("premium success copy has exact English, Hindi, and Odia parity", () => {
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
