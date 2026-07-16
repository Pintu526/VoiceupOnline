create extension if not exists pgcrypto;

create table if not exists public.voiceup_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (
    role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer', 'viewer')
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table public.voiceup_workspace_members
  add column if not exists active boolean not null default true;

alter table public.voiceup_workspace_members
  add column if not exists updated_at timestamptz not null default now();

create index if not exists voiceup_workspace_members_user_id_idx
  on public.voiceup_workspace_members (user_id);

create index if not exists voiceup_workspace_members_workspace_id_idx
  on public.voiceup_workspace_members (workspace_id);

create index if not exists voiceup_workspace_members_workspace_role_idx
  on public.voiceup_workspace_members (workspace_id, role);

alter table public.voiceup_workspace_members enable row level security;

drop policy if exists "VoiceUp members read own workspace memberships"
  on public.voiceup_workspace_members;

create policy "VoiceUp members read own workspace memberships"
  on public.voiceup_workspace_members
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.voiceup_workspace_members from anon;
grant select on table public.voiceup_workspace_members to authenticated;

create or replace function public.voiceup_is_workspace_member(target_workspace_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.voiceup_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.active
  );
$$;

revoke all on function public.voiceup_is_workspace_member(text) from public;
grant execute on function public.voiceup_is_workspace_member(text) to authenticated;

create or replace function public.voiceup_can_manage_private_evidence(target_workspace_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.voiceup_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.active
      and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer')
  );
$$;

revoke all on function public.voiceup_can_manage_private_evidence(text) from public;
grant execute on function public.voiceup_can_manage_private_evidence(text) to authenticated;

drop policy if exists "Campaign private members select"
  on storage.objects;
drop policy if exists "Campaign private members insert"
  on storage.objects;
drop policy if exists "Campaign private members update"
  on storage.objects;
drop policy if exists "Campaign private members delete"
  on storage.objects;

create policy "Campaign private members select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'campaign-private'
    and public.voiceup_is_workspace_member(coalesce((storage.foldername(name))[1], ''))
  );

create policy "Campaign private members insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'campaign-private'
    and public.voiceup_can_manage_private_evidence(coalesce((storage.foldername(name))[1], ''))
  );

create policy "Campaign private members update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'campaign-private'
    and public.voiceup_can_manage_private_evidence(coalesce((storage.foldername(name))[1], ''))
  )
  with check (
    bucket_id = 'campaign-private'
    and public.voiceup_can_manage_private_evidence(coalesce((storage.foldername(name))[1], ''))
  );

create policy "Campaign private members delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'campaign-private'
    and public.voiceup_can_manage_private_evidence(coalesce((storage.foldername(name))[1], ''))
  );

comment on table public.voiceup_workspace_members is
  'Pilot workspace membership. Client access is read-only; provisioning is server or administrator controlled.';

comment on function public.voiceup_is_workspace_member(text) is
  'Returns true only when auth.uid() has an active membership for the requested workspace.';

comment on function public.voiceup_can_manage_private_evidence(text) is
  'Returns true only for active workspace members with a pilot role authorised to manage private evidence.';

-- Pilot safety: the legacy "Authenticated can manage campaign storage" policy is intentionally
-- left in place until campaign-public and voiceup-campaign-media upload dependencies are replaced.
-- While it remains, the explicit campaign-private policies above do not provide complete
-- cross-workspace isolation because PostgreSQL RLS policies are permissive (OR-combined).
