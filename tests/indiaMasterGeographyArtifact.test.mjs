import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildIndiaMasterGeographyArtifact,
  canonicalMasterGeographyContent,
  normalizeMasterGeographyValue,
  renderIndiaMasterGeographyArtifact
} from "../scripts/generateIndiaMasterGeography.mjs";
import { INDIA_MASTER_GEOGRAPHY } from "../supabase/functions/_shared/generated/indiaMasterGeography.ts";

test("checked-in artifact is the byte-equivalent deterministic canonical projection", () => {
  const regenerated = buildIndiaMasterGeographyArtifact();
  assert.deepEqual(INDIA_MASTER_GEOGRAPHY, regenerated);
  const checkedIn = readFileSync(
    new URL("../supabase/functions/_shared/generated/indiaMasterGeography.ts", import.meta.url),
    "utf8"
  );
  assert.equal(checkedIn, renderIndiaMasterGeographyArtifact(regenerated));
});

test("artifact content hash and counts match canonical geography paths", () => {
  const expectedHash = createHash("sha256")
    .update(canonicalMasterGeographyContent(INDIA_MASTER_GEOGRAPHY), "utf8")
    .digest("hex");
  const { counts, paths } = INDIA_MASTER_GEOGRAPHY;
  assert.equal(INDIA_MASTER_GEOGRAPHY.contentSha256, expectedHash);
  assert.deepEqual(counts, {
    country: 1,
    state: 36,
    district: 335,
    block: 28,
    localBody: 84,
    total: paths.length
  });
});

test("every master path has its required parent and no normalized duplicate", () => {
  const paths = new Set(INDIA_MASTER_GEOGRAPHY.paths.map((path) => path.normalizedPath));
  assert.equal(paths.size, INDIA_MASTER_GEOGRAPHY.paths.length);
  for (const path of INDIA_MASTER_GEOGRAPHY.paths) {
    const segments = path.normalizedPath.split("|");
    if (segments.length > 1) {
      assert.ok(paths.has(segments.slice(0, -1).join("|")), `missing parent for ${path.normalizedPath}`);
    }
  }
});

test("normalization is deterministic across case, whitespace, compatibility forms, and controls", () => {
  assert.equal(normalizeMasterGeographyValue(" India | Odisha "), "india | odisha");
  assert.equal(normalizeMasterGeographyValue("  New\tDelhi  "), "new delhi");
  assert.equal(normalizeMasterGeographyValue("North\nDistrict"), "north district");
  assert.equal(normalizeMasterGeographyValue("India\t\nOdisha"), "india odisha");
  assert.equal(normalizeMasterGeographyValue("Ｏｄｉｓｈａ"), "odisha");
  assert.equal(normalizeMasterGeographyValue("Od\u0000isha"), "odisha");
});

test("artifact contains only immutable public master geography data", () => {
  assert.equal(INDIA_MASTER_GEOGRAPHY.sourceDatasetVersion, "business-os-compatibility-v1");
  for (const path of INDIA_MASTER_GEOGRAPHY.paths) {
    assert.deepEqual(
      Object.keys(path).sort(),
      Object.keys(path).filter((key) =>
        ["country", "state", "district", "block", "panchayat", "normalizedPath"].includes(key)
      ).sort()
    );
  }
});

test("Gate 3A leaves canonical frontend geography sources unchanged", () => {
  const changed = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--",
      "src/geography.ts",
      "src/businessOs/geography/IndiaAdministrativeHierarchy.ts",
      "src/businessOs/geography/GeographyService.ts"
    ],
    { encoding: "utf8" }
  ).trim();
  assert.equal(changed, "");
});
