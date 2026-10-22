import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { PostgresCanonicalLocationRepository } from "../src/businessOs/geography/PostgresCanonicalLocationRepository.ts";
import { RepositoryLocationService } from "../src/businessOs/geography/RepositoryLocationService.ts";
import { RepositoryLocationApiV1 } from "../src/businessOs/geography/RepositoryLocationApiV1.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const developmentProjectRef = "ravweavcfrpiykfgtmbf";
const activeDataset = {
  mode: "active_release",
  scopeKey: "india:odisha",
  datasetId: "b738f479-3c7b-4f8d-8e13-a9a9d11133a0",
  datasetVersion: "lgd-2026-08-27"
};

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `array[${value.map(sqlLiteral).join(", ")}]`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindForTest(statement, parameters) {
  return statement.replace(/\$(\d+)/gu, (_, index) => sqlLiteral(parameters[Number(index) - 1]));
}

/**
 * Test-only transport for the linked Development project. The repository itself
 * receives PostgreSQL placeholders and parameters; this adapter binds fixed test
 * values solely because the local Supabase CLI query command has no bind API.
 */
class DevelopmentReadOnlyExecutor {
  statements = [];

  async query(statement, parameters) {
    this.statements.push({ statement, parameters });
    assert.match(statement, /\$\d+/u, "Repository statements must retain PostgreSQL parameter placeholders.");
    const directory = mkdtempSync(resolve(tmpdir(), "voiceup-location-repository-test-"));
    const sqlPath = resolve(directory, "query.sql");
    writeFileSync(sqlPath, `${bindForTest(statement, parameters)};`, "utf8");
    let output;
    try {
      output = execFileSync(
        process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "supabase",
        process.platform === "win32"
          ? ["/d", "/s", "/c", `supabase.cmd db query --linked --file ${sqlPath}`]
          : ["db", "query", "--linked", "--file", sqlPath],
        { cwd: repositoryRoot, encoding: "utf8" }
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    const jsonStart = output.indexOf("{");
    if (jsonStart < 0) throw new Error(`Unexpected Supabase query output: ${output}`);
    return JSON.parse(output.slice(jsonStart)).rows;
  }
}

const projectRefPath = resolve(repositoryRoot, "supabase/.temp/project-ref");
const linkedDevelopmentProject =
  process.env.RUN_POSTGRES_DEVELOPMENT_INTEGRATION === "true" &&
  existsSync(projectRefPath) &&
  readFileSync(projectRefPath, "utf8").trim() === developmentProjectRef;

function developmentTest(name, fn) {
  test(name, async (context) => {
    if (!linkedDevelopmentProject) {
      context.skip("Development PostgreSQL integration is opt-in and requires the linked Development project.");
      return;
    }
    await fn(context);
  });
}
const executor = new DevelopmentReadOnlyExecutor();
const repository = new PostgresCanonicalLocationRepository(executor, {
  mode: activeDataset.mode,
  scopeKey: activeDataset.scopeKey
});
const service = new RepositoryLocationService(repository);

async function sourceGpId(executor, parentageStatus) {
  const rows = await executor.query(
    "select node_id from location.nodes where dataset_id = $1::uuid and entity_kind = $2 and parentage_status = $3 order by node_id limit $4",
    [activeDataset.datasetId, "gram_panchayat", parentageStatus, 1]
  );
  assert.equal(rows.length, 1);
  return rows[0].node_id;
}

developmentTest("Postgres repository reads the activated Odisha release and rejects the former staged selector", async () => {
  const metadata = await repository.metadata();
  assert.equal(metadata?.datasetId, activeDataset.datasetId);
  assert.equal(metadata?.datasetVersion, activeDataset.datasetVersion);
  assert.equal(metadata?.sourceDataset, "india-lgd");
  assert.equal(metadata?.authority, "LGD");
  assert.equal(metadata?.status, "active");

  const formerStagedRepository = new PostgresCanonicalLocationRepository(
    new DevelopmentReadOnlyExecutor(),
    { mode: "staged_dataset", datasetId: activeDataset.datasetId, datasetVersion: activeDataset.datasetVersion }
  );
  assert.equal(await formerStagedRepository.metadata(), null, "An active dataset cannot be selected by the controlled staged selector.");

  const wrongVersionRepository = new PostgresCanonicalLocationRepository(
    new DevelopmentReadOnlyExecutor(),
    { mode: "staged_dataset", datasetId: activeDataset.datasetId, datasetVersion: "lgd-1900-01-01" }
  );
  assert.equal(await wrongVersionRepository.metadata(), null, "A version mismatch must not select an arbitrary dataset.");
});

developmentTest("Postgres repository returns canonical Odisha, Khordha, BMC, direct parents, children, and lineage", async () => {
  const odisha = await repository.getNode("in-state-odisha");
  assert.equal(odisha?.displayName, "Odisha");

  const khordha = await repository.getByOfficialCode("362");
  assert.equal(khordha.length, 1);
  assert.equal(khordha[0].displayName, "Khordha");
  assert.equal(khordha[0].level, "district");

  const bmc = await repository.getByOfficialCode("250520");
  assert.equal(bmc.length, 1);
  assert.equal(bmc[0].entityKind, "municipal_corporation");
  const bmcParents = await repository.getParents(bmc[0].nodeId);
  assert.deepEqual(bmcParents.map((parent) => parent.officialCode), ["362"]);
  assert.equal((await repository.getChildren(bmc[0].nodeId)).filter((node) => node.level === "ward").length, 67);
  assert.deepEqual((await repository.getLineage(bmc[0].nodeId)).map((node) => node.officialCode), ["IN", "21", "362"]);
  assert.equal(await repository.isDescendantOf(bmc[0].nodeId, "in-state-odisha-district-362"), true);
  assert.equal(await repository.hasOfficialRelationship(bmc[0].nodeId, "in-state-odisha-district-362"), true);

  const khordhaChildren = await repository.getChildren(khordha[0].nodeId);
  assert.equal(khordhaChildren.filter((node) => node.entityKind === "development_block").length, 10);
  const khordhaWardRows = await executor.query(
    "select count(*)::integer as count from location.lineage lineage join location.nodes ward on ward.dataset_id = lineage.dataset_id and ward.node_id = lineage.descendant_node_id where lineage.dataset_id = $1::uuid and lineage.ancestor_node_id = $2 and ward.level = $3",
    [activeDataset.datasetId, khordha[0].nodeId, "ward"]
  );
  assert.equal(khordhaWardRows[0].count, 139);
});

developmentTest("Postgres repository resolves Balianta GP context and preserves ambiguous and unresolved GP parentage", async () => {
  const baliantaBlocks = await repository.findResolutionCandidates({ normalizedName: "balianta", expectedLevel: "block" });
  assert.equal(baliantaBlocks.length, 1);
  const baliantaGp = await service.resolve({
    normalizedName: "balianta",
    expectedLevel: "local_body",
    parentNodeId: baliantaBlocks[0].nodeId
  });
  assert.equal(baliantaGp.status, "resolved");
  assert.equal(baliantaGp.node.entityKind, "gram_panchayat");

  const ambiguousGpId = await sourceGpId(executor, "ambiguous");
  const unresolvedGpId = await sourceGpId(executor, "unresolved");
  assert.deepEqual(await repository.getParents(ambiguousGpId), []);
  assert.deepEqual(await repository.getParents(unresolvedGpId), []);
  assert.equal(await repository.hasOfficialRelationship(ambiguousGpId, baliantaBlocks[0].nodeId), false);
  assert.equal(await repository.hasOfficialRelationship(unresolvedGpId, baliantaBlocks[0].nodeId), false);
});

developmentTest("repository-backed Location API preserves invalid requests and source-only dependency boundaries", async () => {
  const api = new RepositoryLocationApiV1(service);
  const metadata = await api.handle({ operation: "metadata" });
  assert.equal(metadata.httpStatus, 200);
  assert.equal(metadata.body.datasetVersion, activeDataset.datasetVersion);

  assert.equal((await service.resolve({})).status, "invalid");

  const databaseOnlyFiles = [
    "src/businessOs/geography/PostgresCanonicalLocationRepository.ts",
    "src/businessOs/geography/RepositoryLocationService.ts",
    "src/businessOs/geography/RepositoryLocationApiV1.ts"
  ];
  for (const file of databaseOnlyFiles) {
    const source = readFileSync(resolve(repositoryRoot, file), "utf8");
    assert.doesNotMatch(source, /OdishaLgdGenerated|OdishaLgdDataset|CanonicalGeographyDataset/u);
  }
  assert.ok(executor.statements.length > 0);
  assert.ok(executor.statements.every(({ statement }) => statement.includes("location.")));
  assert.ok(executor.statements.every(({ statement }) => !statement.includes("public.") && !statement.includes("voiceup_") && !statement.includes("vboss_")));
});
