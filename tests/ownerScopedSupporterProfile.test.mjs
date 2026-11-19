import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20261106010000_owner_scoped_supporter_profile_update.sql",
  import.meta.url
), "utf8");

test("owner profile update is authenticated and account scoped", () => {
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /account\.id = p_account_id and account\.auth_user_id = v_actor/);
  assert.match(migration, /workspace\.id = v_account\.workspace_id[\s\S]*for update/);
  assert.match(migration, /signer ->> 'campaignId' = v_account\.campaign_id/);
  assert.match(migration, /signer ->> 'id' = v_account\.supporter_id/);
});

test("owner profile update permits only optional fields", () => {
  for (const protectedField of ["phone", "email", "otpVerified", "consentAccepted", "signedAt", "supportSubmittedAt", "status"]) {
    assert.doesNotMatch(migration.match(/array\[[\s\S]*?\]::text\[\]/)?.[0] ?? "", new RegExp(`'${protectedField}'`));
  }
  assert.match(migration, /'address'.*'whatsappNumber'.*'telegramHandle'/s);
  assert.match(migration, /'locationReference'/);
});

test("owner profile update is audited, idempotent and not publicly executable", () => {
  assert.match(migration, /p_request_id uuid/);
  assert.match(migration, /supporter\.profile\.completed/);
  assert.match(migration, /'changedFields'/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, service_role/);
  assert.match(migration, /grant execute on function[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /disable row level security|drop table|truncate/iu);
});
