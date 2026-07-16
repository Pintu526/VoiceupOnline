import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260717_storage_policy_consolidation.sql", import.meta.url),
  "utf8"
);
const schema = readFileSync(new URL("../supabase-schema.sql", import.meta.url), "utf8");
const pilotMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260716_campaign_admin_secure_storage_auth_pilot.sql",
    import.meta.url
  ),
  "utf8"
);

const obsoletePolicies = [
  "Authenticated can manage campaign storage",
  "Authenticated can read private campaign assets",
  "Authenticated can upload campaign assets",
  "Authenticated can update campaign assets",
  "Authenticated can delete campaign assets",
  "Campaign private members select",
  "Public can read campaign public storage"
];

test("consolidation is atomic and creates replacements before removing obsolete policies", () => {
  assert.match(migration, /^begin;/i);
  assert.match(migration, /commit;\s*$/i);

  const firstReplacement = migration.indexOf('create policy "Campaign private approved roles select"');
  const firstObsoleteDrop = migration.indexOf('drop policy if exists "Authenticated can manage campaign storage"');
  assert.ok(firstReplacement >= 0);
  assert.ok(firstObsoleteDrop > firstReplacement);
});

test("storage access requires an active approved role in the exact workspace prefix", () => {
  assert.match(migration, /create or replace function public\.voiceup_can_manage_workspace_storage/);
  assert.match(migration, /member\.workspace_id = target_workspace_id/);
  assert.match(migration, /member\.user_id = auth\.uid\(\)/);
  assert.match(migration, /member\.active/);
  assert.match(
    migration,
    /member\.role in \('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer'\)/
  );
  assert.doesNotMatch(migration, /member\.role in \([^)]*'viewer'/);
  assert.match(migration, /coalesce\(\(storage\.foldername\(name\)\)\[1\], ''\)/);
});

test("campaign-private replacement grants only authenticated approved-role reads", () => {
  const privateSelect = migration.slice(
    migration.indexOf('create policy "Campaign private approved roles select"'),
    migration.indexOf('create policy "Campaign public media approved roles insert"')
  );
  assert.match(privateSelect, /for select\s+to authenticated/i);
  assert.match(privateSelect, /bucket_id = 'campaign-private'/);
  assert.match(privateSelect, /voiceup_can_manage_workspace_storage/);
  assert.doesNotMatch(privateSelect, /\bto anon\b/i);
});

test("public buckets retain reads and receive only workspace-role-scoped writes", () => {
  assert.doesNotMatch(migration, /drop policy if exists "Anonymous can read published campaign assets"/);
  assert.match(
    schema,
    /create policy "Anonymous can read published campaign assets"[\s\S]*?to anon, authenticated[\s\S]*?bucket_id in \('campaign-public', 'voiceup-campaign-media'\)/
  );

  for (const operation of ["insert", "update", "delete"]) {
    const policyStart = migration.indexOf(
      `create policy "Campaign public media approved roles ${operation}"`
    );
    assert.ok(policyStart >= 0);
  }

  assert.match(migration, /bucket_id in \('campaign-public', 'voiceup-campaign-media'\)/);
  assert.doesNotMatch(migration, /bucket_id in \([^)]*'campaign-private'[^)]*\)/);
  assert.doesNotMatch(migration, /bucket_id in \([^)]*'scan-documents'[^)]*\)/);
  assert.doesNotMatch(migration, /bucket_id in \([^)]*'appeal-pdfs'[^)]*\)/);
});

test("retained campaign-private write policies remain approved-role scoped", () => {
  for (const operation of ["insert", "update", "delete"]) {
    assert.match(
      pilotMigration,
      new RegExp(
        `create policy "Campaign private members ${operation}"[\\s\\S]*?` +
          `bucket_id = 'campaign-private'[\\s\\S]*?voiceup_can_manage_private_evidence`,
        "i"
      )
    );
  }
  assert.match(
    pilotMigration,
    /member\.role in \('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer'\)/
  );
  assert.doesNotMatch(
    pilotMigration,
    /member\.role in \([^)]*'viewer'[^)]*\)[\s\S]*?voiceup_can_manage_private_evidence/
  );
});

test("only audited obsolete storage policies are removed", () => {
  const drops = [...migration.matchAll(/drop policy if exists "([^"]+)"\s+on storage\.objects;/gi)]
    .map((match) => match[1]);
  assert.deepEqual(drops, obsoletePolicies);
});

test("migration changes no application data or schema objects", () => {
  assert.doesNotMatch(migration, /\bdrop\s+table\b/i);
  assert.doesNotMatch(migration, /\bdrop\s+column\b/i);
  assert.doesNotMatch(migration, /\balter\s+table\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\btruncate\b/i);
  assert.doesNotMatch(migration, /\b(insert|update)\s+(into\s+)?public\.campaigns\b/i);
  assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into\s+|from\s+)?storage\.objects\b/i);
});
