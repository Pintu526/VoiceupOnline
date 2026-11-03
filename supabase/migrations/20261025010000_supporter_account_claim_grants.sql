begin;

create extension if not exists pgcrypto;

-- The activation timestamp is intentionally created at migration execution time.
-- Signing transactions completed before this point are legacy records and cannot
-- receive a claim grant through this contract.
create table if not exists public.voiceup_supporter_claim_contract (
  singleton boolean primary key default true check (singleton),
  enabled_at timestamptz not null default now()
);

insert into public.voiceup_supporter_claim_contract (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.voiceup_supporter_account_claim_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  supporter_id text not null,
  signing_proof_hash text not null unique check (length(signing_proof_hash) = 64),
  token_hash text not null unique check (length(token_hash) = 64),
  email_hash text not null check (length(email_hash) = 64),
  signing_completed_at timestamptz not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  unique (workspace_id, campaign_id, supporter_id),
  check (expires_at > issued_at),
  check ((consumed_at is null and consumed_by is null) or (consumed_at is not null and consumed_by is not null))
);

create table if not exists public.voiceup_supporter_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  supporter_id text not null,
  claim_grant_id uuid not null unique
    references public.voiceup_supporter_account_claim_grants(id) on delete restrict,
  claimed_at timestamptz not null default now(),
  unique (workspace_id, campaign_id, supporter_id)
);

create index if not exists voiceup_supporter_accounts_auth_user_id_idx
  on public.voiceup_supporter_accounts (auth_user_id);

create index if not exists voiceup_supporter_claim_grants_expiry_idx
  on public.voiceup_supporter_account_claim_grants (expires_at)
  where consumed_at is null and revoked_at is null;

alter table public.voiceup_supporter_claim_contract enable row level security;
alter table public.voiceup_supporter_account_claim_grants enable row level security;
alter table public.voiceup_supporter_accounts enable row level security;

drop policy if exists "Supporter account owners read own mappings"
  on public.voiceup_supporter_accounts;

create policy "Supporter account owners read own mappings"
  on public.voiceup_supporter_accounts
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- Grant internals are never client-readable. Authenticated users can read only
-- their completed ownership mapping; all writes go through the claim function.
revoke all on table public.voiceup_supporter_claim_contract from public, anon, authenticated;
revoke all on table public.voiceup_supporter_account_claim_grants from public, anon, authenticated;
revoke all on table public.voiceup_supporter_accounts from public, anon, authenticated;
grant select on table public.voiceup_supporter_accounts to authenticated;

