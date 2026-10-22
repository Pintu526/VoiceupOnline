import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../supabase/functions/location-api-v1/index.ts", import.meta.url), "utf8");
const executor = readFileSync(new URL("../supabase/functions/location-api-v1/SupabasePostgresReadOnlyExecutor.ts", import.meta.url), "utf8");

test("location API Edge adapter uses only the repository-backed private Postgres path", () => {
  assert.match(index, /PostgresCanonicalLocationRepository/u);
  assert.match(index, /RepositoryLocationService/u);
  assert.match(index, /RepositoryLocationApiV1/u);
  assert.match(index, /SUPABASE_DB_URL/u);
  assert.match(index, /SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(index, /OdishaLgdGenerated|OdishaLgdDataset|CanonicalGeographyDataset|CanonicalGeographyEngine/u);
  assert.doesNotMatch(executor, /\b(insert|update|delete|alter|create|drop)\b/iu);
  assert.match(executor, /begin read only/u);
  assert.match(executor, /queryObject/u);
});

test("location API Edge adapter retains authorization, exact-origin CORS, request bounds, and controlled staged access", () => {
  assert.match(index, /LOCATION_API_KEY/u);
  assert.match(index, /LOCATION_API_ALLOWED_ORIGINS/u);
  assert.match(index, /MAX_REQUEST_BYTES/u);
  assert.match(index, /LOCATION_API_ALLOW_STAGED_DATASET_TESTING/u);
  assert.match(index, /LOCATION_API_STAGED_DATASET_ID/u);
  assert.match(index, /mode: "active_release"/u);
  assert.match(index, /mode: "staged_dataset"/u);
  assert.doesNotMatch(index, /Access-Control-Allow-Origin": "\*"/u);
});
