import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");
const GEOGRAPHY = "src/geography.ts";
const DATASET = "src/businessOs/geography/OdishaLgdGenerated.ts";

function resolveModule(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.(ts|tsx)$/u.test(candidate) && existsSync(path.join(repoRoot, candidate))) return candidate;
  }
  return null;
}

/** Static (non-type, non-dynamic) relative imports and re-exports of a module. */
function staticImports(file) {
  const source = read(file);
  const found = [];
  const pattern = /(?:^|\n)\s*(import|export)\s+(type\s+)?([\w*${}\s,]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/gu;
  for (const match of source.matchAll(pattern)) {
    if (match[2]) continue;
    const names = match[3] ?? "";
    const braced = names.trim().match(/^\{([^}]*)\}$/u);
    if (braced && braced[1].split(",").map((part) => part.trim()).filter(Boolean).every((part) => part.startsWith("type "))) continue;
    found.push(match[4] ?? match[5]);
  }
  return found;
}

function staticGraph(entry) {
  const parents = new Map([[entry, null]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    for (const specifier of staticImports(file)) {
      const resolved = resolveModule(file, specifier);
      if (resolved && !parents.has(resolved)) {
        parents.set(resolved, file);
        queue.push(resolved);
      }
    }
  }
  return parents;
}

function chain(parents, target) {
  const steps = [];
  for (let node = target; node; node = parents.get(node)) steps.push(node);
  return steps.join(" <- ");
}

test("the app entry's static import graph never reaches the Odisha LGD geography dataset", () => {
  const parents = staticGraph("src/main.tsx");
  assert.ok(parents.size > 50, "static graph walk should cover the app entry");
  for (const target of [GEOGRAPHY, DATASET]) {
    assert.equal(parents.has(target), false, `${target} is statically reachable: ${chain(parents, target)}`);
  }
});

test("the lazy public campaign page's static import graph never reaches the geography dataset", () => {
  const parents = staticGraph("src/pages/PublicCampaignPage.tsx");
  assert.ok(parents.size > 20, "static graph walk should cover the campaign page");
  for (const target of [GEOGRAPHY, DATASET]) {
    assert.equal(parents.has(target), false, `${target} is statically reachable: ${chain(parents, target)}`);
  }
});

test("geography-dependent code is loaded on demand and stays available", () => {
  const pipeline = read("src/documentIntelligence/defaultPipeline.ts");
  assert.match(pipeline, /await import\(\s*"\.\/references\/india\.ts"\s*\)/u);
  assert.doesNotMatch(read("src/documentIntelligence/index.ts"), /references\/india/u);

  const lazy = read("src/components/IndiaLocationFieldsLazy.tsx");
  assert.match(lazy, /import\(\s*"\.\/IndiaLocationFields"\s*\)/u);
  assert.match(lazy, /export function IndiaLocationFields\b/u);
  assert.match(read("src/pages/PublicCampaignPage.tsx"), /from "\.\.\/components\/IndiaLocationFieldsLazy"/u);

  assert.doesNotMatch(read("src/components/indiaLocationCatalogResolver.ts"), /from\s+["'][^"']*geography/iu);
  const options = read("src/components/indiaLocationOptions.ts");
  assert.match(options, /from "\.\.\/geography\.ts"/u);
  assert.match(options, /export \{[^}]*resolveIndiaLocationCatalog[^}]*\}/u);
});

test("on-demand modules still expose the full India location and OCR vocabulary behaviour", async () => {
  const resolver = await import("../src/components/indiaLocationCatalogResolver.ts");
  const options = await import("../src/components/indiaLocationOptions.ts");
  for (const name of ["normalizeIndiaLocationOptionKey", "normalizePublicCampaignCustomLocations", "resolveIndiaLocationCatalog"]) {
    assert.equal(options[name], resolver[name], `${name} must be the same function from both entry points`);
  }
  const catalog = options.resolveIndiaLocationCatalog([{ country: " India ", state: " Odisha ", district: "Khordha" }], undefined);
  assert.deepEqual(catalog.map((entry) => [entry.country, entry.state, entry.district]), [["India", "Odisha", "Khordha"]]);

  const india = await import("../src/documentIntelligence/references/india.ts");
  const reference = india.createIndiaDocumentReferenceData();
  assert.ok(reference.districtsByState.Odisha.length >= 30, "Odisha districts must come from the official LGD hierarchy");
  assert.deepEqual(reference.states.Odisha, ["Odisha", "Orissa"]);
});
