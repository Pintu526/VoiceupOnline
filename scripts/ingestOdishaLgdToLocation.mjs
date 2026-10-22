import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedProjectRef = "ravweavcfrpiykfgtmbf";
const expectedProjectName = "VoiceUp Development";
const datasetId = "b738f479-3c7b-4f8d-8e13-a9a9d11133a0";
const sourceArtifactId = "a4a2f6de-59c7-4c64-a5a5-77b47fdf6ba4";
const sourceDataset = "india-lgd";
const datasetVersion = "lgd-2026-08-27";
const authority = "LGD";
const batchSize = 1000;
const generatedDatasetPath = join(repositoryRoot, "src", "businessOs", "geography", "OdishaLgdGenerated.ts");
const sourceArchivePath = join(repositoryRoot, "data", "lgd-2026-08-27", "LGD-Odisha-National-2026-08-27.zip");
const relativeGeneratedPath = "src/businessOs/geography/OdishaLgdGenerated.ts";
const relativeArchivePath = "data/lgd-2026-08-27/LGD-Odisha-National-2026-08-27.zip";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sql(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sql(JSON.stringify(value ?? {}))}::jsonb`;
}

function chunks(values, size) {
  const result = [];
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size));
  return result;
}

function requireDevelopmentTarget() {
  const refPath = join(repositoryRoot, "supabase", ".temp", "project-ref");
  const linkedPath = join(repositoryRoot, "supabase", ".temp", "linked-project.json");
  if (!existsSync(refPath) || !existsSync(linkedPath)) {
    throw new Error("Supabase linked-project metadata is unavailable; refusing to run.");
  }
  const ref = readFileSync(refPath, "utf8").trim();
  const linked = JSON.parse(readFileSync(linkedPath, "utf8"));
  if (ref !== expectedProjectRef || linked.ref !== expectedProjectRef || linked.name !== expectedProjectName) {
    throw new Error(`Refusing to run against non-Development project '${ref}' / '${linked.name ?? "unknown"}'.`);
  }
}

function runSql(sqlText, label, tempDirectory) {
  const sqlPath = join(tempDirectory, `${label}.sql`);
  writeFileSync(sqlPath, sqlText, "utf8");
  try {
    return execFileSync(
      process.platform === "win32" ? "supabase.cmd" : "supabase",
      ["db", "query", "--linked", "--file", sqlPath],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 16 * 1024 * 1024,
        shell: process.platform === "win32"
      }
    );
  } catch (error) {
    const stdout = error?.stdout?.toString() ?? "";
    const stderr = error?.stderr?.toString() ?? "";
    throw new Error(`${label} failed. SQL evidence retained at ${sqlPath}\n${stdout}\n${stderr}`.trim());
  }
}

function stagedRowCount(table, tempDirectory, label) {
  const output = runSql(
    `select count(*)::integer as row_count from location.${table} where dataset_id = ${sql(datasetId)}::uuid;`,
    label,
    tempDirectory
  );
  const match = output.match(/"row_count":\s*(\d+)/u);
  if (!match) throw new Error(`Could not read staged ${table} row count.`);
  return Number(match[1]);
}

function resumableBatchStart(existingCount, expectedCount, totalBatches) {
  if (existingCount > expectedCount) throw new Error(`Staged row count ${existingCount} exceeds expected ${expectedCount}.`);
  if (existingCount === expectedCount) return totalBatches;
  return existingCount % batchSize === 0 ? existingCount / batchSize : 0;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
}

function parentageStatus(node) {
  if (node.kind !== "gram_panchayat") return "not_applicable";
  const status = node.metadata?.blockRelationshipStatus;
  if (status === "supported" || status === "ambiguous" || status === "unresolved") return status;
  throw new Error(`Gram Panchayat ${node.id} has no recognized blockRelationshipStatus.`);
}

function relationshipType(node) {
  return node.metadata?.blockRelationshipStatus === "district_containment"
    ? "official_containment"
    : "administrative_parent";
}

function validateInput(dataset) {
  const levelCounts = Object.fromEntries(dataset.nodes.map((node) => node.level).reduce((counts, level) => {
    counts.set(level, (counts.get(level) ?? 0) + 1);
    return counts;
  }, new Map()));
  const expectedLevels = {
    country: 1,
    state: 1,
    district: 30,
    block: 314,
    local_body: 7253,
    village: 51800,
    ward: 2119
  };
  if (dataset.nodes.length !== 61518 || JSON.stringify(levelCounts) !== JSON.stringify(expectedLevels)) {
    throw new Error(`Unexpected canonical counts: ${JSON.stringify({ total: dataset.nodes.length, levelCounts })}`);
  }
  const ids = new Set();
  const nodesById = new Map();
  for (const node of dataset.nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate canonical nodeId '${node.id}'.`);
    ids.add(node.id);
    nodesById.set(node.id, node);
    if (!node.code) throw new Error(`Official code is missing for '${node.id}'.`);
    if (node.parentId && (!nodesById.has(node.parentId) && !dataset.nodes.some((candidate) => candidate.id === node.parentId))) {
      throw new Error(`Missing explicit parent '${node.parentId}' for '${node.id}'.`);
    }
    if (node.parentId === node.id) throw new Error(`Self parent relationship '${node.id}'.`);
  }
  const gpStatusCounts = dataset.nodes
    .filter((node) => node.kind === "gram_panchayat")
    .reduce((counts, node) => {
      const status = parentageStatus(node);
      counts.set(status, (counts.get(status) ?? 0) + 1);
      if ((status === "ambiguous" || status === "unresolved") && node.parentId) {
        throw new Error(`Unsupported GP '${node.id}' unexpectedly has a parent.`);
      }
      return counts;
    }, new Map());
  for (const [status, expected] of Object.entries({ supported: 6736, ambiguous: 47, unresolved: 11 })) {
    if (gpStatusCounts.get(status) !== expected) throw new Error(`Expected ${expected} ${status} GPs.`);
  }
  const relationshipCount = dataset.nodes.filter((node) => node.parentId).length;
  if (relationshipCount !== 61429) throw new Error(`Expected 61,429 explicit relationships, received ${relationshipCount}.`);
  return { expectedLevels, relationshipCount };
}

