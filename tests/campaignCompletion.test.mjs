import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  calculateCapabilityCompletion,
  calculateWeightedCompletion,
  campaignCapabilityAssessments,
  getCampaignCompletionSummary
} from "../src/campaignCompletion.ts";
import {
  campaignShowcaseModules,
  campaignShowcaseTracks
} from "../src/campaignShowcaseCatalog.ts";

const expectedIds = [
  "organizations-workspaces",
  "volunteers-coordinators",
  "roles-permissions",
  "resources-locations",
  "campaign-lifecycle",
  "campaign-settings-branding",
  "objectives-milestones",
  "task-resource-allocation",
  "gsaa-public-campaign",
  "six-step-signing",
  "otp-verification",
  "duplicate-prevention",
  "field-collection",
  "field-evidence",
  "offline-paper-signatures",
  "supporter-registration-claim",
  "supporter-dashboard",
  "participation-receipts",
  "crowdfunding-budget",
  "donation-management",
  "financial-reporting",
  "expenses-reconciliation",
  "fundraising-transparency",
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
  "volunteer-mobilization",
  "engagement-hub",
  "action-center",
  "saas-administration",
  "subscriptions-trials",
  "authentication",
  "multilingual-localization",
  "ai-copilot",
  "content-studio",
  "shared-reporting",
  "communications-integrations",
  "document-intelligence"
];
const unavailableEvidencePrefix = "Unavailable in this release base: ";

test("the verified catalogue preserves all 47 capabilities and seven existing tracks", () => {
  assert.deepEqual(campaignShowcaseModules.map((module) => module.id), expectedIds);
  assert.deepEqual(campaignShowcaseTracks.map((track) => track.id), [
    "organize",
    "plan",
    "act",
    "fund",
    "prove",
    "grow",
    "businessOs"
  ]);
  assert.equal(campaignCapabilityAssessments.length, 47);
  assert.deepEqual(campaignCapabilityAssessments.map((assessment) => assessment.id), expectedIds);
  const catalogueDigest = createHash("sha256")
    .update(fs.readFileSync("src/campaignShowcaseCatalog.ts"))
    .digest("hex");
  assert.equal(catalogueDigest, "80ce01812fa742c61cd8c838338248b9ef12fcab9f898caedd85a7a66875a11a");
});

test("original statuses remain unchanged and verified status history records the actual result", () => {
  const originalCounts = { completed: 0, pendingFinalReview: 30, inProgress: 8, notStarted: 8, blocked: 1 };
  const actualCounts = { completed: 0, pendingFinalReview: 29, inProgress: 10, notStarted: 7, blocked: 1 };
  const summary = getCampaignCompletionSummary();

  assert.deepEqual(summary.previousStatusCounts, originalCounts);
  assert.deepEqual(summary.statusCounts, actualCounts);
  for (const module of campaignShowcaseModules) {
    const assessment = campaignCapabilityAssessments.find((entry) => entry.id === module.id);
    assert.ok(assessment, `missing assessment for ${module.id}`);
    assert.equal(assessment.previousStatus, module.status, `${module.id} original status changed`);
    assert.equal(assessment.statusHistory[0].status, module.status);
    assert.equal(assessment.statusHistory.at(-1).status, assessment.actualStatus);
    assert.equal(assessment.statusHistory.length, 2);
  }

  const rewards = campaignCapabilityAssessments.find((assessment) => assessment.id === "rewards-recognition");
  assert.equal(rewards?.previousStatus, "notStarted");
  assert.equal(rewards?.actualStatus, "inProgress");
  assert.ok(rewards?.evidence.includes("src/pages/app/GrowthDashboardTab.tsx"));
  assert.ok(rewards?.evidence.includes("src/growth/rewards/rewardRuntimeService.ts"));

  const evidenceManagement = campaignCapabilityAssessments.find((assessment) => assessment.id === "evidence-management");
  assert.equal(evidenceManagement?.previousStatus, "pendingFinalReview");
  assert.equal(evidenceManagement?.actualStatus, "inProgress");
  assert.equal(evidenceManagement?.completionPercent, 40);
  assert.ok(evidenceManagement?.evidence.includes("src/pages/app/VbossModulePlaceholder.tsx"));
  assert.ok(evidenceManagement?.evidence.includes("src/pages/app/ScansTab.tsx"));
});

