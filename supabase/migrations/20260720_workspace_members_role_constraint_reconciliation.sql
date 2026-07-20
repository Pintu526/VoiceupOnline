begin;

-- Reconciles role-constraint drift on `public.voiceup_workspace_members`.
--
-- Background: two different historical schema sources declared this same
-- table with `create table if not exists` (a no-op when the table already
-- exists), each with a DIFFERENT inline `role` check constraint:
--   - supabase-schema.sql:                              ('platform_owner', 'organization_admin', 'campaign_admin', 'reviewer', 'viewer')
--   - 20260716_campaign_admin_secure_storage_auth_pilot: ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer', 'viewer')
-- Only whichever one actually ran first on a given database is enforced --
-- the other was silently skipped by `if not exists`.
--
-- A codebase-wide search confirms the SECOND set is the one actually used by
-- live application code for `voiceup_workspace_members` specifically:
--   - src/secureFieldUploadAuth.ts `secureFieldUploadRoles` = platform_owner,
--     workspace_admin, campaign_admin, field_officer
--   - supabase/functions/provision-workspace-member (isCallerAuthorizedToProvision)
--     checks for `workspace_admin` / `platform_owner`
--   - supabase/migrations/20260716_.../20260717_... storage policies check
--     `role in ('platform_owner','workspace_admin','campaign_admin','field_officer')`
-- No code anywhere inserts `organization_admin` or `reviewer` into
-- `voiceup_workspace_members` (those role values belong to the separate
-- `organization_members` table, which has its own, already-consistent,
-- untouched check constraint and is not affected by this migration).
-- `viewer` appears in both historical variants and is kept as a legitimate
-- no-privilege role.
--
-- Final canonical allowed roles for `voiceup_workspace_members.role`:
--   platform_owner, workspace_admin, campaign_admin, field_officer, viewer

-- 1) Detect and drop the OLD role check constraint by its actual, discovered
--    name (never guessed) -- whichever variant happened to win on this
--    database. Also drop any previous run of THIS migration's own
--    constraint name, so re-running this file is idempotent.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.voiceup_workspace_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.voiceup_workspace_members drop constraint %I', constraint_record.conname);
  end loop;
end;
$$;

alter table public.voiceup_workspace_members
  drop constraint if exists voiceup_workspace_members_role_check;

-- 2) Add ONE canonical, explicitly-named role constraint. It is added
--    `not valid` so it never scans/invalidates rows that may already exist
--    with a legacy role value (this migration does not delete or rewrite any
--    membership data). Every NEW insert/update is still fully enforced
--    against the canonical list going forward.
alter table public.voiceup_workspace_members
  add constraint voiceup_workspace_members_role_check
  check (role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer', 'viewer'))
  not valid;

comment on constraint voiceup_workspace_members_role_check on public.voiceup_workspace_members is
  'Canonical role list (reconciled 2026-07-20): platform_owner, workspace_admin, campaign_admin, field_officer, viewer. Added NOT VALID to avoid invalidating any pre-existing rows; enforced for all new writes.';

commit;