function nodeRows(nodes, generatedChecksum) {
  return nodes.map((node) => {
    const sourceMetadata = {
      authority,
      sourceDataset,
      sourceDatasetVersion: datasetVersion,
      sourceId: node.sourceId,
      countryCode: node.countryCode,
      generatedArtifact: relativeGeneratedPath,
      generatedArtifactSha256: generatedChecksum,
      metadata: node.metadata ?? {}
    };
    return `(${sql(datasetId)}, ${sql(node.id)}, ${sql(node.code ?? null)}, ${sql(node.level)}, ${sql(node.kind)}, ${sql(node.name)}, ${sql(normalize(node.name))}, ${sqlJson(sourceMetadata)}, ${sql(parentageStatus(node))}, ${sql(node.active !== false)})`;
  });
}

function relationshipRows(nodes, archiveChecksum) {
  return nodes.filter((node) => node.parentId).map((node) => {
    const evidence = {
      authority,
      sourceDataset,
      sourceDatasetVersion: datasetVersion,
      sourceArtifact: relativeArchivePath,
      sourceArtifactSha256: archiveChecksum,
      childNodeId: node.id,
      parentNodeId: node.parentId,
      relationshipType: relationshipType(node),
      sourceMetadata: node.metadata ?? {}
    };
    return `(${sql(datasetId)}, ${sql(node.id)}, ${sql(node.parentId)}, ${sql(relationshipType(node))}, ${sql(sourceArtifactId)}, ${sqlJson(evidence)})`;
  });
}

function setupSql(generatedChecksum, archiveChecksum) {
  const provenance = {
    authority,
    sourceDataset,
    sourceDatasetVersion: datasetVersion,
    sourceArchive: relativeArchivePath,
    sourceArchiveSha256: archiveChecksum,
    canonicalArtifact: relativeGeneratedPath,
    canonicalArtifactSha256: generatedChecksum,
    generatedAt: "2026-08-27"
  };
  return `begin;
do $$
begin
  if exists (
    select 1 from location.datasets
    where authority = ${sql(authority)} and source_dataset = ${sql(sourceDataset)} and dataset_version = ${sql(datasetVersion)}
      and (id <> ${sql(datasetId)}::uuid or checksum <> ${sql(generatedChecksum)} or status <> 'staged')
  ) then
    raise exception 'Existing LGD Odisha dataset does not match the staged ingestion identity.';
  end if;
  if exists (
    select 1 from location.dataset_releases release
    join location.datasets dataset on dataset.id = release.dataset_id
    where dataset.authority = ${sql(authority)} and dataset.source_dataset = ${sql(sourceDataset)} and dataset.dataset_version = ${sql(datasetVersion)}
      and release.is_active
  ) then
    raise exception 'Refusing to ingest an active dataset release.';
  end if;
end $$;

insert into location.datasets (
  id, authority, source_dataset, dataset_version, effective_date, checksum_algorithm, checksum, status, provenance
) values (
  ${sql(datasetId)}::uuid, ${sql(authority)}, ${sql(sourceDataset)}, ${sql(datasetVersion)}, date '2026-08-27', 'sha256', ${sql(generatedChecksum)}, 'staged', ${sqlJson(provenance)}
) on conflict (authority, source_dataset, dataset_version) do nothing;

insert into location.source_artifacts (
  id, dataset_id, source_uri, filename, checksum_algorithm, checksum, retrieved_at, provenance
) values (
  ${sql(sourceArtifactId)}::uuid, ${sql(datasetId)}::uuid, ${sql(`repo://${relativeArchivePath}`)}, ${sql(basename(sourceArchivePath))}, 'sha256', ${sql(archiveChecksum)}, timestamptz '2026-08-27T00:00:00Z', ${sqlJson(provenance)}
) on conflict (dataset_id, checksum) do nothing;