test("every capability has weighted evidence, user-facing acceptance details, and a verification date", () => {
  for (const assessment of campaignCapabilityAssessments) {
    assert.equal(assessment.lastVerified, "2026-11-03");
    assert.ok(assessment.capabilityWeight > 0);
    assert.equal(assessment.criteria.reduce((sum, criterion) => sum + criterion.weight, 0), 100);
    assert.ok(assessment.criteria.length >= 4);
    assert.ok(assessment.criteria.every((criterion) => criterion.weight > 0 && criterion.evidence.length > 0));
    assert.ok(assessment.workingFunctionality.en.trim());
    assert.ok(assessment.remainingFunctionality.en.trim());
    assert.ok(assessment.statusRationale.en.trim());
    assert.ok(assessment.completionPercent === null || (
      Number.isInteger(assessment.completionPercent)
      && assessment.completionPercent >= 0
      && assessment.completionPercent <= 100
    ));
    for (const path of assessment.evidence) {
      if (path.startsWith(unavailableEvidencePrefix)) {
        assert.ok(!fs.existsSync(path.slice(unavailableEvidencePrefix.length)), `${assessment.id} incorrectly marks available evidence unavailable`);
      } else {
        assert.ok(fs.existsSync(path), `${assessment.id} references missing evidence ${path}`);
      }
    }
    for (const criterion of assessment.criteria) {
      for (const path of criterion.evidence) {
        if (path.startsWith(unavailableEvidencePrefix)) {
          assert.ok(!fs.existsSync(path.slice(unavailableEvidencePrefix.length)), `${assessment.id} criterion incorrectly marks available evidence unavailable`);
        } else {
          assert.ok(fs.existsSync(path), `${assessment.id} criterion references missing evidence ${path}`);
        }
      }
    }
  }
});

test("candidate-only account and authentication tests remain explicitly unavailable and uncredited", () => {
  const unavailableCapabilities = {
    "supporter-registration-claim": [
      "tests/supporterAccountClaimFlow.test.mjs",
      "tests/supporterAccountOwnership.test.mjs"
    ],
    "supporter-dashboard": [
      "tests/supporterAccountOwnership.test.mjs",
      "tests/accountAccessExperience.test.mjs"
    ],
    authentication: [
      "tests/supporterAuth.test.mjs",
      "tests/supporterEmailConfirmation.test.mjs",
      "tests/supporterPasswordRecovery.test.mjs"
    ]
  };

  for (const [id, paths] of Object.entries(unavailableCapabilities)) {
    const assessment = campaignCapabilityAssessments.find((entry) => entry.id === id);
    assert.ok(assessment);
    assert.equal(assessment.completionPercent, 40);
    assert.equal(assessment.criteria.find((criterion) => criterion.id === `${id}-scope`)?.result, "notAssessed");
    assert.equal(assessment.criteria.find((criterion) => criterion.id === `${id}-regression`)?.result, "notAssessed");
    for (const path of paths) {
      assert.ok(assessment.evidence.includes(`${unavailableEvidencePrefix}${path}`), `${id} must retain unavailable reference ${path}`);
    }
  }
  const accountClaim = campaignCapabilityAssessments.find((entry) => entry.id === "supporter-registration-claim");
  assert.match(accountClaim?.blocker?.en ?? "", /implementation and required migrations.*absent from this release base/i);
  assert.match(accountClaim?.blocker?.en ?? "", /Auth URL allowlist is not the blocker/i);
});

test("completion calculations credit only verified weighted criteria and reserve 100% for full passes", () => {
  const criteria = [
    { weight: 55, result: "verified" },
    { weight: 25, result: "notMet" },
    { weight: 20, result: "notAssessed" }
  ];
  assert.equal(calculateCapabilityCompletion(criteria), 55);
  assert.equal(calculateCapabilityCompletion([
    { weight: 50, result: "verified" },
    { weight: 50, result: "verified" }
  ]), 100);
  assert.equal(calculateCapabilityCompletion([
    { weight: 50, result: "verified" },
    { weight: 50, result: "notAssessed" }
  ]), 50);
  assert.equal(calculateCapabilityCompletion([
    { weight: 100, result: "notAssessed" }
  ]), null);
});

test("overall and track completion use documented capability weights and report production as unassessed", () => {
  const weighted = calculateWeightedCompletion([
    { completionPercent: 80, weight: 3 },
    { completionPercent: 40, weight: 1 },
    { completionPercent: null, weight: 5 }
  ]);
  assert.equal(weighted, 70);

  const summary = getCampaignCompletionSummary();
  assert.equal(summary.totalCapabilities, 47);
  assert.equal(summary.developmentCompletionPercent, 67);
  assert.deepEqual(Object.keys(summary.trackCompletion), [
    "organize",
    "plan",
    "act",
    "fund",
    "prove",
    "grow",
    "businessOs"
  ]);
  assert.ok(Object.values(summary.trackCompletion).every((percent) => Number.isInteger(percent)));
  assert.equal(summary.unassessedCapabilityCount, 0);
  assert.equal(summary.productionReadinessPercent, null);
  assert.equal(summary.productionUnassessedCapabilityCount, 47);
});

test("the Command Center exposes the acceptance evidence without replacing navigation", () => {
  const shell = fs.readFileSync("src/layouts/AppShell.tsx", "utf8");
  const commandCenter = fs.readFileSync("src/pages/app/CommandCenterTab.tsx", "utf8");
  for (const field of [
    "previousStatus",
    "actualStatus",
    "completionPercent",
    "workingFunctionality",
    "remainingFunctionality",
    "blocker",
    "lastVerified",
    "criteria",
    "productionReadiness"
  ]) {
    assert.match(commandCenter, new RegExp(`assessment\\.${field}`));
  }
  assert.match(shell, /canAccessWorkspaceTab\(module\.tab\)/);
  assert.match(shell, /onNavigateModule=\{\(module\)/);
});
