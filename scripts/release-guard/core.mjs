export const CHECK_STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  UNKNOWN: "UNKNOWN",
  NOT_YET_ENFORCED: "NOT_YET_ENFORCED"
});

function check(id, status, summary, evidence = {}, required = true) {
  return { id, status, summary, evidence, required };
}

function normalizedRemote(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

function commandCheck(id, label, commandResult) {
  if (!commandResult || commandResult.executed !== true) {
    return check(id, CHECK_STATUS.BLOCKED, label + " was not executed.", commandResult ?? {});
  }
  if (commandResult.exitCode !== 0) {
    return check(id, CHECK_STATUS.FAILED, label + " failed.", commandResult);
  }
  return check(id, CHECK_STATUS.VERIFIED, label + " passed.", commandResult);
}

export function evaluateReleaseState(input) {
  const checks = [];
  const policy = input.policy;
  const expected = policy.expectedRepository;
  const development = policy.development;

  checks.push(input.git?.rootMatches
    ? check("repository_root", CHECK_STATUS.VERIFIED, "The command is running at the Git repository root.", {
        root: input.git.root,
        packageName: input.git.packageName
      })
    : check("repository_root", CHECK_STATUS.FAILED, "The command is not running at the expected repository root.", {
        root: input.git?.root ?? "",
        packageName: input.git?.packageName ?? ""
      }));

  const remoteMatches = normalizedRemote(input.git?.remote) === normalizedRemote(expected.remote);
  checks.push(remoteMatches
    ? check("repository_remote", CHECK_STATUS.VERIFIED, "Git remote identity matches policy.", { remote: expected.remote })
    : check("repository_remote", CHECK_STATUS.FAILED, "Git remote identity does not match policy.", {
        expected: expected.remote,
        actual: input.git?.remote ?? ""
      }));

  if (!input.git?.expectedBranch) {
    checks.push(check("branch", CHECK_STATUS.BLOCKED, "No expected branch was supplied.", {
      actual: input.git?.branch ?? ""
    }));
  } else {
    checks.push(input.git.branch === input.git.expectedBranch
      ? check("branch", CHECK_STATUS.VERIFIED, "Branch matches the explicit release expectation.", {
          branch: input.git.branch
        })
      : check("branch", CHECK_STATUS.FAILED, "Branch does not match the explicit release expectation.", {
          expected: input.git.expectedBranch,
          actual: input.git.branch
        }));
  }

  if (!input.git?.expectedCommit) {
    checks.push(check("commit", CHECK_STATUS.BLOCKED, "No expected commit was supplied.", {
      actual: input.git?.commit ?? ""
    }));
  } else {
    checks.push(input.git.commit === input.git.expectedCommit
      ? check("commit", CHECK_STATUS.VERIFIED, "HEAD matches the explicit release commit.", {
          commit: input.git.commit
        })
      : check("commit", CHECK_STATUS.FAILED, "HEAD does not match the explicit release commit.", {
          expected: input.git.expectedCommit,
          actual: input.git.commit
        }));
  }

  checks.push((input.git?.dirtyEntries?.length ?? 0) === 0
    ? check("working_tree", CHECK_STATUS.VERIFIED, "Working tree is clean, including untracked files.")
    : check("working_tree", CHECK_STATUS.FAILED, "Working tree contains committed-file changes or untracked files.", {
        dirtyEntryCount: input.git.dirtyEntries.length,
        sample: input.git.dirtyEntries.slice(0, 25)
      }));

  const configuredRefs = input.environment?.supabaseProjectRefs ?? [];
  const productionRefPresent = configuredRefs.some((value) => policy.production.forbiddenSupabaseRefs.includes(value))
    || input.environment?.productionRefInConfiguration === true;
  if (productionRefPresent) {
    checks.push(check("development_supabase", CHECK_STATUS.FAILED,
      "Production Supabase identity was found in Development configuration.", {
        expected: development.supabaseProjectRef,
        discoveredRefs: configuredRefs
      }));
  } else if (!configuredRefs.length) {
    checks.push(check("development_supabase", CHECK_STATUS.BLOCKED,
      "Development Supabase identity could not be established from runtime configuration.", {
        expected: development.supabaseProjectRef
      }));
  } else if (configuredRefs.every((value) => value === development.supabaseProjectRef)) {
    checks.push(check("development_supabase", CHECK_STATUS.VERIFIED,
      "Runtime configuration targets only the Development Supabase project.", {
        projectRef: development.supabaseProjectRef
      }));
  } else {
    checks.push(check("development_supabase", CHECK_STATUS.FAILED,
      "Unexpected Supabase project identity was found in Development configuration.", {
        expected: development.supabaseProjectRef,
        discoveredRefs: configuredRefs
      }));
  }

  checks.push(input.environment?.anonKeyConfigured === true
    ? check("development_anon_key", CHECK_STATUS.VERIFIED,
        "A Development anon-key variable is configured; its value was not recorded.")
    : check("development_anon_key", CHECK_STATUS.BLOCKED,
        "VITE_SUPABASE_ANON_KEY is not configured for validation."));

  checks.push(input.environment?.showOtp === "true"
    ? check("screen_verification_flag", CHECK_STATUS.VERIFIED,
        "VITE_VOICEUP_SHOW_OTP is exactly true.")
    : check("screen_verification_flag", CHECK_STATUS.FAILED,
        "VITE_VOICEUP_SHOW_OTP is not exactly true.", {
          configured: input.environment?.showOtp ? "set-to-unexpected-value" : "missing"
        }));

  if (!input.vercel?.projectId) {
    checks.push(check("vercel_project", CHECK_STATUS.BLOCKED,
      "Vercel Development project identity is missing.", {
        expected: development.vercelProjectId
      }));
  } else {
    checks.push(input.vercel.projectId === development.vercelProjectId
      ? check("vercel_project", CHECK_STATUS.VERIFIED,
          "Vercel project identity matches Development.", {
            projectId: development.vercelProjectId,
            projectName: development.vercelProjectName
          })
      : check("vercel_project", CHECK_STATUS.FAILED,
          "Vercel project identity does not match Development.", {
            expected: development.vercelProjectId,
            actual: input.vercel.projectId
          }));
  }

  const migration = input.migrationEvidence;
  const requiredMigration = policy.requiredMigrations[0];
  const migrationMatches = migration
    && migration.projectRef === development.supabaseProjectRef
    && migration.path === requiredMigration.path
    && migration.sha256 === requiredMigration.sha256;
  checks.push(migrationMatches && migration.authoritativeRemoteHistoryVerified === true
    ? check("migration_evidence", CHECK_STATUS.VERIFIED,
        "Required migration has authoritative remote-history evidence.", {
          path: migration.path,
          sha256: migration.sha256,
          method: migration.method
        })
    : check("migration_evidence", CHECK_STATUS.BLOCKED,
        "Required migration lacks authoritative remote-history evidence.", {
          path: requiredMigration.path,
          localSha256: input.localMigrationSha256 ?? "",
          evidencePresent: Boolean(migration),
          manualApplicationReported: migration?.manualApplicationReported === true,
          authoritativeRemoteHistoryVerified: migration?.authoritativeRemoteHistoryVerified === true,
          reason: migration?.reason ?? "evidence-missing"
        }));

  const edgeEvidence = input.edgeEvidence;
  const edgeFailures = [];
  if (!edgeEvidence || edgeEvidence.projectRef !== development.supabaseProjectRef) {
    edgeFailures.push("Development Edge Function evidence is missing or targets another project.");
  } else {
    for (const requiredFunction of policy.requiredEdgeFunctions) {
      const actual = edgeEvidence.functions?.find((item) => item.name === requiredFunction.name);
      if (!actual) {
        edgeFailures.push(requiredFunction.name + ": evidence missing");
        continue;
      }
      if (actual.status !== "ACTIVE") edgeFailures.push(requiredFunction.name + ": not ACTIVE");
      if (actual.verifyJwt !== true) edgeFailures.push(requiredFunction.name + ": JWT verification disabled");
      if (actual.bundleSha256 !== requiredFunction.bundleSha256) {
        edgeFailures.push(requiredFunction.name + ": bundle hash mismatch");
      }
    }
    for (const sourceFile of edgeEvidence.sourceFiles ?? []) {
      const actualHash = input.edgeSourceHashes?.[sourceFile.path];
      if (!actualHash) edgeFailures.push(sourceFile.path + ": local source missing");
      else if (actualHash !== sourceFile.sha256) edgeFailures.push(sourceFile.path + ": source hash mismatch");
    }
  }
  checks.push(edgeFailures.length === 0
    ? check("edge_functions", CHECK_STATUS.VERIFIED,
        "Required Development Edge Functions and downloaded source evidence match exactly.", {
          capturedAt: edgeEvidence.capturedAt,
          functions: edgeEvidence.functions.map(({ name, version, status, verifyJwt, bundleSha256 }) => ({
            name, version, status, verifyJwt, bundleSha256
          })),
          verifiedSourceFiles: edgeEvidence.sourceFiles.length
        })
    : check("edge_functions", CHECK_STATUS.BLOCKED,
        "Development Edge Function synchronization is incomplete or mismatched.", { failures: edgeFailures }));

  const vercelEvidence = input.vercelEvidence;
  const vercelEvidenceBaseValid = vercelEvidence
    && vercelEvidence.projectId === development.vercelProjectId
    && vercelEvidence.target === "preview"
    && vercelEvidence.status === "READY"
    && vercelEvidence.developmentSupabaseReferencePresent === true
    && vercelEvidence.productionSupabaseReferencePresent === false;
  checks.push(vercelEvidenceBaseValid && vercelEvidence.exactSourceRevisionVerified === true
    ? check("vercel_preview_source", CHECK_STATUS.VERIFIED,
        "READY Preview is tied to the exact source revision.", {
          deploymentId: vercelEvidence.deploymentId,
          url: vercelEvidence.url,
          sourceRevision: vercelEvidence.sourceRevision
        })
    : check("vercel_preview_source", CHECK_STATUS.BLOCKED,
        "Preview target is healthy but its exact source revision is not provable.", {
          deploymentId: vercelEvidence?.deploymentId ?? "",
          url: vercelEvidence?.url ?? "",
          baseMetadataValid: Boolean(vercelEvidenceBaseValid),
          exactSourceRevisionVerified: vercelEvidence?.exactSourceRevisionVerified === true
        }));

  checks.push(input.buildArtifacts?.productionReferencePresent === true
    ? check("build_target", CHECK_STATUS.FAILED,
        "Production Supabase identity was found in browser build artifacts.")
    : input.buildArtifacts?.developmentReferencePresent === true
      ? check("build_target", CHECK_STATUS.VERIFIED,
          "Browser build artifacts contain Development Supabase identity and exclude Production.")
      : check("build_target", CHECK_STATUS.BLOCKED,
          "Browser build artifacts do not prove the Development Supabase target."));

  checks.push(commandCheck("tests", "Application tests", input.commands?.tests));
  checks.push(commandCheck("typecheck", "TypeScript checking", input.commands?.typecheck));
  checks.push(commandCheck("build", "Production build", input.commands?.build));

  if (!input.commands?.audit?.executed) {
    checks.push(check("security_audit", CHECK_STATUS.BLOCKED, "npm audit was not executed."));
  } else if (input.commands.audit.exitCode !== 0 || input.commands.audit.vulnerabilities === null) {
    checks.push(check("security_audit", CHECK_STATUS.FAILED, "npm audit did not complete cleanly.", input.commands.audit));
  } else if (input.commands.audit.vulnerabilities > 0) {
    checks.push(check("security_audit", CHECK_STATUS.FAILED, "npm audit reported vulnerabilities.", input.commands.audit));
  } else {
    checks.push(check("security_audit", CHECK_STATUS.VERIFIED, "npm audit reported zero vulnerabilities.", input.commands.audit));
  }

  checks.push(input.rollback?.complete === true
    ? check("rollback", CHECK_STATUS.VERIFIED, "Rollback evidence is present.", input.rollback.summary)
    : check("rollback", CHECK_STATUS.BLOCKED, "Rollback evidence is missing or incomplete.", {
        missing: input.rollback?.missing ?? ["rollback-evidence"]
      }));

  const deploymentAuthorizationRequired = ["release", "production"].includes(input.mode);
  if (!deploymentAuthorizationRequired) {
    checks.push(check("deployment_authorization", CHECK_STATUS.NOT_YET_ENFORCED,
      "Deployment authorization is intentionally outside pull-request validation.", {}, false));
  } else {
    checks.push(input.deploymentAuthorization === true
      ? check("deployment_authorization", CHECK_STATUS.VERIFIED, "Explicit deployment authorization is present.")
      : check("deployment_authorization", CHECK_STATUS.BLOCKED, "Explicit deployment authorization is absent."));
  }

  const requiredChecks = checks.filter((item) => item.required);
  const hasFailure = requiredChecks.some((item) => item.status === CHECK_STATUS.FAILED);
  const hasBlocker = requiredChecks.some((item) => [CHECK_STATUS.BLOCKED, CHECK_STATUS.UNKNOWN].includes(item.status));
  const overall = hasFailure ? "FAIL" : hasBlocker ? "BLOCKED" : "PASS";
  return { overall, checks };
}