do $$
begin
  if not exists (select 1 from location.datasets where id = ${sql(datasetId)}::uuid and status = 'staged') then
    raise exception 'Staged dataset identity was not created.';
  end if;
  if not exists (select 1 from location.source_artifacts where id = ${sql(sourceArtifactId)}::uuid and dataset_id = ${sql(datasetId)}::uuid and checksum = ${sql(archiveChecksum)}) then
    raise exception 'Source artifact identity was not created.';
  end if;
end $$;
commit;`;
}

function lineageSql() {
  return `with recursive derived_lineage as (
  select dataset_id, child_node_id as descendant_node_id, parent_node_id as ancestor_node_id, 1::smallint as depth
  from location.relationships
  where dataset_id = ${sql(datasetId)}::uuid
  union all
  select derived.dataset_id, derived.descendant_node_id, relationship.parent_node_id, (derived.depth + 1)::smallint
  from derived_lineage derived
  join location.relationships relationship
    on relationship.dataset_id = derived.dataset_id
   and relationship.child_node_id = derived.ancestor_node_id
  where derived.depth < 16
)
insert into location.lineage (dataset_id, descendant_node_id, ancestor_node_id, depth)
select dataset_id, descendant_node_id, ancestor_node_id, depth
from derived_lineage
on conflict (dataset_id, descendant_node_id, ancestor_node_id) do nothing;`;
}

function validationSql(expectedLevels, relationshipCount) {
  const countCheck = Object.entries(expectedLevels).map(([level, count]) => `
  if (select count(*) from location.nodes where dataset_id = ${sql(datasetId)}::uuid and level = ${sql(level)}) <> ${count} then
    raise exception 'Unexpected ${level} count.';
  end if;`).join("");
  return `do $$
