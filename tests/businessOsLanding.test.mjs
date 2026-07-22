import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const landing = fs.readFileSync("src/pages/MarketingHomePage.tsx", "utf8");
const sections = fs.readFileSync("src/pages/BusinessOsLandingSections.tsx", "utf8");
const applicationsSource = fs.readFileSync("src/pages/marketingApplications.ts", "utf8");
const styles = fs.readFileSync("src/styles.css", "utf8");
const english = JSON.parse(fs.readFileSync("src/i18n/locales/en.json", "utf8"));

test("landing hero is Business OS focused and contains no campaign proof copy", () => {
  assert.equal(english.landing.businessOs.hero.title, "VoiceUp Business OS");
  assert.equal(english.landing.businessOs.hero.tagline, "One Business Operating Suite.");
  assert.deepEqual(Object.values(english.landing.businessOs.hero.lines), [
    "Organise teams.",
    "Launch applications.",
    "Operate organizations.",
    "Create measurable impact."
  ]);
  assert.deepEqual(Object.keys(english.landing.businessOs.hero.cards), ["applications", "ai", "enterprise", "modular"]);
  assert.doesNotMatch(landing, /hero-proof-strip|speedValue|viralValue/);
});

test("Business OS lifecycle includes every expandable stage and capability", () => {
  const expectedStages = {
    organise: ["teams", "roles", "coordinatorNetwork", "organizationSetup"],
    plan: ["campaigns", "projects", "events", "missions", "aiPlanning"],
    act: ["execute", "volunteers", "tasks", "mobileWorkforce", "offlineOperations"],
    fund: ["donations", "membership", "marketplace", "commerce", "subscriptions"],
    prove: ["transparency", "evidence", "reports", "analytics", "auditTrail"],
    grow: ["crm", "referrals", "recognition", "rewards", "communication", "aiInsights"]
  };
  for (const [stage, items] of Object.entries(expectedStages)) {
    assert.match(sections, new RegExp(`key: \\"${stage}\\"`));
    for (const item of items) assert.match(sections, new RegExp(`\\"${item}\\"`));
  }
  assert.match(sections, /landing\.businessOs\.lifecycle\.stages\.\$\{key\}/);
  assert.match(sections, /aria-expanded=\{expanded\}/);
  assert.match(sections, /<AnimatePresence initial=\{false\}>/);
});

test("application carousel supports autoplay, hover pause, keyboard, and touch", () => {
  assert.match(sections, /window\.setInterval\(\(\) => move\(1\), 2000\)/);
  assert.match(sections, /onMouseEnter=\{\(\) => setPaused\(true\)\}/);
  assert.match(sections, /event\.key === "ArrowRight"/);
  assert.match(sections, /onTouchStart=\{handleTouchStart\}/);
  assert.match(sections, /onTouchEnd=\{handleTouchEnd\}/);
  for (const action of ["organise", "learnMore", "start"]) {
    assert.match(sections, new RegExp(`carousel\\.actions\\.${action}`));
  }
});

test("landing lists the six approved applications with portfolio statuses", () => {
  const expected = {
    campaign: ["Campaign", "Collective Action & Crowd Movement Management"],
    goudhan: ["Goudhan", "Cow Economy Marketplace"],
    panditOnline: ["PanditOnline", "Professional Religious Services"],
    teachToday: ["TeachToday", "Education Platform"],
    homeNurseHub: ["Home Nurse Hub", "Healthcare Services"],
    cateringHub: ["Catering Hub", "Food & Event Services"]
  };
  for (const [key, [name, description]] of Object.entries(expected)) {
    assert.equal(english.landing.saas.apps[key].name, name);
    assert.equal(english.landing.saas.apps[key].description, description);
    assert.match(applicationsSource, new RegExp(`key: \\"${key}\\"`));
  }
  assert.match(landing, /application\.key !== "voiceup"/);
  assert.match(applicationsSource, /status: "LIVE"/);
  assert.match(applicationsSource, /status: "IN PROGRESS"/);
  assert.match(applicationsSource, /status: "COMING SOON"/);
});

test("shared platform services and responsive landing styles are complete", () => {
  assert.equal(Object.keys(english.landing.businessOs.services.items).length, 12);
  assert.match(sections, /const platformServices:/);
  assert.match(styles, /\.business-platform-service-grid\s*\{[^}]*repeat\(4,/s);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("existing landing application routes remain wired", () => {
  for (const route of ["/applications", "/applications/${applicationKey}/team", "/applications/${applicationKey}/act"]) {
    assert.match(landing, new RegExp(route.replace(/[${}]/g, "\\$&")));
  }
  assert.match(landing, /<MarketingApplicationGateways/);
  assert.match(landing, /<OnboardingWizard/);
});
