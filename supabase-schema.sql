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
