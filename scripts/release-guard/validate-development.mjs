import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { evaluateReleaseState } from "./core.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function parseArguments(values) {
  const result = { mode: "release" };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "skip-commands") result.skipCommands = true;
    else result[key] = values[index + 1], index += 1;
  }
  return result;
}

function readJson(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  if (!existsSync(filePath)) return "";
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: options.shell ?? (process.platform === "win32" && command.toLowerCase().endsWith(".cmd"))
  });
  return {
    executed: true,
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? ""
  };
}

function lastText(value, limit = 4000) {
  const text = String(value ?? "");
  return text.length <= limit ? text : text.slice(-limit);
}

function runValidationCommand(label, scriptName) {
  process.stdout.write("[release-guard] " + label + "\n");
  const result = run(npmCommand, ["run", scriptName]);
  if (result.exitCode !== 0) {
    process.stdout.write(lastText(result.stdout) + "\n" + lastText(result.stderr) + "\n");
  }
  const summary = { executed: true, exitCode: result.exitCode, error: result.error };
  if (scriptName === "test") {
    for (const [key, pattern] of Object.entries({
      tests: /(?:#|ℹ)\s*tests\s+(\d+)/,
      passed: /(?:#|ℹ)\s*pass\s+(\d+)/,
      failed: /(?:#|ℹ)\s*fail\s+(\d+)/,
      skipped: /(?:#|ℹ)\s*skipped\s+(\d+)/
    })) {
      const match = result.stdout.match(pattern);
      if (match) summary[key] = Number(match[1]);
    }
  }
  return summary;
}

function runAudit() {
  process.stdout.write("[release-guard] npm audit --omit=dev\n");
  const result = run(npmCommand, ["audit", "--omit=dev", "--json"]);
  let vulnerabilities = null;
  try {
    const payload = JSON.parse(result.stdout);
    vulnerabilities = Number(payload?.metadata?.vulnerabilities?.total);
    if (!Number.isFinite(vulnerabilities)) vulnerabilities = null;
  } catch {
    vulnerabilities = null;
  }
  if (result.exitCode !== 0 && vulnerabilities === null) {
    process.stdout.write(lastText(result.stderr || result.stdout) + "\n");
  }
  return { executed: true, exitCode: result.exitCode, vulnerabilities };
}

function gitValue(args) {
  const result = run("git", args);
  return result.exitCode === 0 ? result.stdout.trim() : "";
}

function parseEnvFile(filePath) {
  const result = {};
  if (!existsSync(filePath)) return result;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    result[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return result;
}

function configuredEnvironment(root) {
  const fileValues = {};
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    Object.assign(fileValues, parseEnvFile(join(root, name)));
  }
  const selected = {};
  for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_VOICEUP_SHOW_OTP"]) {
    selected[name] = process.env[name] ?? fileValues[name] ?? "";
  }
  const refs = [];
  const urlMatch = selected.VITE_SUPABASE_URL.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/i);
  if (urlMatch) refs.push(urlMatch[1].toLowerCase());
  const configText = [
    selected.VITE_SUPABASE_URL,
    existsSync(join(root, ".vercel", "project.json")) ? readFileSync(join(root, ".vercel", "project.json"), "utf8") : "",
    existsSync(join(root, "supabase", ".temp", "project-ref")) ? readFileSync(join(root, "supabase", ".temp", "project-ref"), "utf8") : "",
    existsSync(join(root, "supabase", ".temp", "linked-project.json"))
      ? readFileSync(join(root, "supabase", ".temp", "linked-project.json"), "utf8")
      : ""
  ].join("\n");
  return {
    supabaseProjectRefs: [...new Set(refs)],
    anonKeyConfigured: Boolean(selected.VITE_SUPABASE_ANON_KEY),
    showOtp: selected.VITE_VOICEUP_SHOW_OTP,
    configText
  };
}

function vercelProjectId(root) {
  if (process.env.VERCEL_PROJECT_ID) return process.env.VERCEL_PROJECT_ID.trim();
  const linkPath = join(root, ".vercel", "project.json");
  return readJson(linkPath)?.projectId ?? "";
}

function textFiles(root) {
  const result = [];
  if (!existsSync(root)) return result;
  for (const name of readdirSync(root)) {
    const fullPath = join(root, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) result.push(...textFiles(fullPath));
    else if (/\.(?:js|css|html|json|map)$/i.test(name)) result.push(fullPath);
  }
  return result;
}

function scanBuild(root, developmentRef, forbiddenRefs) {
  const files = textFiles(join(root, "dist"));
  let developmentReferencePresent = false;
  let productionReferencePresent = false;
  for (const filePath of files) {
    const content = readFileSync(filePath, "utf8");
    if (content.includes(developmentRef)) developmentReferencePresent = true;
    if (forbiddenRefs.some((value) => content.includes(value))) productionReferencePresent = true;
  }
  return { scannedFiles: files.length, developmentReferencePresent, productionReferencePresent };
}

function edgeHashes(root, evidence) {
  const result = {};
  for (const item of evidence?.sourceFiles ?? []) result[item.path] = sha256(join(root, item.path));
  return result;
}

function rollbackState(edgeEvidence, vercelEvidence) {
  const requiredPaths = edgeEvidence?.rollbackDirectories ?? [];
  const missing = requiredPaths.filter((item) => !existsSync(item.path)).map((item) => item.path);
  if (!vercelEvidence?.rollback?.deploymentId || !vercelEvidence?.rollback?.url) {
    missing.push("Vercel rollback deployment");
  }
  return {
    complete: missing.length === 0,
    missing,
    summary: {
      edgeRollbackDirectories: requiredPaths.map(({ functionName, version, path }) => ({ functionName, version, path })),
      vercelRollback: vercelEvidence?.rollback ?? null
    }
  };
}

const args = parseArguments(process.argv.slice(2));
const root = resolve(process.cwd());
const policyPath = resolve(args.policy ?? join(root, "release-governance", "development-policy.json"));
const edgeEvidencePath = resolve(args["edge-evidence"] ?? join(root, "release-governance", "evidence", "development-edge-functions.json"));
const migrationEvidencePath = resolve(args["migration-evidence"] ?? join(root, "release-governance", "evidence", "development-migration.json"));
const vercelEvidencePath = resolve(args["vercel-evidence"] ?? join(root, "release-governance", "evidence", "development-vercel-preview.json"));
const manifestPath = resolve(args.manifest ?? join(tmpdir(), "voiceup-development-release-manifest.json"));

const policy = readJson(policyPath);
if (!policy) {
  process.stderr.write("Release policy is missing: " + policyPath + "\n");
  process.exit(2);
}

const gitRootRaw = gitValue(["rev-parse", "--show-toplevel"]);
const gitRoot = gitRootRaw ? resolve(gitRootRaw) : "";
const packageJson = readJson(join(root, "package.json"));
const actualBranch = process.env.VOICEUP_ACTUAL_BRANCH
  || (process.env.GITHUB_ACTIONS === "true"
    ? (process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || gitValue(["branch", "--show-current"]))
    : gitValue(["branch", "--show-current"]));
const expectedBranch = args["expected-branch"] || process.env.VOICEUP_EXPECTED_BRANCH || policy.expectedRepository.branch;
const expectedCommit = args["expected-commit"] || process.env.VOICEUP_EXPECTED_COMMIT || policy.expectedRepository.baselineCommit;
const dirtyEntries = gitValue(["status", "--porcelain=v1", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
const environment = configuredEnvironment(root);
environment.productionRefInConfiguration = policy.production.forbiddenSupabaseRefs.some((value) => environment.configText.includes(value));

let commands;
if (args.skipCommands) {
  commands = {
    tests: { executed: false },
    typecheck: { executed: false },
    build: { executed: false },
    audit: { executed: false }
  };
} else {
  commands = {
    tests: runValidationCommand("application tests", "test"),
    typecheck: runValidationCommand("TypeScript", "typecheck"),
    build: runValidationCommand("production build", "build"),
    audit: runAudit()
  };
}

const edgeEvidence = readJson(edgeEvidencePath);
const migrationEvidence = readJson(migrationEvidencePath);
const vercelEvidence = readJson(vercelEvidencePath);
const requiredMigration = policy.requiredMigrations[0];
const buildArtifacts = scanBuild(root, policy.development.supabaseProjectRef, policy.production.forbiddenSupabaseRefs);
const rollback = rollbackState(edgeEvidence, vercelEvidence);

const input = {
  mode: args.mode,
  policy,
  git: {
    root,
    rootMatches: Boolean(gitRoot) && realpathSync(gitRoot).toLowerCase() === realpathSync(root).toLowerCase()
      && packageJson?.name === policy.expectedRepository.packageName,
    packageName: packageJson?.name ?? "",
    remote: gitValue(["remote", "get-url", "origin"]),
    branch: actualBranch,
    expectedBranch,
    commit: gitValue(["rev-parse", "HEAD"]),
    expectedCommit,
    dirtyEntries
  },
  environment: {
    supabaseProjectRefs: environment.supabaseProjectRefs,
    productionRefInConfiguration: environment.productionRefInConfiguration,
    anonKeyConfigured: environment.anonKeyConfigured,
    showOtp: environment.showOtp
  },
  vercel: { projectId: vercelProjectId(root) },
  migrationEvidence,
  localMigrationSha256: sha256(join(root, requiredMigration.path)),
  edgeEvidence,
  edgeSourceHashes: edgeHashes(root, edgeEvidence),
  vercelEvidence,
  buildArtifacts,
  commands,
  rollback,
  deploymentAuthorization: process.env.VOICEUP_DEPLOYMENT_AUTHORIZED === "true"
};

const evaluation = evaluateReleaseState(input);
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: args.mode,
  canonicalRoot: root,
  git: {
    remote: input.git.remote,
    branch: input.git.branch,
    commit: input.git.commit,
    expectedBranch: input.git.expectedBranch,
    expectedCommit: input.git.expectedCommit,
    dirty: input.git.dirtyEntries.length > 0,
    dirtyEntryCount: input.git.dirtyEntries.length
  },
  environmentIdentity: {
    developmentSupabaseProjectRef: policy.development.supabaseProjectRef,
    configuredSupabaseProjectRefs: input.environment.supabaseProjectRefs,
    anonKeyConfigured: input.environment.anonKeyConfigured,
    showOtp: input.environment.showOtp === "true",
    vercelProjectId: input.vercel.projectId
  },
  migrationVerification: {
    localPath: requiredMigration.path,
    localSha256: input.localMigrationSha256,
    evidence: migrationEvidence
  },
  edgeFunctionVerification: edgeEvidence,
  vercelPreviewVerification: vercelEvidence,
  testResults: commands.tests,
  typecheckResults: commands.typecheck,
  buildResults: { ...commands.build, ...buildArtifacts },
  securityAudit: commands.audit,
  rollback: rollback.summary,
  status: evaluation.overall,
  checks: evaluation.checks
};

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
process.stdout.write("[release-guard] manifest: " + manifestPath + "\n");
for (const item of evaluation.checks) {
  process.stdout.write("[" + item.status + "] " + item.id + ": " + item.summary + "\n");
}
process.stdout.write("[release-guard] overall: " + evaluation.overall + "\n");
process.exit(evaluation.overall === "PASS" ? 0 : 1);
