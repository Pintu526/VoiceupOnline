-- VoiceUp Development customer-journey activation
-- Target project: ravweavcfrpiykfgtmbf (VoiceUp Development)
-- Prohibited project: seseeabxmnsrhghthemd (Production)
-- Source migration: supabase/migrations/20261030010000_participation_email_receipts.sql
-- Source SHA-256: 12C1D7FF39DB08EB74D12346F8CC97BE242403A7794046102FBC156424E532A7
-- Generated: 2026-10-30
--
-- This file is intentionally outside supabase/migrations. It does not alter
-- migration history. Run it as one complete transaction only in the exact
-- Development SQL Editor after these Development Vault entries exist:
--   voiceup_development_project_ref = ravweavcfrpiykfgtmbf
--   voiceup_receipt_worker_secret   = the same >=32-character random value as
--                                      Edge secret VOICEUP_RECEIPT_WORKER_SECRET
--
-- The scheduled request carries only the dedicated worker trigger secret.
-- It never places a service-role key in pg_net or cron metadata.

begin;

do $receipt_activation_preflight$
declare
  configured_project_ref text;
  configured_worker_secret text;
begin
  if to_regnamespace('vault') is null
    or to_regclass('vault.decrypted_secrets') is null
  then
    raise exception 'FAIL receipt activation: Supabase Vault is unavailable.';
  end if;

  select secret.decrypted_secret
    into configured_project_ref
  from vault.decrypted_secrets secret
  where secret.name = 'voiceup_development_project_ref'
  limit 1;

  if configured_project_ref is distinct from 'ravweavcfrpiykfgtmbf' then
    raise exception 'FAIL receipt activation: Development project-ref fence is absent or mismatched.';
  end if;

  select secret.decrypted_secret
    into configured_worker_secret
  from vault.decrypted_secrets secret
  where secret.name = 'voiceup_receipt_worker_secret'
  limit 1;

  if length(coalesce(configured_worker_secret, '')) < 32 then
    raise exception 'FAIL receipt activation: dedicated worker trigger secret is absent or too short.';
  end if;

  if exists (
    select 1
    from vault.decrypted_secrets secret
    where secret.name = 'voiceup_receipt_worker_secret'
      and secret.decrypted_secret in (
        coalesce(current_setting('app.settings.jwt_secret', true), ''),
        coalesce(current_setting('app.settings.service_role_key', true), '')
      )
  ) then
    raise exception 'FAIL receipt activation: worker trigger secret must not reuse a JWT or service-role secret.';
  end if;

  if not exists (
    select 1 from pg_extension extension_info
    where extension_info.extname = 'pg_cron'
  ) or not exists (
    select 1 from pg_extension extension_info
    where extension_info.extname = 'pg_net'
  ) then
    raise exception 'FAIL receipt activation: pg_cron and pg_net must already be enabled in Development.';
  end if;

  if to_regclass('cron.job') is null
    or to_regnamespace('net') is null
    or not exists (
      select 1
      from pg_proc function_info
      join pg_namespace schema_info on schema_info.oid = function_info.pronamespace
      where schema_info.nspname = 'cron'
        and function_info.proname = 'schedule'
    )
    or not exists (
      select 1
      from pg_proc function_info
      join pg_namespace schema_info on schema_info.oid = function_info.pronamespace
      where schema_info.nspname = 'net'
        and function_info.proname = 'http_post'
    )
  then
    raise exception 'FAIL receipt activation: cron.schedule or net.http_post is unavailable.';
  end if;

  if to_regclass('public.voiceup_workspaces') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'voiceup_workspaces'
        and column_name = 'id' and udt_name = 'text'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'voiceup_workspaces'
        and column_name = 'data' and udt_name = 'jsonb'
    )
  then
    raise exception 'FAIL receipt activation: authoritative voiceup_workspaces contract is missing or incompatible.';
  end if;

  if to_regprocedure('auth.role()') is null
    or (
      select count(*) <> 3
      from pg_roles role_info
      where role_info.rolname in ('anon', 'authenticated', 'service_role')
    )
  then
    raise exception 'FAIL receipt activation: required Supabase authorization contracts are unavailable.';
  end if;

  if not exists (
    select 1
    from pg_proc function_info
    where function_info.proname = 'gen_random_uuid'
      and function_info.pronargs = 0
      and function_info.prorettype = 'uuid'::regtype
  ) then
    raise exception 'FAIL receipt activation: gen_random_uuid() is unavailable.';
  end if;

  if exists (
    select 1
    from cron.job scheduled_job
    where scheduled_job.active
      and scheduled_job.command ilike '%voiceup-participation-receipts%'
      and scheduled_job.jobname <> 'voiceup-development-participation-email-receipts'
  ) then
    raise exception 'FAIL receipt activation: another active receipt-worker schedule already exists.';
  end if;
