create table if not exists public.voiceup_workspaces (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.voiceup_workspaces enable row level security;

drop policy if exists "Voiceup public read workspace" on public.voiceup_workspaces;
create policy "Voiceup public read workspace"
  on public.voiceup_workspaces
  for select
  using (true);

drop policy if exists "Voiceup public insert workspace" on public.voiceup_workspaces;
create policy "Voiceup public insert workspace"
  on public.voiceup_workspaces
  for insert
  with check (true);

drop policy if exists "Voiceup public update workspace" on public.voiceup_workspaces;
create policy "Voiceup public update workspace"
  on public.voiceup_workspaces
  for update
  using (true)
  with check (true);

comment on table public.voiceup_workspaces is
  'Temporary MVP shared JSON workspace for Voiceup Bharat. Replace with normalized tenant tables and authenticated policies before production scale.';

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

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.signers enable row level security;
alter table public.audit_logs enable row level security;
alter table public.subscriptions enable row level security;
alter table public.integration_settings enable row level security;
alter table public.media_assets enable row level security;

drop policy if exists "Public can read published campaigns" on public.campaigns;
create policy "Public can read published campaigns"
  on public.campaigns
  for select
  using (status = 'Published');

drop policy if exists "Public can insert signers" on public.signers;
create policy "Public can insert signers"
  on public.signers
  for insert
  with check (true);

insert into storage.buckets (id, name, public)
values
  ('campaign-public', 'campaign-public', true),
  ('voiceup-campaign-media', 'voiceup-campaign-media', true),
  ('campaign-private', 'campaign-private', false),
  ('scan-documents', 'scan-documents', false),
  ('appeal-pdfs', 'appeal-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "Public can read campaign public storage" on storage.objects;
create policy "Public can read campaign public storage"
  on storage.objects
  for select
  using (bucket_id in ('campaign-public', 'voiceup-campaign-media'));

drop policy if exists "Authenticated can manage campaign storage" on storage.objects;
create policy "Authenticated can manage campaign storage"
  on storage.objects
  for all
  using (auth.role() = 'authenticated' or bucket_id in ('campaign-public', 'voiceup-campaign-media'))
  with check (auth.role() = 'authenticated' or bucket_id in ('campaign-public', 'voiceup-campaign-media'));
