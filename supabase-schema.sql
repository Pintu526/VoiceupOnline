create extension if not exists pgcrypto;

create table if not exists public.voiceup_workspaces (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.voiceup_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('platform_owner', 'organization_admin', 'campaign_admin', 'reviewer', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.voiceup_customer_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  token_hash text not null unique,
  mobile_hash text not null,
  campaign_id text,
  role text not null default 'organization_admin',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.voiceup_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  phone_hash text not null,
  code_hash text not null,
  purpose text not null check (purpose in ('public-signing', 'onboarding')),
  metadata jsonb not null default '{}'::jsonb,
  sent_count integer not null default 1,
  attempt_count integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.voiceup_public_campaign_index (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  slug text not null,
  status text not null,
  campaign jsonb not null,
  organization jsonb,
  authorities jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (workspace_id, campaign_id)
);

create table if not exists public.voiceup_public_rate_limits (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  rate_key text not null,
  action text not null default 'public-signing',
  count integer not null default 1,
  reset_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now()
);

alter table public.voiceup_public_rate_limits
  drop constraint if exists voiceup_public_rate_limits_workspace_id_rate_key_action_key;

create index if not exists voiceup_public_campaign_index_slug_status_idx
  on public.voiceup_public_campaign_index (slug, status);

create index if not exists voiceup_customer_sessions_mobile_hash_idx
  on public.voiceup_customer_sessions (mobile_hash, created_at desc);

create index if not exists voiceup_otp_challenges_lookup_idx
  on public.voiceup_otp_challenges (workspace_id, phone_hash, purpose, created_at desc);

create index if not exists voiceup_public_rate_limits_key_created_idx
  on public.voiceup_public_rate_limits (rate_key, created_at desc);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text,
  plan text not null default 'Starter',
  subscription_status text not null default 'Trial',
  custom_domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('platform_owner', 'organization_admin', 'campaign_admin', 'reviewer', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  slug text not null unique,
  title text not null,
  status text not null default 'Draft',
  category text,
  description text,
  appeal_content text,
  authority_target_level text check (authority_target_level in ('district', 'state', 'country')),
  location jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.signers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  location jsonb not null default '{}'::jsonb,
  source text not null default 'online',
  status text not null default 'verified',
  accepted_appeal text,
  signed_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  actor_email text,
  action text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null default 'Razorpay',
  provider_customer_id text,
  provider_subscription_id text,
  plan text not null,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  razorpay jsonb not null default '{}'::jsonb,
  whatsapp jsonb not null default '{}'::jsonb,
  sms jsonb not null default '{}'::jsonb,
  email jsonb not null default '{}'::jsonb,
  storage jsonb not null default '{}'::jsonb,
  analytics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  bucket text not null,
  path text not null,
  asset_type text not null,
  created_at timestamptz not null default now()
);

alter table public.voiceup_workspaces enable row level security;
alter table public.voiceup_workspace_members enable row level security;
alter table public.voiceup_customer_sessions enable row level security;
alter table public.voiceup_otp_challenges enable row level security;
alter table public.voiceup_public_campaign_index enable row level security;
alter table public.voiceup_public_rate_limits enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.signers enable row level security;
alter table public.audit_logs enable row level security;
alter table public.subscriptions enable row level security;
alter table public.integration_settings enable row level security;
alter table public.media_assets enable row level security;

create or replace function public.voiceup_is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.user_id = auth.uid()
      and member.role = 'platform_owner'
  ) or exists (
    select 1
    from public.voiceup_workspace_members member
    where member.user_id = auth.uid()
      and member.role = 'platform_owner'
  );
$$;

create or replace function public.voiceup_is_workspace_member(target_workspace_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.voiceup_workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
    );
$$;

create or replace function public.voiceup_get_access(target_workspace_id text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'platformAdmin', public.voiceup_is_platform_admin(),
    'workspaceMember', public.voiceup_is_workspace_member(target_workspace_id),
    'role', coalesce((
      select member.role
      from public.voiceup_workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
      order by member.created_at asc
      limit 1
    ), case when public.voiceup_is_platform_admin() then 'platform_owner' else '' end),
    'email', coalesce(auth.email(), ''),
    'workspaceId', target_workspace_id
  );
$$;

drop policy if exists "Voiceup public read workspace" on public.voiceup_workspaces;
drop policy if exists "Voiceup public insert workspace" on public.voiceup_workspaces;
drop policy if exists "Voiceup public update workspace" on public.voiceup_workspaces;
drop policy if exists "Voiceup members read workspace" on public.voiceup_workspaces;
drop policy if exists "Voiceup members update workspace" on public.voiceup_workspaces;
drop policy if exists "Voiceup platform creates workspace" on public.voiceup_workspaces;

create policy "Voiceup members read workspace"
  on public.voiceup_workspaces
  for select
  to authenticated
  using (public.voiceup_is_workspace_member(id));

create policy "Voiceup members update workspace"
  on public.voiceup_workspaces
  for update
  to authenticated
  using (public.voiceup_is_workspace_member(id))
  with check (public.voiceup_is_workspace_member(id));

create policy "Voiceup platform creates workspace"
  on public.voiceup_workspaces
  for insert
  to authenticated
  with check (public.voiceup_is_platform_admin());

drop policy if exists "Voiceup members read workspace membership" on public.voiceup_workspace_members;
drop policy if exists "Voiceup platform manages workspace membership" on public.voiceup_workspace_members;

create policy "Voiceup members read workspace membership"
  on public.voiceup_workspace_members
  for select
  to authenticated
  using (user_id = auth.uid() or public.voiceup_is_platform_admin());

create policy "Voiceup platform manages workspace membership"
  on public.voiceup_workspace_members
  for all
  to authenticated
  using (public.voiceup_is_platform_admin())
  with check (public.voiceup_is_platform_admin());

drop policy if exists "Public can read published campaigns" on public.campaigns;
drop policy if exists "Public can insert signers" on public.signers;
drop policy if exists "Members read organizations" on public.organizations;
drop policy if exists "Members manage own campaigns" on public.campaigns;
drop policy if exists "Members read signers" on public.signers;
drop policy if exists "Members read audit logs" on public.audit_logs;
drop policy if exists "Platform reads subscriptions" on public.subscriptions;
drop policy if exists "Platform manages integration settings" on public.integration_settings;
drop policy if exists "Members read media assets" on public.media_assets;
drop policy if exists "Anonymous reads public campaign index" on public.voiceup_public_campaign_index;
drop policy if exists "Authenticated reads public campaign index" on public.voiceup_public_campaign_index;

create policy "Members read organizations"
  on public.organizations
  for select
  to authenticated
  using (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = organizations.id
        and member.user_id = auth.uid()
    )
  );

