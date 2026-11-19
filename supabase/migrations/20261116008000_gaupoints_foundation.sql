-- GauPoints durable accounting foundation.
-- DEVELOPMENT ONLY. This migration does not activate or award GauPoints.

begin;

do $guard$
begin
  if to_regclass('public.voiceup_workspaces') is null then
    raise exception using message = 'gaupoints:missing_voiceup_workspaces_dependency';
  end if;
  if to_regclass('public.voiceup_supporter_accounts') is null then
    raise exception using message = 'gaupoints:missing_supporter_accounts_dependency';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception using message = 'gaupoints:missing_pgcrypto_dependency';
  end if;
end;
$guard$;

create or replace function public.voiceup_gp_sha256_hex(p_value text)
returns text
language sql
immutable
strict
security invoker
set search_path = public, extensions, pg_temp
as $function$
  select encode(extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex');
$function$;

revoke all on function public.voiceup_gp_sha256_hex(text) from public, anon, authenticated;
grant execute on function public.voiceup_gp_sha256_hex(text) to service_role;

create table public.voiceup_gp_wallets (
  workspace_id text not null,
  campaign_id text not null,
  supporter_id text not null,
  balance bigint not null default 0 check (balance >= 0),
  lifetime_valid bigint not null default 0 check (lifetime_valid >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, campaign_id, supporter_id),
  foreign key (workspace_id, campaign_id, supporter_id)
    references public.voiceup_supporter_accounts(workspace_id, campaign_id, supporter_id)
    on delete restrict
);

create table public.voiceup_gp_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  campaign_id text not null,
  supporter_id text not null,
  event_key text not null check (length(event_key) between 20 and 160),
  event_kind text not null check (event_kind in (
    'verified_signing', 'verified_referral', 'round_contribution',
    'upstream_receipt', 'pending_contribution', 'round_completion'
  )),
  points bigint not null,
  reference_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (workspace_id, campaign_id, event_key),
  foreign key (workspace_id, campaign_id, supporter_id)
    references public.voiceup_gp_wallets(workspace_id, campaign_id, supporter_id)
    on delete restrict,
  check (
    (event_kind = 'round_completion' and points = 0)
    or (event_kind <> 'round_completion' and points <> 0)
  ),
  check (event_kind <> 'round_contribution' or points < 0),
  check (event_kind not in ('verified_signing', 'verified_referral', 'upstream_receipt', 'pending_contribution') or points > 0)
);

create index voiceup_gp_ledger_supporter_created_idx
  on public.voiceup_gp_ledger(workspace_id, campaign_id, supporter_id, created_at desc);

create table public.voiceup_gp_referral_edges (
  workspace_id text not null,
  campaign_id text not null,
  child_supporter_id text not null,
  parent_supporter_id text not null,
  evidence_key text not null check (length(evidence_key) between 20 and 160),
  created_at timestamptz not null default now(),
  primary key (workspace_id, campaign_id, child_supporter_id),
  unique (workspace_id, campaign_id, evidence_key),
  foreign key (workspace_id, campaign_id, child_supporter_id)
    references public.voiceup_supporter_accounts(workspace_id, campaign_id, supporter_id)
    on delete restrict,
  foreign key (workspace_id, campaign_id, parent_supporter_id)
    references public.voiceup_supporter_accounts(workspace_id, campaign_id, supporter_id)
    on delete restrict,
  check (child_supporter_id <> parent_supporter_id)
);

create index voiceup_gp_referral_parent_idx
  on public.voiceup_gp_referral_edges(workspace_id, campaign_id, parent_supporter_id);

create table public.voiceup_gp_round_state (
  workspace_id text not null,
  campaign_id text not null,
  supporter_id text not null,
  completed_round integer not null default 0 check (completed_round >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, campaign_id, supporter_id),
  foreign key (workspace_id, campaign_id, supporter_id)
    references public.voiceup_gp_wallets(workspace_id, campaign_id, supporter_id)
    on delete restrict
);

create or replace function public.voiceup_gp_reject_immutable_change()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  raise exception using errcode = '55000', message = 'gaupoints:immutable_accounting_record';
end;
$function$;

create trigger voiceup_gp_ledger_immutable
before update or delete on public.voiceup_gp_ledger
for each row execute function public.voiceup_gp_reject_immutable_change();

create trigger voiceup_gp_referral_edge_immutable
before update or delete on public.voiceup_gp_referral_edges
for each row execute function public.voiceup_gp_reject_immutable_change();

alter table public.voiceup_gp_wallets enable row level security;
alter table public.voiceup_gp_ledger enable row level security;
alter table public.voiceup_gp_referral_edges enable row level security;
alter table public.voiceup_gp_round_state enable row level security;

revoke all on table public.voiceup_gp_wallets from public, anon, authenticated;
revoke all on table public.voiceup_gp_ledger from public, anon, authenticated;
revoke all on table public.voiceup_gp_referral_edges from public, anon, authenticated;
revoke all on table public.voiceup_gp_round_state from public, anon, authenticated;

grant select, insert, update on table public.voiceup_gp_wallets to service_role;
grant select, insert on table public.voiceup_gp_ledger to service_role;
grant select, insert on table public.voiceup_gp_referral_edges to service_role;
grant select, insert, update on table public.voiceup_gp_round_state to service_role;

revoke all on function public.voiceup_gp_reject_immutable_change() from public, anon, authenticated;

commit;
