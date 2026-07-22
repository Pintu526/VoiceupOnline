begin;

-- Generic, reusable resource-level assignment table for Business OS applications.
-- Purpose: link a real Supabase Auth user to a specific resource (e.g. a VoiceUp
-- campaign) within a workspace, independent of `voiceup_workspace_members`
-- (which only tracks workspace-level role membership). This table answers
-- "who is the currently assigned Campaign Admin (or equivalent) for THIS exact
-- resource" and supports safe replacement without deleting history.
create table if not exists public.workspace_resource_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  application_key text not null,
  role text not null,
  resource_type text not null,
  resource_id text not null,
  resource_slug text,
  active boolean not null default true,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_resource_members_user_id_idx
  on public.workspace_resource_members (user_id);

create index if not exists workspace_resource_members_workspace_id_idx
  on public.workspace_resource_members (workspace_id);

create index if not exists workspace_resource_members_resource_id_idx
  on public.workspace_resource_members (resource_id);

create index if not exists workspace_resource_members_resource_slug_idx
  on public.workspace_resource_members (resource_slug);

create index if not exists workspace_resource_members_resource_idx
  on public.workspace_resource_members (workspace_id, application_key, resource_type, resource_id);

-- Only one ACTIVE assignment may exist per
-- (workspace_id, user_id, application_key, role, resource_type, resource_id).
-- Revoked rows (active = false) are kept for history and are excluded from
-- the uniqueness rule so replacing an administrator never requires deleting
-- the previous assignment.
create unique index if not exists workspace_resource_members_active_unique_idx
  on public.workspace_resource_members (workspace_id, user_id, application_key, role, resource_type, resource_id)
  where active;

alter table public.workspace_resource_members enable row level security;

drop policy if exists "Workspace resource members read own assignments"
  on public.workspace_resource_members;

create policy "Workspace resource members read own assignments"
  on public.workspace_resource_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- All writes happen exclusively through the `provision-workspace-member` Edge
-- Function using the service-role key, which bypasses RLS. No insert/update/
-- delete policy is granted to `authenticated` or `anon`.
revoke all on table public.workspace_resource_members from anon;
grant select on table public.workspace_resource_members to authenticated;

create or replace function public.voiceup_has_active_resource_assignment(
  target_workspace_id text,
  target_application_key text,
  target_resource_type text,
  target_resource_id text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.workspace_resource_members assignment
    where assignment.workspace_id = target_workspace_id
      and assignment.application_key = target_application_key
      and assignment.resource_type = target_resource_type
      and assignment.resource_id = target_resource_id
      and assignment.user_id = auth.uid()
      and assignment.active
  );
$$;

revoke all on function public.voiceup_has_active_resource_assignment(text, text, text, text) from public;
grant execute on function public.voiceup_has_active_resource_assignment(text, text, text, text) to authenticated;

commit;
