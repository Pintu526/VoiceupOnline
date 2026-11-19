// Verifies that the built initial HTML and campaign-page static chunk graph never load the geography dataset chunk.
// Usage: node scripts/verify-initial-bundle.mjs [distDir]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(process.argv[2] ?? "dist");
const assets = path.join(dist, "assets");
if (!existsSync(assets)) {
  console.error(`FAIL: ${assets} not found. Run the production build first.`);
  process.exit(2);
}

const chunks = readdirSync(assets).filter((name) => name.endsWith(".js"));
const sizeOf = (name) => statSync(path.join(assets, name)).size;
const heavy = chunks.reduce((largest, name) => (sizeOf(name) > sizeOf(largest) ? name : largest));
const MiB = (bytes) => (bytes / 1048576).toFixed(2);
console.log(`Largest chunk: ${heavy} (${MiB(sizeOf(heavy))} MiB)`);

function staticImports(name) {
  const source = readFileSync(path.join(assets, name), "utf8");
  const found = new Set();
  for (const match of source.matchAll(/(?:^|[;}\n])\s*(?:import|export)[^"'`;]*?from\s*"\.\/([^"]+\.js)"/gu)) found.add(match[1]);
  for (const match of source.matchAll(/(?:^|[;}\n])\s*import\s*"\.\/([^"]+\.js)"/gu)) found.add(match[1]);
  return [...found];
}

function closure(seeds) {
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const name = queue.pop();
    if (seen.has(name) || !existsSync(path.join(assets, name))) continue;
    seen.add(name);
    queue.push(...staticImports(name));
  }
  return seen;
}

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
};

check("heavy chunk is the geography dataset (>= 5 MiB)", sizeOf(heavy) >= 5 * 1048576, `${MiB(sizeOf(heavy))} MiB`);

const htmlFiles = readdirSync(dist).filter((name) => name.endsWith(".html"));
let entryClosure = new Set();
for (const html of htmlFiles) {
  const text = readFileSync(path.join(dist, html), "utf8");
  const seeds = [...text.matchAll(/\/assets\/([^"']+\.js)/gu)].map((match) => match[1]);
  const reached = closure(seeds);
  check(`${html}: heavy chunk not referenced or statically imported`, !text.includes(heavy) && !reached.has(heavy), `${reached.size} chunks`);
  if (html === "index.html") entryClosure = reached;
}

const page = chunks.find((name) => name.startsWith("PublicCampaignPage-"));
check("PublicCampaignPage chunk exists", Boolean(page));
if (page) {
  const pageClosure = closure([page]);
  check("PublicCampaignPage static closure excludes heavy chunk", !pageClosure.has(heavy));
  const initial = new Set([...entryClosure, ...pageClosure]);
  const total = [...initial].reduce((sum, name) => sum + sizeOf(name), 0);
  check("initial campaign route JS (entry + page static closure) < 5 MiB", total < 5 * 1048576, `${MiB(total)} MiB`);
}

const locationChunk = chunks.find((name) => name.startsWith("IndiaLocationFields-"));
check("IndiaLocationFields is a separate on-demand chunk", Boolean(locationChunk));
if (locationChunk) check("location fields chunk still reaches geography data", closure([locationChunk]).has(heavy));

console.log(failures === 0 ? "RESULT: PASS" : "RESULT: FAIL");
process.exit(failures === 0 ? 0 : 1);
