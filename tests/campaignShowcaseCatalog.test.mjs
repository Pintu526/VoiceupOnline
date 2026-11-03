import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  campaignReadinessLabels,
  campaignShowcaseModules,
  campaignShowcaseTracks
} from "../src/campaignShowcaseCatalog.ts";

const languages = ["en", "hi", "or"];
const allowedTabs = new Set([
  "dashboard",
  "command",
  "fund",
  "prove",
  "campaigns",
  "public",
  "movement",
  "coordinators",
  "growth",
  "scans",
  "reports",
  "engagement",
  "activity",
  "saas",
  "ideas"
]);
const shell = fs.readFileSync("src/layouts/AppShell.tsx", "utf8");
const commandCenter = fs.readFileSync("src/pages/app/CommandCenterTab.tsx", "utf8");
const frameworkLocales = Object.fromEntries(
  languages.map((language) => [
    language,
    JSON.parse(fs.readFileSync(`src/i18n/locales/${language}.json`, "utf8")).framework
  ])
);

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [path] : flattenKeys(child, path);
  }).sort();
}

test("campaign showcase covers every framework track and has a substantial module inventory", () => {
  assert.deepEqual(
    campaignShowcaseTracks.map((track) => track.id),
    ["organize", "plan", "act", "fund", "prove", "grow", "businessOs"]
  );
  assert.ok(campaignShowcaseModules.length >= 35);
  assert.equal(new Set(campaignShowcaseModules.map((module) => module.id)).size, campaignShowcaseModules.length);
  for (const track of campaignShowcaseTracks) {
    for (const language of languages) {
      assert.ok(track.title[language].trim());
      assert.ok(track.description[language].trim());
    }
  }
  for (const id of [
    "campaign-lifecycle",
    "organizations-workspaces",
    "volunteers-coordinators",
    "roles-permissions",
    "resources-locations",
    "objectives-milestones",
    "gsaa-public-campaign",
    "six-step-signing",
    "otp-verification",
    "duplicate-prevention",
    "field-collection",
    "field-evidence",
    "offline-paper-signatures",
    "supporter-registration-claim",
    "supporter-dashboard",
    "crowdfunding-budget",
    "donation-management",
    "fundraising-transparency",
    "expenses-reconciliation",
    "financial-reporting",
    "paper-signature-scanning",
    "ocr-processing",
    "manual-transcription",
    "review-approval",
    "evidence-management",
    "progress-analytics",
    "audit-trails",
    "referrals",
    "qr-whatsapp-social",
    "growth-dashboard",
    "rewards-recognition",
    "movement-crm",
    "engagement-hub",
    "action-center",
    "volunteer-mobilization",
    "saas-administration",
    "subscriptions-trials",
    "authentication",
    "multilingual-localization",
    "ai-copilot",
    "content-studio",
    "shared-reporting",
    "communications-integrations"
  ]) {
    assert.ok(campaignShowcaseModules.some((module) => module.id === id), `missing capability ${id}`);
  }
});

test("each module has localized content, a valid protected destination, and a readiness status", () => {
  for (const module of campaignShowcaseModules) {
    if (module.tab) assert.ok(allowedTabs.has(module.tab), `${module.id} has an invalid destination`);
    else if (module.action) assert.equal(module.action, "aiCopilot", `${module.id} has an unknown action`);
    else assert.equal(module.status, "notStarted", `${module.id} has no destination but is not a preview-only module`);
    assert.ok(campaignShowcaseTracks.some((track) => track.id === module.track), `${module.id} has no track`);
    for (const language of languages) {
      assert.ok(module.title[language].trim(), `${module.id} has no ${language} title`);
      assert.ok(module.description[language].trim(), `${module.id} has no ${language} description`);
    }
    assert.ok(campaignReadinessLabels[module.status]);
  }
});

test("existing Campaign Command Center framework strings have EN, HI, and OR key parity", () => {
  const expected = flattenKeys(frameworkLocales.en);
  for (const language of languages.slice(1)) {
    assert.deepEqual(flattenKeys(frameworkLocales[language]), expected, `${language} framework strings differ`);
  }
});

test("Field Collection and OCR/Scans remain distinct capabilities", () => {
  const fieldCollection = campaignShowcaseModules.find((module) => module.id === "field-collection");
  const paperScanning = campaignShowcaseModules.find((module) => module.id === "paper-signature-scanning");
  const ocr = campaignShowcaseModules.find((module) => module.id === "ocr-processing");

  assert.ok(fieldCollection);
  assert.ok(paperScanning);
  assert.ok(ocr);
  assert.equal(fieldCollection.track, "act");
  assert.equal(paperScanning.track, "prove");
  assert.equal(ocr.track, "prove");
  assert.notEqual(fieldCollection.id, ocr.id);
});

test("excluded participation email receipts are not presented as in progress or navigable", () => {
  const receipts = campaignShowcaseModules.find((module) => module.id === "participation-receipts");
  assert.equal(receipts?.status, "notStarted");
  assert.equal(receipts?.tab, undefined);
  assert.match(receipts?.description.en ?? "", /not included in this release/i);
});

test("blocked account claiming records confirmed Auth configuration and pending Preview acceptance", () => {
  const accountClaim = campaignShowcaseModules.find((module) => module.id === "supporter-registration-claim");
  assert.equal(accountClaim?.status, "blocked");
  assert.match(accountClaim?.blockedReason?.en ?? "", /administrator confirmed the existing redirect wildcard/);
  assert.match(accountClaim?.blockedReason?.en ?? "", /acceptance is pending/);
  assert.doesNotMatch(accountClaim?.blockedReason?.en ?? "", /not yet verified/);
});

test("showcase actions retain AppShell entitlement checks and the AI Copilot gate", () => {
  assert.match(shell, /canAccessWorkspaceTab\(module\.tab\)/);
  assert.match(shell, /canUseAiCopilot && !campaignCreationBlockReason/);
  assert.match(commandCenter, /disabled=\{disabled\}/);
  assert.match(commandCenter, /onNavigateModule\(module\)/);
});

test("financial previews do not imply a live payment or donation workflow", () => {
  for (const moduleId of ["crowdfunding-budget", "donation-management", "financial-reporting", "expenses-reconciliation", "fundraising-transparency"]) {
    const module = campaignShowcaseModules.find((candidate) => candidate.id === moduleId);
    assert.equal(module?.status, "notStarted", `${moduleId} must remain visibly unavailable`);
  }
  assert.match(
    campaignShowcaseModules.find((module) => module.id === "donation-management")?.description.en ?? "",
    /No live donation checkout, payment processing, or simulated success/
  );
});
