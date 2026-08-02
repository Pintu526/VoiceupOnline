import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { indiaGeographyService } from "../src/geography.ts";

const expectedCounts = Object.freeze({
  country: 1,
  state: 36,
  district: 335,
  block: 28,
  localBody: 84,
  total: 484
});

const currentDirectory = dirname(fileURLToPath(import.meta.url));
export const artifactPath = resolve(
  currentDirectory,
  "../supabase/functions/_shared/generated/indiaMasterGeography.ts"
);

function cleanMasterGeographyValue(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\t\n\r\f\v]/g, " ")
    .replace(/[\p{Cc}]/gu, "")
    .trim()
    .replace(/\s+/gu, " ");
}

export function normalizeMasterGeographyValue(value) {
  return cleanMasterGeographyValue(value).toLowerCase();
}

function cleanDisplayValue(value) {
  return cleanMasterGeographyValue(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function nodePath(node, nodesById) {
  const path = [];
  let current = node;
  while (current) {
    path.unshift(current);
    current = current.parentId ? nodesById.get(current.parentId) : undefined;
  }
  return path;
}

function artifactPathRecord(node, nodesById) {
  const result = {};
  for (const pathNode of nodePath(node, nodesById)) {
    const value = cleanDisplayValue(pathNode.name);
    if (pathNode.level === "country") result.country = value;
    if (pathNode.level === "state") result.state = value;
    if (pathNode.level === "district") result.district = value;
    if (pathNode.level === "block") result.block = value;
    if (pathNode.level === "local_body") result.panchayat = value;
  }

  const hierarchy = [
    result.country,
    result.state,
    result.district,
    result.block,
    result.panchayat
  ];
  const firstEmpty = hierarchy.findIndex((value) => !value);
  if (firstEmpty >= 0 && hierarchy.slice(firstEmpty + 1).some(Boolean)) {
    throw new Error(`Invalid master hierarchy path for ${node.id}.`);
  }

  const normalizedPath = hierarchy
    .filter(Boolean)
    .map(normalizeMasterGeographyValue)
    .join("|");
  if (!normalizedPath) throw new Error(`Empty master hierarchy path for ${node.id}.`);
  return { ...result, normalizedPath };
}

function countLevels(paths) {
  return {
    country: paths.filter((path) => !path.state).length,
    state: paths.filter((path) => path.state && !path.district).length,
    district: paths.filter((path) => path.district && !path.block).length,
    block: paths.filter((path) => path.block && !path.panchayat).length,
    localBody: paths.filter((path) => path.panchayat).length,
    total: paths.length
  };
}

function assertExpectedCounts(counts) {
  if (stableJson(counts) !== stableJson(expectedCounts)) {
    throw new Error(
      `Canonical geography counts changed: expected ${stableJson(expectedCounts)}, received ${stableJson(counts)}.`
    );
  }
}

export function canonicalMasterGeographyContent(artifact) {
  return stableJson({
    counts: artifact.counts,
    generatorVersion: artifact.generatorVersion,
    normalizationVersion: artifact.normalizationVersion,
    paths: artifact.paths,
    schemaVersion: artifact.schemaVersion,
    sourceDatasetVersion: artifact.sourceDatasetVersion
  });
}

export function buildIndiaMasterGeographyArtifact() {
  const dataset = indiaGeographyService.getDataset("IN");
  if (!dataset) throw new Error("The canonical India geography dataset is unavailable.");
  if (dataset.datasetVersion !== "business-os-compatibility-v1") {
    throw new Error(`Unexpected canonical dataset version: ${dataset.datasetVersion}.`);
  }

  const nodesById = new Map(dataset.nodes.map((node) => [node.id, node]));
  const paths = dataset.nodes
    .map((node) => artifactPathRecord(node, nodesById))
    .sort((first, second) => first.normalizedPath.localeCompare(second.normalizedPath));
  const duplicates = paths.filter(
    (path, index) => index > 0 && path.normalizedPath === paths[index - 1].normalizedPath
  );
  if (duplicates.length > 0) {
    throw new Error(`Duplicate normalized master path: ${duplicates[0].normalizedPath}.`);
  }

  const counts = countLevels(paths);
  assertExpectedCounts(counts);
  const canonicalContent = {
    counts,
    generatorVersion: "v1",
    normalizationVersion: "v1",
    paths,
    schemaVersion: 1,
    sourceDatasetVersion: dataset.datasetVersion
  };
  const contentSha256 = createHash("sha256")
    .update(canonicalMasterGeographyContent(canonicalContent), "utf8")
    .digest("hex");
  return {
    schemaVersion: canonicalContent.schemaVersion,
    generatorVersion: canonicalContent.generatorVersion,
    sourceDatasetVersion: canonicalContent.sourceDatasetVersion,
    normalizationVersion: canonicalContent.normalizationVersion,
    contentSha256,
    counts: canonicalContent.counts,
    paths: canonicalContent.paths
  };
}

export function renderIndiaMasterGeographyArtifact(artifact = buildIndiaMasterGeographyArtifact()) {
  return [
    "/*",
    " * GENERATED FILE — DO NOT EDIT MANUALLY.",
    " * Source: src/businessOs/geography/IndiaAdministrativeHierarchy.ts and src/geography.ts",
    " * Regenerate: node --experimental-strip-types scripts/generateIndiaMasterGeography.mjs",
    " */",
    "",
    `export const INDIA_MASTER_GEOGRAPHY = ${JSON.stringify(artifact, null, 2)} as const;`,
    ""
  ].join("\n");
}

export async function generateIndiaMasterGeography() {
  const output = renderIndiaMasterGeographyArtifact();
  const current = await readFile(artifactPath, "utf8").catch(() => "");
  if (current !== output) await writeFile(artifactPath, output, "utf8");
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateIndiaMasterGeography();
}