end
$receipt_activation_preflight$;

-- BEGIN reviewed migration body (source hash above)
do $$
begin
  if to_regclass('public.voiceup_workspaces') is null then
    raise exception 'Participation receipt prerequisite failed: public.voiceup_workspaces is missing.';
  end if;
end
$$;

create table if not exists public.voiceup_participation_email_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  supporter_id text not null,
  signing_idempotency_key text not null,
  recipient_email text not null,
  participant_name text not null,
  campaign_title text not null,
  campaign_slug text not null,
  supporter_reference text not null,
  participated_at timestamptz not null,
  campaign_path text not null,
  referral_path text not null,
  qr_path text not null,
  dashboard_login_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  delivered_at timestamptz,
  provider_message_id text,
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, campaign_id, supporter_id),
  unique (workspace_id, signing_idempotency_key),
  check (length(recipient_email) between 3 and 320),
  check (length(participant_name) between 1 and 160),
  check (length(campaign_title) between 1 and 240),
  check (campaign_slug ~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$'),
  check (supporter_reference ~ '^VU-[A-Z0-9]{6,64}$'),
  check (campaign_path ~ '^/c/[a-z0-9][a-z0-9-]{0,119}$'),
  check (referral_path ~ '^/c/[a-z0-9][a-z0-9-]{0,119}\?ref=VU-[A-Z0-9]{6,64}$'),
  check (qr_path ~ '^/r/VU-[A-Z0-9]{6,64}$'),
  check (dashboard_login_path ~ '^/login\?campaign=[a-z0-9][a-z0-9-]{0,119}&campaignId=[A-Za-z0-9._:-]{1,160}$')
);