create policy "Members manage own campaigns"
  on public.campaigns
  for all
  to authenticated
  using (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = campaigns.organization_id
        and member.user_id = auth.uid()
    )
  )
  with check (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = campaigns.organization_id
        and member.user_id = auth.uid()
    )
  );

create policy "Members read signers"
  on public.signers
  for select
  to authenticated
  using (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.campaigns campaign
      join public.organization_members member on member.organization_id = campaign.organization_id
      where campaign.id = signers.campaign_id
        and member.user_id = auth.uid()
    )
  );

create policy "Members read audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = audit_logs.organization_id
        and member.user_id = auth.uid()
    )
  );

create policy "Platform reads subscriptions"
  on public.subscriptions
  for select
  to authenticated
  using (public.voiceup_is_platform_admin());

create policy "Platform manages integration settings"
  on public.integration_settings
  for all
  to authenticated
  using (public.voiceup_is_platform_admin())
  with check (public.voiceup_is_platform_admin());

create policy "Members read media assets"
  on public.media_assets
  for select
  to authenticated
  using (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = media_assets.organization_id
        and member.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values
  ('campaign-public', 'campaign-public', true),
  ('voiceup-campaign-media', 'voiceup-campaign-media', true),
  ('campaign-private', 'campaign-private', false),
  ('scan-documents', 'scan-documents', false),
  ('appeal-pdfs', 'appeal-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "Public can read campaign public storage" on storage.objects;
drop policy if exists "Authenticated can manage campaign storage" on storage.objects;
drop policy if exists "Anonymous can read published campaign assets" on storage.objects;
drop policy if exists "Authenticated can upload campaign assets" on storage.objects;
drop policy if exists "Authenticated can update campaign assets" on storage.objects;
drop policy if exists "Authenticated can delete campaign assets" on storage.objects;

create policy "Anonymous can read published campaign assets"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id in ('campaign-public', 'voiceup-campaign-media'));

create policy "Authenticated can upload campaign assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('campaign-public', 'voiceup-campaign-media', 'campaign-private', 'scan-documents', 'appeal-pdfs')
    and public.voiceup_is_workspace_member(coalesce((storage.foldername(name))[1], ''))
  );

create policy "Authenticated can update campaign assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('campaign-public', 'voiceup-campaign-media', 'campaign-private', 'scan-documents', 'appeal-pdfs')
    and public.voiceup_is_workspace_member(coalesce((storage.foldername(name))[1], ''))
  )
  with check (
    bucket_id in ('campaign-public', 'voiceup-campaign-media', 'campaign-private', 'scan-documents', 'appeal-pdfs')
    and public.voiceup_is_workspace_member(coalesce((storage.foldername(name))[1], ''))
  );

create policy "Authenticated can delete campaign assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('campaign-public', 'voiceup-campaign-media', 'campaign-private', 'scan-documents', 'appeal-pdfs')
    and public.voiceup_is_workspace_member(coalesce((storage.foldername(name))[1], ''))
  );

comment on table public.voiceup_workspaces is
  'Secured compatibility JSON workspace. Access is restricted to authenticated workspace members or service-role Edge Functions.';
