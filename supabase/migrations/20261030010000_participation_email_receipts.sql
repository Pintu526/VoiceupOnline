begin;

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

commit;