declare lineage_mismatch_count integer;
begin
  if (select count(*) from location.nodes where dataset_id = ${sql(datasetId)}::uuid) <> 61518 then
    raise exception 'Unexpected total canonical node count.';
  end if;${countCheck}
  if (select count(*) from location.relationships where dataset_id = ${sql(datasetId)}::uuid) <> ${relationshipCount} then
    raise exception 'Unexpected explicit relationship count.';
  end if;
  if (select count(*) from location.nodes where dataset_id = ${sql(datasetId)}::uuid and entity_kind = 'gram_panchayat' and parentage_status = 'supported' and exists (select 1 from location.relationships relationship where relationship.dataset_id = ${sql(datasetId)}::uuid and relationship.child_node_id = nodes.node_id)) <> 6736 then
    raise exception 'Supported GP relationship count is invalid.';
  end if;
  if (select count(*) from location.nodes where dataset_id = ${sql(datasetId)}::uuid and entity_kind = 'gram_panchayat' and parentage_status = 'ambiguous' and not exists (select 1 from location.relationships relationship where relationship.dataset_id = ${sql(datasetId)}::uuid and relationship.child_node_id = nodes.node_id)) <> 47 then
    raise exception 'Ambiguous GP handling is invalid.';
  end if;
  if (select count(*) from location.nodes where dataset_id = ${sql(datasetId)}::uuid and entity_kind = 'gram_panchayat' and parentage_status = 'unresolved' and not exists (select 1 from location.relationships relationship where relationship.dataset_id = ${sql(datasetId)}::uuid and relationship.child_node_id = nodes.node_id)) <> 11 then
    raise exception 'Unresolved GP handling is invalid.';
  end if;
  if (select count(*) from location.nodes where dataset_id = ${sql(datasetId)}::uuid and official_code is null) <> 0 then
    raise exception 'Official code preservation is invalid.';
  end if;
  if (select count(*) from location.relationships relationship where relationship.dataset_id = ${sql(datasetId)}::uuid and relationship.child_node_id = relationship.parent_node_id) <> 0 then
    raise exception 'Self relationship detected.';
  end if;
  if exists (
    select 1 from location.relationships relationship
    left join location.nodes child on child.dataset_id = relationship.dataset_id and child.node_id = relationship.child_node_id
    left join location.nodes parent on parent.dataset_id = relationship.dataset_id and parent.node_id = relationship.parent_node_id
    where relationship.dataset_id = ${sql(datasetId)}::uuid and (child.node_id is null or parent.node_id is null)
  ) then
    raise exception 'Invalid relationship foreign key detected.';
  end if;
  if (select count(*) from location.nodes node where node.dataset_id = ${sql(datasetId)}::uuid and node.official_code = '250520' and node.entity_kind = 'municipal_corporation' and node.display_name = 'Bhubaneswar') <> 1 then
    raise exception 'BMC identity is invalid.';
  end if;
  if (select count(*) from location.relationships relationship join location.nodes ward on ward.dataset_id = relationship.dataset_id and ward.node_id = relationship.child_node_id where relationship.dataset_id = ${sql(datasetId)}::uuid and relationship.parent_node_id = 'in-state-odisha-ulb-250520' and ward.level = 'ward') <> 67 then
    raise exception 'BMC ward relationship count is invalid.';
  end if;
  if (select count(*) from location.nodes node where node.dataset_id = ${sql(datasetId)}::uuid and node.level = 'district' and node.official_code = '362' and node.display_name = 'Khordha') <> 1 then
    raise exception 'Khordha district identity is invalid.';
  end if;
  if (select count(*) from location.relationships relationship join location.nodes block on block.dataset_id = relationship.dataset_id and block.node_id = relationship.child_node_id where relationship.dataset_id = ${sql(datasetId)}::uuid and relationship.parent_node_id = 'in-state-odisha-district-362' and block.entity_kind = 'development_block') <> 10 then
    raise exception 'Khordha block count is invalid.';
  end if;
  if (select count(*) from location.lineage lineage join location.nodes ward on ward.dataset_id = lineage.dataset_id and ward.node_id = lineage.descendant_node_id where lineage.dataset_id = ${sql(datasetId)}::uuid and lineage.ancestor_node_id = 'in-state-odisha-district-362' and ward.level = 'ward') <> 139 then
    raise exception 'Khordha urban ward count is invalid.';
  end if;
  with recursive expected_lineage as (
    select dataset_id, child_node_id as descendant_node_id, parent_node_id as ancestor_node_id, 1::smallint as depth
    from location.relationships where dataset_id = ${sql(datasetId)}::uuid
    union all
    select expected.dataset_id, expected.descendant_node_id, relationship.parent_node_id, (expected.depth + 1)::smallint
    from expected_lineage expected
    join location.relationships relationship on relationship.dataset_id = expected.dataset_id and relationship.child_node_id = expected.ancestor_node_id
    where expected.depth < 16
  ), mismatch as (
    (select descendant_node_id, ancestor_node_id, depth from location.lineage where dataset_id = ${sql(datasetId)}::uuid
      except select descendant_node_id, ancestor_node_id, depth from expected_lineage)
    union all
    (select descendant_node_id, ancestor_node_id, depth from expected_lineage
      except select descendant_node_id, ancestor_node_id, depth from location.lineage where dataset_id = ${sql(datasetId)}::uuid)
  ) select count(*) into lineage_mismatch_count from mismatch;
  if lineage_mismatch_count <> 0 then raise exception 'Lineage is not derived exclusively from explicit relationships.'; end if;
  if (select status from location.datasets where id = ${sql(datasetId)}::uuid) <> 'staged' then raise exception 'Dataset is not staged.'; end if;
  if exists (select 1 from location.dataset_releases where dataset_id = ${sql(datasetId)}::uuid and is_active) then raise exception 'Dataset must not have an active release.'; end if;
end $$;

