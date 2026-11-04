begin;

create extension if not exists pgcrypto;

alter table public.voiceup_supporter_account_claim_grants
  add column if not exists claim_kind text not null default 'fresh_signing';

do $claim_kind_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'voiceup_supporter_claim_grants_kind_check'
      and conrelid = 'public.voiceup_supporter_account_claim_grants'::regclass
  ) then
    alter table public.voiceup_supporter_account_claim_grants
      add constraint voiceup_supporter_claim_grants_kind_check
      check (claim_kind in ('fresh_signing', 'historical_verified_email'));
  end if;
end
$claim_kind_constraint$;

-- Opaque, short-lived routing records let the public campaign perform a
-- privacy-neutral mobile precheck. Raw mobile numbers are never persisted.
create table if not exists public.voiceup_supporter_routing_prechecks (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  token_hash text not null unique check (length(token_hash) = 64),
  phone_hash text not null check (length(phone_hash) = 64),
  client_hash text not null check (length(client_hash) = 64),
  matched_supporter_id text,
  matched_count integer not null default 0 check (matched_count >= 0),
  internal_route text not null check (internal_route in (
    'new_number', 'existing_account', 'historical_signature', 'ambiguous'
  )),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  check (expires_at > created_at)
);

create index if not exists voiceup_supporter_routing_prechecks_client_rate_idx
  on public.voiceup_supporter_routing_prechecks (client_hash, created_at desc);
create index if not exists voiceup_supporter_routing_prechecks_phone_rate_idx
  on public.voiceup_supporter_routing_prechecks (phone_hash, created_at desc);
create index if not exists voiceup_supporter_routing_prechecks_expiry_idx
  on public.voiceup_supporter_routing_prechecks (expires_at);

create table if not exists public.voiceup_supporter_routing_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  precheck_id uuid references public.voiceup_supporter_routing_prechecks(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'precheck_created', 'authenticated_resolution', 'historical_claim_grant_issued'
  )),
  outcome text not null,
  created_at timestamptz not null default now()
);

create index if not exists voiceup_supporter_routing_audit_scope_idx
  on public.voiceup_supporter_routing_audit (workspace_id, campaign_id, created_at desc);

alter table public.voiceup_supporter_routing_prechecks enable row level security;
alter table public.voiceup_supporter_routing_audit enable row level security;
revoke all on table public.voiceup_supporter_routing_prechecks from public, anon, authenticated;
revoke all on table public.voiceup_supporter_routing_audit from public, anon, authenticated;