create or replace function public.voiceup_issue_supporter_account_claim_grant(
  p_workspace_id text,
  p_campaign_id text,
  p_supporter_id text,
  p_signing_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_enabled_at timestamptz;
  v_workspace_data jsonb;
  v_signer jsonb;
  v_signer_count bigint;
  v_history jsonb;
  v_signing_completed_at timestamptz;
  v_normalized_email text;
  v_email_hash text;
  v_signing_proof_hash text;
  v_token text;
  v_token_hash text;
  v_grant public.voiceup_supporter_account_claim_grants%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;

  if nullif(btrim(p_workspace_id), '') is null
    or nullif(btrim(p_campaign_id), '') is null
    or nullif(btrim(p_supporter_id), '') is null
    or nullif(btrim(p_signing_idempotency_key), '') is null
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_claim_grant_request';
  end if;

  select contract.enabled_at
    into v_enabled_at
  from public.voiceup_supporter_claim_contract contract
  where contract.singleton = true;

  select workspace.data
    into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'voiceup:invalid_claim_grant_request';
  end if;

  select count(*), (jsonb_agg(signer) -> 0)
    into v_signer_count, v_signer
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and signer ->> 'id' = p_supporter_id;

  if v_signer_count <> 1
    or not (
      coalesce(v_signer ->> 'supportSubmittedAt', '') <> ''
      or (
        v_signer ->> 'source' = 'online'
        and v_signer ->> 'status' = 'verified'
        and coalesce(v_signer ->> 'signedAt', '') <> ''
      )
    )
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_claim_grant_request';
  end if;

  select history
    into v_history
  from jsonb_array_elements(
    coalesce(v_workspace_data -> 'publicParticipationIdempotency', '[]'::jsonb)
  ) history
  where history ->> 'key' = p_signing_idempotency_key
    and history ->> 'campaignId' = p_campaign_id
    and history ->> 'action' = 'submit_support'
    and history #>> '{result,signer,id}' = p_supporter_id
  limit 1;

  if v_history is null then
    raise exception using errcode = '22023', message = 'voiceup:invalid_claim_grant_request';
  end if;

  begin
    v_signing_completed_at := (v_history ->> 'createdAt')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'voiceup:invalid_claim_grant_request';
  end;

  if v_enabled_at is null or v_signing_completed_at < v_enabled_at then
    raise exception using errcode = '42501', message = 'voiceup:legacy_supporter_unclaimable';
  end if;

  v_normalized_email := lower(btrim(coalesce(v_signer ->> 'email', '')));
  if length(v_normalized_email) > 254
    or v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using errcode = '22023', message = 'voiceup:claim_email_unavailable';
  end if;

  if exists (
    select 1
    from public.voiceup_supporter_accounts account
    where account.workspace_id = p_workspace_id
      and account.campaign_id = p_campaign_id
      and account.supporter_id = p_supporter_id
  ) then
    return jsonb_build_object('issued', false, 'code', 'supporter_already_claimed');
  end if;

  v_email_hash := encode(digest(v_normalized_email, 'sha256'), 'hex');
  v_signing_proof_hash := encode(digest(
    p_workspace_id || ':' || p_campaign_id || ':' || p_signing_idempotency_key,
    'sha256'
  ), 'hex');
  v_token := 'vusc_' || encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  select grant_row.*
    into v_grant
  from public.voiceup_supporter_account_claim_grants grant_row
  where grant_row.workspace_id = p_workspace_id
    and grant_row.campaign_id = p_campaign_id
    and grant_row.supporter_id = p_supporter_id
  for update;

  if found then
    if v_grant.consumed_at is not null then
      return jsonb_build_object('issued', false, 'code', 'supporter_already_claimed');
    end if;

    update public.voiceup_supporter_account_claim_grants
    set signing_proof_hash = v_signing_proof_hash,
        token_hash = v_token_hash,
        email_hash = v_email_hash,
        signing_completed_at = v_signing_completed_at,
        issued_at = v_now,
        expires_at = v_now + interval '24 hours',
        consumed_at = null,
        consumed_by = null,
        revoked_at = null
    where id = v_grant.id;
  else
    insert into public.voiceup_supporter_account_claim_grants (
      workspace_id,
      campaign_id,
      supporter_id,
      signing_proof_hash,
      token_hash,
      email_hash,
      signing_completed_at,
      issued_at,
      expires_at
    ) values (
      p_workspace_id,
      p_campaign_id,
      p_supporter_id,
      v_signing_proof_hash,
      v_token_hash,
      v_email_hash,
      v_signing_completed_at,
      v_now,
      v_now + interval '24 hours'
    );
  end if;

  return jsonb_build_object(
    'issued', true,
    'token', v_token,
    'expiresAt', v_now + interval '24 hours'
  );
end;
$$;

create or replace function public.voiceup_claim_supporter_account(
  p_claim_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_actor_id uuid := auth.uid();
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_token_hash text;
  v_grant public.voiceup_supporter_account_claim_grants%rowtype;
  v_workspace_data jsonb;
  v_signer jsonb;
  v_signer_count bigint;
  v_signer_email_hash text;
  v_account_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;

  select lower(btrim(coalesce(users.email, ''))), users.email_confirmed_at
    into v_auth_email, v_email_confirmed_at
  from auth.users users
  where users.id = v_actor_id
    and users.deleted_at is null;

  if not found or v_email_confirmed_at is null or v_auth_email = '' then
    raise exception using errcode = '28000', message = 'voiceup:verified_email_required';
  end if;

  if coalesce(p_claim_token, '') !~ '^vusc_[0-9a-f]{64}$' then
    raise exception using errcode = '28000', message = 'voiceup:claim_grant_invalid';
  end if;

  v_token_hash := encode(digest(p_claim_token, 'sha256'), 'hex');
  select grant_row.*
    into v_grant
  from public.voiceup_supporter_account_claim_grants grant_row
  where grant_row.token_hash = v_token_hash
  for update;

  if not found
    or v_grant.consumed_at is not null
    or v_grant.revoked_at is not null
    or v_grant.expires_at <= v_now
    or v_grant.email_hash <> encode(digest(v_auth_email, 'sha256'), 'hex')
  then
    raise exception using errcode = '28000', message = 'voiceup:claim_grant_invalid';
  end if;

  select workspace.data
    into v_workspace_data
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

  if v_signer_count <> 1 then
    raise exception using errcode = '28000', message = 'voiceup:claim_grant_invalid';
  end if;

  v_signer_email_hash := encode(digest(
    lower(btrim(coalesce(v_signer ->> 'email', ''))),
    'sha256'
  ), 'hex');

  if v_signer_email_hash <> v_grant.email_hash
    or not (
      coalesce(v_signer ->> 'supportSubmittedAt', '') <> ''
      or (
        v_signer ->> 'source' = 'online'
        and v_signer ->> 'status' = 'verified'
        and coalesce(v_signer ->> 'signedAt', '') <> ''
      )
    )
  then
    raise exception using errcode = '28000', message = 'voiceup:claim_grant_invalid';
  end if;

  begin
    insert into public.voiceup_supporter_accounts (
      auth_user_id,
      workspace_id,
      campaign_id,
      supporter_id,
      claim_grant_id,
      claimed_at
    ) values (
      v_actor_id,
      v_grant.workspace_id,
      v_grant.campaign_id,
      v_grant.supporter_id,
      v_grant.id,
      v_now
    )
    returning id into v_account_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'voiceup:supporter_already_claimed';
  end;

  update public.voiceup_supporter_account_claim_grants
  set consumed_at = v_now,
      consumed_by = v_actor_id
  where id = v_grant.id
    and consumed_at is null
    and revoked_at is null;

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
$$;

revoke all on function public.voiceup_issue_supporter_account_claim_grant(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.voiceup_issue_supporter_account_claim_grant(text, text, text, text)
  to service_role;

revoke all on function public.voiceup_claim_supporter_account(text)
  from public, anon, service_role;
grant execute on function public.voiceup_claim_supporter_account(text)
  to authenticated;

comment on table public.voiceup_supporter_accounts is
  'Owner-only mapping from a confirmed Supabase Auth user to one canonical supporter record.';
comment on table public.voiceup_supporter_account_claim_grants is
  'Hashed, expiring, single-use grants issued only from post-activation server-recorded signing transactions.';
comment on function public.voiceup_claim_supporter_account(text) is
  'Consumes only an opaque grant token; derives identity and confirmed email from auth.uid() and auth.users.';

notify pgrst, 'reload schema';

commit;