select jsonb_build_object(
  'datasetId', ${sql(datasetId)},
  'datasetStatus', (select status from location.datasets where id = ${sql(datasetId)}::uuid),
  'datasetVersion', (select dataset_version from location.datasets where id = ${sql(datasetId)}::uuid),
  'authority', (select authority from location.datasets where id = ${sql(datasetId)}::uuid),
  'sourceDataset', (select source_dataset from location.datasets where id = ${sql(datasetId)}::uuid),
  'nodeCounts', (select jsonb_object_agg(level, count) from (select level, count(*) as count from location.nodes where dataset_id = ${sql(datasetId)}::uuid group by level) counts),
  'relationships', (select count(*) from location.relationships where dataset_id = ${sql(datasetId)}::uuid),
  'lineage', (select count(*) from location.lineage where dataset_id = ${sql(datasetId)}::uuid),
  'gpParentage', (select jsonb_object_agg(parentage_status, count) from (select parentage_status, count(*) as count from location.nodes where dataset_id = ${sql(datasetId)}::uuid and entity_kind = 'gram_panchayat' group by parentage_status) statuses),
  'activeReleases', (select count(*) from location.dataset_releases where dataset_id = ${sql(datasetId)}::uuid and is_active)
) as validation;`;
}

async function main() {
  requireDevelopmentTarget();
  if (!existsSync(generatedDatasetPath) || !existsSync(sourceArchivePath)) {
    throw new Error("Required LGD source artifact is missing; refusing to ingest.");
  }
  const [{ odishaLgdDataset }] = await Promise.all([
    import("../src/businessOs/geography/OdishaLgdGenerated.ts")
  ]);
  if (odishaLgdDataset.datasetVersion !== datasetVersion || odishaLgdDataset.source?.id !== sourceDataset) {
    throw new Error("Generated dataset provenance does not match the approved Odisha LGD source.");
  }
  const { expectedLevels, relationshipCount } = validateInput(odishaLgdDataset);
  const generatedChecksum = sha256(generatedDatasetPath);
  const archiveChecksum = sha256(sourceArchivePath);
  const tempDirectory = join(tmpdir(), `voiceup-location-ingestion-${randomUUID()}`);
  mkdirSync(tempDirectory, { recursive: true });
  let completed = false;
  try {
    console.log(`Target verified: ${expectedProjectName} (${expectedProjectRef})`);
    console.log(`Canonical artifact: ${relativeGeneratedPath} sha256=${generatedChecksum}`);
    console.log(`Official source archive: ${relativeArchivePath} sha256=${archiveChecksum}`);
    runSql(setupSql(generatedChecksum, archiveChecksum), "000-setup", tempDirectory);

    const nodeBatches = chunks(nodeRows(odishaLgdDataset.nodes, generatedChecksum), batchSize);
    const existingNodes = stagedRowCount("nodes", tempDirectory, "050-node-count");
    const nodeStart = resumableBatchStart(existingNodes, odishaLgdDataset.nodes.length, nodeBatches.length);
    if (nodeStart > 0) console.log(`Resuming after ${existingNodes} existing staged nodes.`);
    for (let index = nodeStart; index < nodeBatches.length; index += 1) {
      const batch = nodeBatches[index];
      runSql(`insert into location.nodes (dataset_id, node_id, official_code, level, entity_kind, display_name, display_name_normalized, source_metadata, parentage_status, active) values\n${batch.join(",\n")}\non conflict (dataset_id, node_id) do nothing;`, `100-nodes-${String(index + 1).padStart(3, "0")}`, tempDirectory);
      console.log(`Nodes batch ${index + 1}/${nodeBatches.length} complete.`);
    }

    const relationBatches = chunks(relationshipRows(odishaLgdDataset.nodes, archiveChecksum), batchSize);
    const existingRelationships = stagedRowCount("relationships", tempDirectory, "150-relationship-count");
    const relationshipStart = resumableBatchStart(existingRelationships, relationshipCount, relationBatches.length);
    if (relationshipStart > 0) console.log(`Resuming after ${existingRelationships} existing staged relationships.`);
    for (let index = relationshipStart; index < relationBatches.length; index += 1) {
      const batch = relationBatches[index];
      runSql(`insert into location.relationships (dataset_id, child_node_id, parent_node_id, relationship_type, source_artifact_id, source_evidence) values\n${batch.join(",\n")}\non conflict (dataset_id, child_node_id, parent_node_id, relationship_type) do nothing;`, `200-relationships-${String(index + 1).padStart(3, "0")}`, tempDirectory);
      console.log(`Relationships batch ${index + 1}/${relationBatches.length} complete.`);
    }

    runSql(lineageSql(), "300-lineage", tempDirectory);
    const validation = runSql(validationSql(expectedLevels, relationshipCount), "400-validate", tempDirectory);
    console.log(validation.trim());
    completed = true;
  } finally {
    if (completed) rmSync(tempDirectory, { recursive: true, force: true });
    else console.error(`Ingestion evidence retained at ${tempDirectory}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
