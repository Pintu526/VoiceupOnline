import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECK_STATUS, evaluateReleaseState } from "../scripts/release-guard/core.mjs";

const developmentRef = "ravweavcfrpiykfgtmbf";
const productionRef = "seseeabxmnsrhghthemd";
const migrationPath = "supabase/migrations/20261019010000_screen_otp_public_signing.sql";
const migrationHash = "migration-sha";

function baseState() {
  const functions = [
    { name: "voiceup-workspace-state", bundleSha256: "workspace-hash" },
    { name: "voiceup-public-signing", bundleSha256: "signing-hash" },
    { name: "voiceup-otp", bundleSha256: "otp-hash" }
  ];
  return {
    mode: "pr",
    policy: {
      expectedRepository: {
        packageName: "voiceup-online",
        remote: "https://github.com/Pintu526/VoiceupOnline.git"
      },
      development: {
        supabaseProjectRef: developmentRef,
        vercelProjectName: "voiceup-development",
        vercelProjectId: "development-project"
      },
      production: {
        forbiddenSupabaseRefs: [productionRef]
      },
      requiredMigrations: [{ path: migrationPath, sha256: migrationHash }],
      requiredEdgeFunctions: functions
    },
    git: {
      rootMatches: true,
      root: "D:/safe",
      packageName: "voiceup-online",
      remote: "https://github.com/Pintu526/VoiceupOnline.git",
      branch: "development",
      expectedBranch: "development",
      commit: "expected-commit",
      expectedCommit: "expected-commit",
      dirtyEntries: []
    },
    environment: {
      supabaseProjectRefs: [developmentRef],
      productionRefInConfiguration: false,
      anonKeyConfigured: true,
      showOtp: "true"
    },
    vercel: { projectId: "development-project" },
    migrationEvidence: {
      projectRef: developmentRef,
      path: migrationPath,
      sha256: migrationHash,
      authoritativeRemoteHistoryVerified: true,
      method: "verified-history"
    },
    localMigrationSha256: migrationHash,
    edgeEvidence: {
      projectRef: developmentRef,
      capturedAt: "2026-10-21T00:00:00Z",
      functions: functions.map((item, index) => ({
        ...item,
        version: index + 1,
        status: "ACTIVE",
        verifyJwt: true
      })),
      sourceFiles: [{ path: "supabase/functions/voiceup-otp/index.ts", sha256: "source-hash" }]
    },
    edgeSourceHashes: {
      "supabase/functions/voiceup-otp/index.ts": "source-hash"
    },
    vercelEvidence: {
      projectId: "development-project",
      deploymentId: "deployment",
      url: "https://development.example",
      target: "preview",
      status: "READY",
      developmentSupabaseReferencePresent: true,
      productionSupabaseReferencePresent: false,
      exactSourceRevisionVerified: true,
      sourceRevision: "expected-commit"
    },
    buildArtifacts: {
      developmentReferencePresent: true,
      productionReferencePresent: false
    },
    commands: {
      tests: { executed: true, exitCode: 0 },
      typecheck: { executed: true, exitCode: 0 },
      build: { executed: true, exitCode: 0 },
      audit: { executed: true, exitCode: 0, vulnerabilities: 0 }
    },
    rollback: {
      complete: true,
      summary: { vercel: "deployment" }
    },
    deploymentAuthorization: true
  };
}

function checkById(result, id) {
  return result.checks.find((item) => item.id === id);
}

function assertViolation(mutator, id, status) {
  const state = baseState();
  mutator(state);
  const result = evaluateReleaseState(state);
  assert.notEqual(result.overall, "PASS");
  assert.equal(checkById(result, id)?.status, status);
}

test("a complete fixture passes", () => {
  assert.equal(evaluateReleaseState(baseState()).overall, "PASS");
});

test("incorrect working directory fails closed", () => {
  assertViolation((state) => { state.git.rootMatches = false; }, "repository_root", CHECK_STATUS.FAILED);
});

test("Production Supabase in Development configuration fails closed", () => {
  assertViolation((state) => {
    state.environment.supabaseProjectRefs = [productionRef];
    state.environment.productionRefInConfiguration = true;
  }, "development_supabase", CHECK_STATUS.FAILED);
});

test("the guard scans the Supabase CLI linked-project metadata", () => {
  const runner = readFileSync(new URL("../scripts/release-guard/validate-development.mjs", import.meta.url), "utf8");
  assert.match(runner, /linked-project\.json/);
});

test("wrong Vercel project fails closed", () => {
  assertViolation((state) => { state.vercel.projectId = "production-project"; }, "vercel_project", CHECK_STATUS.FAILED);
});

test("dirty release tree fails closed", () => {
  assertViolation((state) => { state.git.dirtyEntries = [" M src/App.tsx"]; }, "working_tree", CHECK_STATUS.FAILED);
});

test("missing migration evidence blocks release", () => {
  assertViolation((state) => { state.migrationEvidence = null; }, "migration_evidence", CHECK_STATUS.BLOCKED);
});

test("missing Edge Function evidence blocks release", () => {
  assertViolation((state) => { state.edgeEvidence = null; }, "edge_functions", CHECK_STATUS.BLOCKED);
});

test("failing application test fails release", () => {
  assertViolation((state) => { state.commands.tests.exitCode = 1; }, "tests", CHECK_STATUS.FAILED);
});

test("failing build fails release", () => {
  assertViolation((state) => { state.commands.build.exitCode = 1; }, "build", CHECK_STATUS.FAILED);
});

test("missing deployment authorization blocks release", () => {
  assertViolation((state) => {
    state.mode = "release";
    state.deploymentAuthorization = false;
  }, "deployment_authorization", CHECK_STATUS.BLOCKED);
});

test("missing rollback evidence blocks release", () => {
  assertViolation((state) => {
    state.rollback.complete = false;
    state.rollback.missing = ["rollback"];
  }, "rollback", CHECK_STATUS.BLOCKED);
});