create or replace function public.voiceup_create_supporter_routing_precheck(
  p_workspace_id text,
  p_campaign_id text,
  p_phone text,
  p_client_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_now timestamptz := now();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone_hash text;
  v_workspace_data jsonb;
  v_match_count integer := 0;
  v_supporter_id text;
  v_internal_route text;
  v_token text;
  v_token_hash text;
  v_precheck_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if v_phone ~ '^0[6-9][0-9]{9}$' then v_phone := substr(v_phone, 2); end if;
  if v_phone ~ '^91[6-9][0-9]{9}$' then v_phone := substr(v_phone, 3); end if;
  if v_phone !~ '^[0-9]{8,15}$'
    or coalesce(p_client_hash, '') !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_routing_precheck';
  end if;

  select workspace.data into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id;
  if not found then
    raise exception using errcode = '22023', message = 'voiceup:invalid_routing_precheck';
  end if;

  v_phone_hash := encode(digest(v_phone, 'sha256'), 'hex');
  if (select count(*) from public.voiceup_supporter_routing_prechecks item
      where item.client_hash = p_client_hash and item.created_at > v_now - interval '10 minutes') >= 20
    or (select count(*) from public.voiceup_supporter_routing_prechecks item
      where item.phone_hash = v_phone_hash and item.created_at > v_now - interval '10 minutes') >= 5
  then
    raise exception using errcode = 'P0001', message = 'voiceup:routing_rate_limited';
  end if;

  select count(*)::integer, min(signer ->> 'id')
    into v_match_count, v_supporter_id
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and encode(digest(
      case
        when regexp_replace(coalesce(signer ->> 'phone', ''), '[^0-9]', '', 'g') ~ '^0[6-9][0-9]{9}$'
          then substr(regexp_replace(signer ->> 'phone', '[^0-9]', '', 'g'), 2)
        when regexp_replace(coalesce(signer ->> 'phone', ''), '[^0-9]', '', 'g') ~ '^91[6-9][0-9]{9}$'
          then substr(regexp_replace(signer ->> 'phone', '[^0-9]', '', 'g'), 3)
        else regexp_replace(coalesce(signer ->> 'phone', ''), '[^0-9]', '', 'g')
      end,
      'sha256'
    ), 'hex') = v_phone_hash;

  if v_match_count = 0 then
    v_internal_route := 'new_number';
    v_supporter_id := null;
  elsif v_match_count > 1 then
    v_internal_route := 'ambiguous';
    v_supporter_id := null;
  elsif exists (
    select 1 from public.voiceup_supporter_accounts account
    where account.workspace_id = p_workspace_id
      and account.campaign_id = p_campaign_id
      and account.supporter_id = v_supporter_id
  ) then
    v_internal_route := 'existing_account';
  else
    v_internal_route := 'historical_signature';
  end if;

  v_token := 'vusr_' || encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  insert into public.voiceup_supporter_routing_prechecks (
    workspace_id, campaign_id, token_hash, phone_hash, client_hash,
    matched_supporter_id, matched_count, internal_route, expires_at
  ) values (
    p_workspace_id, p_campaign_id, v_token_hash, v_phone_hash, p_client_hash,
    v_supporter_id, v_match_count, v_internal_route, v_now + interval '15 minutes'
  ) returning id into v_precheck_id;

  insert into public.voiceup_supporter_routing_audit (
    workspace_id, campaign_id, precheck_id, event_type, outcome
  ) values (p_workspace_id, p_campaign_id, v_precheck_id, 'precheck_created', 'neutral_response');

  -- Deliberately identical for every internal route.
  return jsonb_build_object(
    'ok', true,
    'routingToken', v_token,
    'expiresAt', v_now + interval '15 minutes'
  );
end;
$function$;

create or replace function public.voiceup_resolve_authenticated_supporter_routing(
  p_workspace_id text,
  p_campaign_id text,
  p_routing_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
declare
  v_now timestamptz := now();
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_email_confirmed_at timestamptz;
  v_precheck public.voiceup_supporter_routing_prechecks%rowtype;
  v_workspace_data jsonb;
  v_signer jsonb;
  v_account public.voiceup_supporter_accounts%rowtype;
  v_signer_email_hash text;
  v_token text;
  v_grant public.voiceup_supporter_account_claim_grants%rowtype;
  v_completed_at timestamptz;
  v_outcome text;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;
  select lower(btrim(coalesce(users.email, ''))), users.email_confirmed_at
    into v_actor_email, v_email_confirmed_at
  from auth.users users
  where users.id = v_actor_id and users.deleted_at is null;
  if not found or v_actor_email = '' or v_email_confirmed_at is null then
    raise exception using errcode = '28000', message = 'voiceup:verified_email_required';
  end if;
  if coalesce(p_routing_token, '') !~ '^vusr_[0-9a-f]{64}$' then
    raise exception using errcode = '28000', message = 'voiceup:routing_token_invalid';
  end if;

  select item.* into v_precheck
  from public.voiceup_supporter_routing_prechecks item
  where item.token_hash = encode(digest(p_routing_token, 'sha256'), 'hex')
    and item.workspace_id = p_workspace_id
    and item.campaign_id = p_campaign_id
  for update;
  if not found or v_precheck.expires_at <= v_now
    or (v_precheck.resolved_by is not null and v_precheck.resolved_by <> v_actor_id)
  then
    raise exception using errcode = '28000', message = 'voiceup:routing_token_invalid';
  end if;

  update public.voiceup_supporter_routing_prechecks
  set resolved_at = v_now, resolved_by = v_actor_id
  where id = v_precheck.id;

  if v_precheck.internal_route = 'new_number' then
    v_outcome := 'eligible_to_sign';
    insert into public.voiceup_supporter_routing_audit
      (workspace_id, campaign_id, precheck_id, actor_id, event_type, outcome)
    values (p_workspace_id, p_campaign_id, v_precheck.id, v_actor_id, 'authenticated_resolution', v_outcome);
    return jsonb_build_object('ok', true, 'route', v_outcome);
  end if;

  if v_precheck.internal_route = 'ambiguous' or v_precheck.matched_supporter_id is null then
    v_outcome := 'identity_not_linked';
    insert into public.voiceup_supporter_routing_audit
      (workspace_id, campaign_id, precheck_id, actor_id, event_type, outcome)
    values (p_workspace_id, p_campaign_id, v_precheck.id, v_actor_id, 'authenticated_resolution', v_outcome);
    return jsonb_build_object('ok', true, 'route', v_outcome);
  end if;

  select account.* into v_account
  from public.voiceup_supporter_accounts account
  where account.workspace_id = p_workspace_id
    and account.campaign_id = p_campaign_id
    and account.supporter_id = v_precheck.matched_supporter_id;
  if found then
    v_outcome := case when v_account.auth_user_id = v_actor_id
      then 'existing_participation' else 'identity_not_linked' end;
    insert into public.voiceup_supporter_routing_audit
      (workspace_id, campaign_id, precheck_id, actor_id, event_type, outcome)
    values (p_workspace_id, p_campaign_id, v_precheck.id, v_actor_id, 'authenticated_resolution', v_outcome);
    return case when v_outcome = 'existing_participation'
      then jsonb_build_object('ok', true, 'route', v_outcome, 'accountId', v_account.id)
      else jsonb_build_object('ok', true, 'route', v_outcome) end;
  end if;

  select workspace.data into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id
  for update;
  select signer into v_signer
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and signer ->> 'id' = v_precheck.matched_supporter_id
  limit 1;

  v_signer_email_hash := encode(digest(lower(btrim(coalesce(v_signer ->> 'email', ''))), 'sha256'), 'hex');
  if v_signer is null
    or v_signer_email_hash <> encode(digest(v_actor_email, 'sha256'), 'hex')
    or not (
      coalesce(v_signer ->> 'supportSubmittedAt', '') <> ''
      or coalesce(v_signer ->> 'signedAt', '') <> ''
    )
  then
    v_outcome := 'identity_not_linked';
    insert into public.voiceup_supporter_routing_audit
      (workspace_id, campaign_id, precheck_id, actor_id, event_type, outcome)
    values (p_workspace_id, p_campaign_id, v_precheck.id, v_actor_id, 'authenticated_resolution', v_outcome);
    return jsonb_build_object('ok', true, 'route', v_outcome);
  end if;

  begin
    v_completed_at := coalesce(
      nullif(v_signer ->> 'supportSubmittedAt', '')::timestamptz,
      nullif(v_signer ->> 'signedAt', '')::timestamptz
    );
  exception when others then
    v_completed_at := null;
  end;
  if v_completed_at is null then
    return jsonb_build_object('ok', true, 'route', 'identity_not_linked');
  end if;

  v_token := 'vusc_' || encode(gen_random_bytes(32), 'hex');
  select grant_row.* into v_grant
  from public.voiceup_supporter_account_claim_grants grant_row
  where grant_row.workspace_id = p_workspace_id
    and grant_row.campaign_id = p_campaign_id
    and grant_row.supporter_id = v_precheck.matched_supporter_id
  for update;
  if found then
    if v_grant.consumed_at is not null then
      return jsonb_build_object('ok', true, 'route', 'identity_not_linked');
    end if;
    update public.voiceup_supporter_account_claim_grants
    set signing_proof_hash = encode(digest(
          'historical:' || p_workspace_id || ':' || p_campaign_id || ':' || v_precheck.matched_supporter_id,
          'sha256'
        ), 'hex'),
        token_hash = encode(digest(v_token, 'sha256'), 'hex'),
        email_hash = encode(digest(v_actor_email, 'sha256'), 'hex'),
        signing_completed_at = v_completed_at,
        claim_kind = 'historical_verified_email',
        issued_at = v_now,
        expires_at = v_now + interval '24 hours',
        revoked_at = null
    where id = v_grant.id;
  else
    insert into public.voiceup_supporter_account_claim_grants (
      workspace_id, campaign_id, supporter_id, signing_proof_hash, token_hash,
      email_hash, signing_completed_at, issued_at, expires_at, claim_kind
    ) values (
      p_workspace_id, p_campaign_id, v_precheck.matched_supporter_id,
      encode(digest('historical:' || p_workspace_id || ':' || p_campaign_id || ':' || v_precheck.matched_supporter_id, 'sha256'), 'hex'),
      encode(digest(v_token, 'sha256'), 'hex'),
      encode(digest(v_actor_email, 'sha256'), 'hex'),
      v_completed_at, v_now, v_now + interval '24 hours', 'historical_verified_email'
    );
  end if;

  insert into public.voiceup_supporter_routing_audit
    (workspace_id, campaign_id, precheck_id, actor_id, event_type, outcome)
  values (p_workspace_id, p_campaign_id, v_precheck.id, v_actor_id, 'historical_claim_grant_issued', 'claim_available');
  return jsonb_build_object(
    'ok', true,
    'route', 'claim_available',
    'claimGrant', jsonb_build_object('token', v_token, 'expiresAt', v_now + interval '24 hours')
  );
end;
$function$;

create or replace function public.voiceup_claim_historical_supporter_account(
  p_claim_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
declare
  v_now timestamptz := now();
  v_actor_id uuid := auth.uid();
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_grant public.voiceup_supporter_account_claim_grants%rowtype;
  v_workspace_data jsonb;
  v_signer jsonb;
  v_signer_count bigint;
  v_account_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;
  select lower(btrim(coalesce(users.email, ''))), users.email_confirmed_at
    into v_auth_email, v_email_confirmed_at
  from auth.users users
  where users.id = v_actor_id and users.deleted_at is null;
  if not found or v_auth_email = '' or v_email_confirmed_at is null then
    raise exception using errcode = '28000', message = 'voiceup:verified_email_required';
  end if;
  if coalesce(p_claim_token, '') !~ '^vusc_[0-9a-f]{64}$' then
    raise exception using errcode = '28000', message = 'voiceup:claim_grant_invalid';
  end if;

  select grant_row.* into v_grant
  from public.voiceup_supporter_account_claim_grants grant_row
  where grant_row.token_hash = encode(digest(p_claim_token, 'sha256'), 'hex')
  for update;
  if not found
    or v_grant.claim_kind <> 'historical_verified_email'
    or v_grant.consumed_at is not null
    or v_grant.revoked_at is not null
    or v_grant.expires_at <= v_now
    or v_grant.email_hash <> encode(digest(v_auth_email, 'sha256'), 'hex')
  then
    raise exception using errcode = '28000', message = 'voiceup:claim_grant_invalid';
  end if;

  select workspace.data into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = v_grant.workspace_id
  for update;
  if not found then
    raise exception using errcode = '28000', message = 'voiceup:claim_grant_invalid';
  end if;

  select count(*), (jsonb_agg(signer) -> 0)
    into v_signer_count, v_signer
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = v_grant.campaign_id
    and signer ->> 'id' = v_grant.supporter_id;
  if v_signer_count <> 1
    or encode(digest(lower(btrim(coalesce(v_signer ->> 'email', ''))), 'sha256'), 'hex') <> v_grant.email_hash
    or coalesce(v_signer ->> 'status', '') <> 'verified'
    or not (
      coalesce(v_signer ->> 'supportSubmittedAt', '') <> ''
      or coalesce(v_signer ->> 'signedAt', '') <> ''
    )
  then
    raise exception using errcode = '28000', message = 'voiceup:claim_grant_invalid';
  end if;

  begin
    insert into public.voiceup_supporter_accounts (
      auth_user_id, workspace_id, campaign_id, supporter_id, claim_grant_id, claimed_at
    ) values (
      v_actor_id, v_grant.workspace_id, v_grant.campaign_id,
      v_grant.supporter_id, v_grant.id, v_now
    ) returning id into v_account_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'voiceup:supporter_already_claimed';
  end;

  update public.voiceup_supporter_account_claim_grants
  set consumed_at = v_now, consumed_by = v_actor_id
  where id = v_grant.id and consumed_at is null and revoked_at is null;
  if not found then
    raise exception using errcode = '40001', message = 'voiceup:claim_grant_already_consumed';
  end if;

  return jsonb_build_object(
    'claimed', true,
    'accountId', v_account_id,
    'workspaceId', v_grant.workspace_id,
    'campaignId', v_grant.campaign_id,
    'supporterId', v_grant.supporter_id,
    'claimedAt', v_now
  );
end;
$function$;

revoke all on function public.voiceup_create_supporter_routing_precheck(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.voiceup_create_supporter_routing_precheck(text, text, text, text)
  to service_role;

revoke all on function public.voiceup_resolve_authenticated_supporter_routing(text, text, text)
  from public, anon, service_role;
grant execute on function public.voiceup_resolve_authenticated_supporter_routing(text, text, text)
  to authenticated;

revoke all on function public.voiceup_claim_historical_supporter_account(text)
  from public, anon, service_role;
grant execute on function public.voiceup_claim_historical_supporter_account(text)
  to authenticated;

comment on function public.voiceup_create_supporter_routing_precheck(text, text, text, text) is
  'Creates a rate-limited opaque mobile routing token and returns no account or participation existence signal.';
comment on function public.voiceup_resolve_authenticated_supporter_routing(text, text, text) is
  'Resolves only auth.uid()-owned participation or a verified-email historical claim; phone input alone is never identity proof.';
comment on function public.voiceup_claim_historical_supporter_account(text) is
  'Consumes a historical verified-email grant into the existing canonical supporter ownership mapping without creating a replacement signature.';

notify pgrst, 'reload schema';

commit;