create index if not exists voiceup_participation_receipts_due_idx
  on public.voiceup_participation_email_receipts (next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');

alter table public.voiceup_participation_email_receipts enable row level security;
revoke all on table public.voiceup_participation_email_receipts from public, anon, authenticated;

create or replace function public.voiceup_enqueue_participation_email_receipt(
  p_workspace_id text,
  p_campaign_id text,
  p_supporter_id text,
  p_signing_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace jsonb;
  v_campaign jsonb;
  v_signer jsonb;
  v_email text;
  v_name text;
  v_slug text;
  v_title text;
  v_reference text;
  v_participated_at timestamptz;
  v_receipt public.voiceup_participation_email_receipts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if length(btrim(coalesce(p_workspace_id, ''))) > 160
    or length(btrim(coalesce(p_campaign_id, ''))) > 160
    or length(btrim(coalesce(p_supporter_id, ''))) > 200
    or length(btrim(coalesce(p_signing_idempotency_key, ''))) not between 12 and 160
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_receipt_scope';
  end if;

  select workspace.data into v_workspace
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id
  for share;
  if v_workspace is null then
    raise exception using errcode = 'P0002', message = 'voiceup:receipt_source_not_found';
  end if;

  select campaign.value into v_campaign
  from jsonb_array_elements(coalesce(v_workspace -> 'campaigns', '[]'::jsonb)) campaign(value)
  where campaign.value ->> 'id' = p_campaign_id
    and campaign.value ->> 'status' = 'Published'
  limit 1;
  select signer.value into v_signer
  from jsonb_array_elements(coalesce(v_workspace -> 'signers', '[]'::jsonb)) signer(value)
  where signer.value ->> 'id' = p_supporter_id
    and signer.value ->> 'campaignId' = p_campaign_id
  limit 1;
  if v_campaign is null or v_signer is null then
    raise exception using errcode = 'P0002', message = 'voiceup:receipt_source_not_found';
  end if;

  v_email := lower(btrim(coalesce(v_signer ->> 'email', '')));
  if v_email = '' then
    return jsonb_build_object('status', 'not_requested');
  end if;
  if length(v_email) > 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_receipt_email';
  end if;

  v_name := left(btrim(coalesce(v_signer ->> 'name', 'Supporter')), 160);
  v_slug := lower(btrim(coalesce(v_campaign ->> 'slug', '')));
  v_title := left(btrim(coalesce(v_campaign ->> 'title', '')), 240);
  v_reference := upper(btrim(coalesce(v_signer ->> 'referralCode', '')));
  if v_name = '' or v_title = ''
    or v_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$'
    or v_reference !~ '^VU-[A-Z0-9]{6,64}$'
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_receipt_content';
  end if;
  begin
    v_participated_at := (v_signer ->> 'signedAt')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'voiceup:invalid_receipt_timestamp';
  end;

  insert into public.voiceup_participation_email_receipts (
    workspace_id, campaign_id, supporter_id, signing_idempotency_key,
    recipient_email, participant_name, campaign_title, campaign_slug,
    supporter_reference, participated_at, campaign_path, referral_path,
    qr_path, dashboard_login_path
  ) values (
    p_workspace_id, p_campaign_id, p_supporter_id, p_signing_idempotency_key,
    v_email, v_name, v_title, v_slug, v_reference, v_participated_at,
    '/c/' || v_slug,
    '/c/' || v_slug || '?ref=' || v_reference,
    '/r/' || v_reference,
    '/login?campaign=' || v_slug || '&campaignId=' || p_campaign_id
  )
  on conflict (workspace_id, campaign_id, supporter_id) do nothing;

  select * into v_receipt
  from public.voiceup_participation_email_receipts receipt
  where receipt.workspace_id = p_workspace_id
    and receipt.campaign_id = p_campaign_id
    and receipt.supporter_id = p_supporter_id;

  return jsonb_build_object(
    'receiptId', v_receipt.id,
    'status', case
      when v_receipt.status = 'sent' then 'sent'
      when v_receipt.status = 'failed' then 'failed'
      else 'queued'
    end
  );
end;
$$;

create or replace function public.voiceup_claim_participation_email_receipts(
  p_receipt_id uuid default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if p_limit < 1 or p_limit > 25 then
    raise exception using errcode = '22023', message = 'voiceup:invalid_receipt_limit';
  end if;

  with candidates as (
    select receipt.id
    from public.voiceup_participation_email_receipts receipt
    where (p_receipt_id is null or receipt.id = p_receipt_id)
      and receipt.attempt_count < 5
      and (
        (receipt.status in ('pending', 'retry') and receipt.next_attempt_at <= now())
        or (receipt.status = 'processing' and receipt.processing_started_at < now() - interval '10 minutes')
      )
    order by receipt.next_attempt_at, receipt.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.voiceup_participation_email_receipts receipt
    set status = 'processing',
        attempt_count = receipt.attempt_count + 1,
        processing_started_at = now(),
        updated_at = now()
    from candidates
    where receipt.id = candidates.id
    returning receipt.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'receiptId', claimed.id,
    'recipientEmail', claimed.recipient_email,
    'participantName', claimed.participant_name,
    'campaignTitle', claimed.campaign_title,
    'supporterReference', claimed.supporter_reference,
    'participatedAt', claimed.participated_at,
    'campaignPath', claimed.campaign_path,
    'referralPath', claimed.referral_path,
    'qrPath', claimed.qr_path,
    'dashboardLoginPath', claimed.dashboard_login_path,
    'attemptCount', claimed.attempt_count
  ) order by claimed.created_at), '[]'::jsonb)
  into v_result
  from claimed;

  return v_result;
end;
$$;

create or replace function public.voiceup_complete_participation_email_receipt(
  p_receipt_id uuid,
  p_delivered boolean,
  p_provider_message_id text default null,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_receipt public.voiceup_participation_email_receipts%rowtype;
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if p_receipt_id is null
    or length(coalesce(p_provider_message_id, '')) > 240
    or length(coalesce(p_failure_code, '')) > 80
    or (not p_delivered and coalesce(p_failure_code, '') !~ '^[a-z0-9_:-]{1,80}$')
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_receipt_result';
  end if;

  select * into v_receipt
  from public.voiceup_participation_email_receipts receipt
  where receipt.id = p_receipt_id
  for update;
  if v_receipt.id is null or v_receipt.status <> 'processing' then
    raise exception using errcode = 'P0002', message = 'voiceup:receipt_not_claimed';
  end if;

  if p_delivered then
    v_status := 'sent';
    update public.voiceup_participation_email_receipts
    set status = 'sent', delivered_at = now(), provider_message_id = nullif(left(p_provider_message_id, 240), ''),
        last_failure_code = null, processing_started_at = null, updated_at = now()
    where id = p_receipt_id;
  elsif v_receipt.attempt_count >= 5 then
    v_status := 'failed';
    update public.voiceup_participation_email_receipts
    set status = 'failed', last_failure_code = p_failure_code,
        processing_started_at = null, updated_at = now()
    where id = p_receipt_id;
  else
    v_status := 'retry';
    update public.voiceup_participation_email_receipts
    set status = 'retry', last_failure_code = p_failure_code,
        next_attempt_at = now() + case v_receipt.attempt_count
          when 1 then interval '2 minutes'
          when 2 then interval '10 minutes'
          when 3 then interval '1 hour'
          else interval '6 hours'
        end,
        processing_started_at = null, updated_at = now()
    where id = p_receipt_id;
  end if;

  return jsonb_build_object('receiptId', p_receipt_id, 'status', v_status);
end;
$$;

revoke all on function public.voiceup_enqueue_participation_email_receipt(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.voiceup_claim_participation_email_receipts(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.voiceup_complete_participation_email_receipt(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.voiceup_enqueue_participation_email_receipt(text, text, text, text)
  to service_role;
grant execute on function public.voiceup_claim_participation_email_receipts(uuid, integer)
  to service_role;
grant execute on function public.voiceup_complete_participation_email_receipt(uuid, boolean, text, text)
  to service_role;

-- END reviewed migration body

-- One named schedule is updated idempotently. The hardcoded URL is the
-- Development function endpoint; the worker secret is resolved only at run time.
select cron.schedule(
  'voiceup-development-participation-email-receipts',
  '*/5 * * * *',
  $worker_schedule$
    select net.http_post(
      url := 'https://ravweavcfrpiykfgtmbf.supabase.co/functions/v1/voiceup-participation-receipts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select secret.decrypted_secret
          from vault.decrypted_secrets secret
          where secret.name = 'voiceup_receipt_worker_secret'
          limit 1
        )
      ),
      body := '{"limit":10}'::jsonb,
      timeout_milliseconds := 15000
    ) as request_id;
  $worker_schedule$
);

do $receipt_activation_verification$
declare
  receipt_table regclass := to_regclass('public.voiceup_participation_email_receipts');
  function_signature text;
  function_oid oid;
  function_definition text;
  scheduled_count integer;
  scheduled_expression text;
  scheduled_command text;
  scheduled_active boolean;
begin
  if receipt_table is null then
    raise exception 'FAIL receipt verification: queue table is missing.';
  end if;

  if not (
    select table_info.relrowsecurity
    from pg_class table_info
    where table_info.oid = receipt_table
  ) then
    raise exception 'FAIL receipt verification: queue RLS is disabled.';
  end if;

  if exists (
    select 1
    from aclexplode(coalesce(
      (select table_info.relacl from pg_class table_info where table_info.oid = receipt_table),
      acldefault('r', (select table_info.relowner from pg_class table_info where table_info.oid = receipt_table))
    )) privilege_info
    where privilege_info.grantee = 0
      and privilege_info.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  )
    or has_table_privilege('anon', receipt_table, 'SELECT')
    or has_table_privilege('anon', receipt_table, 'INSERT')
    or has_table_privilege('anon', receipt_table, 'UPDATE')
    or has_table_privilege('anon', receipt_table, 'DELETE')
    or has_table_privilege('anon', receipt_table, 'TRUNCATE')
    or has_table_privilege('authenticated', receipt_table, 'SELECT')
    or has_table_privilege('authenticated', receipt_table, 'INSERT')
    or has_table_privilege('authenticated', receipt_table, 'UPDATE')
    or has_table_privilege('authenticated', receipt_table, 'DELETE')
    or has_table_privilege('authenticated', receipt_table, 'TRUNCATE')
  then
    raise exception 'FAIL receipt verification: browser or PUBLIC queue access is present.';
  end if;

  if not exists (
    select 1 from pg_constraint constraint_info
    where constraint_info.conrelid = receipt_table
      and constraint_info.contype = 'u'
      and pg_get_constraintdef(constraint_info.oid)
        = 'UNIQUE (workspace_id, campaign_id, supporter_id)'
  ) or not exists (
    select 1 from pg_constraint constraint_info
    where constraint_info.conrelid = receipt_table
      and constraint_info.contype = 'u'
      and pg_get_constraintdef(constraint_info.oid)
        = 'UNIQUE (workspace_id, signing_idempotency_key)'
  ) then
    raise exception 'FAIL receipt verification: duplicate-prevention constraints are missing.';
  end if;

  if not exists (
    select 1 from pg_constraint constraint_info
    where constraint_info.conrelid = receipt_table
      and constraint_info.contype = 'f'
      and pg_get_constraintdef(constraint_info.oid) like
        'FOREIGN KEY (workspace_id) REFERENCES %voiceup_workspaces(id) ON DELETE CASCADE'
  ) then
    raise exception 'FAIL receipt verification: workspace ownership foreign key is missing.';
  end if;

  foreach function_signature in array array[
    'public.voiceup_enqueue_participation_email_receipt(text,text,text,text)',
    'public.voiceup_claim_participation_email_receipts(uuid,integer)',
    'public.voiceup_complete_participation_email_receipt(uuid,boolean,text,text)'
  ]
  loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise exception 'FAIL receipt verification: required RPC % is missing.', function_signature;
    end if;

    select pg_get_functiondef(function_oid)
      into function_definition;

    if not (
      select function_info.prosecdef
      from pg_proc function_info
      where function_info.oid = function_oid
    ) or not (
      select coalesce(array_to_string(function_info.proconfig, ','), '')
        like '%search_path=public, pg_temp%'
      from pg_proc function_info
      where function_info.oid = function_oid
    ) then
      raise exception 'FAIL receipt verification: % is not a hardened SECURITY DEFINER.', function_signature;
    end if;

    if position('voiceup:service_role_required' in function_definition) = 0
      or not has_function_privilege('service_role', function_oid, 'EXECUTE')
      or has_function_privilege('anon', function_oid, 'EXECUTE')
      or has_function_privilege('authenticated', function_oid, 'EXECUTE')
      or exists (
        select 1
        from pg_proc function_info,
          lateral aclexplode(coalesce(
            function_info.proacl,
            acldefault('f', function_info.proowner)
          )) privilege_info
        where function_info.oid = function_oid
          and privilege_info.grantee = 0
          and privilege_info.privilege_type = 'EXECUTE'
      )
    then
      raise exception 'FAIL receipt verification: % execution boundary is unsafe.', function_signature;
    end if;
  end loop;

  function_definition := pg_get_functiondef(
    to_regprocedure('public.voiceup_enqueue_participation_email_receipt(text,text,text,text)')
  );
  if position('v_signer ->> ''email''' in function_definition) = 0
    or position('v_signer ->> ''name''' in function_definition) = 0
    or position('v_signer ->> ''signedAt''' in function_definition) = 0
    or position('v_signer ->> ''referralCode''' in function_definition) = 0
    or position('campaign.value ->> ''status'' = ''Published''' in function_definition) = 0
  then
    raise exception 'FAIL receipt verification: recipient/content is not derived from canonical participation.';
  end if;

  select count(*)
    into scheduled_count
  from cron.job scheduled_job
  where scheduled_job.jobname = 'voiceup-development-participation-email-receipts';

  if scheduled_count <> 1 then
    raise exception 'FAIL receipt verification: exactly one named retry schedule is required.';
  end if;

  select scheduled_job.schedule, scheduled_job.command, scheduled_job.active
    into scheduled_expression, scheduled_command, scheduled_active
  from cron.job scheduled_job
  where scheduled_job.jobname = 'voiceup-development-participation-email-receipts';

  if scheduled_expression <> '*/5 * * * *'
    or not scheduled_active
    or position(
      'https://ravweavcfrpiykfgtmbf.supabase.co/functions/v1/voiceup-participation-receipts'
      in scheduled_command
    ) = 0
    or position('voiceup_receipt_worker_secret' in scheduled_command) = 0
    or position('Authorization' in scheduled_command) = 0
    or position('seseeabxmnsrhghthemd' in scheduled_command) > 0
  then
    raise exception 'FAIL receipt verification: retry schedule is not fenced and authenticated for Development.';
  end if;
end
$receipt_activation_verification$;

select
  'PASS'::text as activation_status,
  'ravweavcfrpiykfgtmbf'::text as development_project_ref,
  'voiceup-development-participation-email-receipts'::text as retry_job,
  'service-role-only queue RPCs; dedicated authenticated worker trigger'::text as security_boundary;

commit;

