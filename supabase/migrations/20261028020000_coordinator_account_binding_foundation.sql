begin;

-- One confirmed Auth account may own at most one live coordinator identity in a
-- workspace. The same person may still coordinate in separate workspaces.
create unique index if not exists voiceup_coordinators_workspace_auth_user_unique_idx
  on public.voiceup_coordinators (workspace_id, auth_user_id)
  where auth_user_id is not null and deleted_at is null;

-- Binding is deliberately separate from coordinator authorization. A grant is
-- an expiring bearer proof issued by an existing network manager; consuming it
-- only fills voiceup_coordinators.auth_user_id and grants no workspace role.
create table if not exists public.voiceup_coordinator_account_binding_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  coordinator_id uuid not null references public.voiceup_coordinators(id) on delete cascade,
  coordinator_version integer not null check (coordinator_version > 0),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  issued_by_user_id uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_user_id uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete restrict,
  check (expires_at > issued_at),
  check (
    (consumed_at is null and consumed_by_user_id is null)
    or (consumed_at is not null and consumed_by_user_id is not null)
  ),
  check (
    (revoked_at is null and revoked_by_user_id is null)
    or (revoked_at is not null and revoked_by_user_id is not null)
  ),
  check (not (consumed_at is not null and revoked_at is not null))
);

create unique index if not exists voiceup_coordinator_binding_grants_open_unique_idx
  on public.voiceup_coordinator_account_binding_grants (workspace_id, coordinator_id)
  where consumed_at is null and revoked_at is null;

create index if not exists voiceup_coordinator_binding_grants_expiry_idx
  on public.voiceup_coordinator_account_binding_grants (expires_at)
  where consumed_at is null and revoked_at is null;

alter table public.voiceup_coordinator_account_binding_grants enable row level security;

-- Grant internals, including token hashes, are RPC-only.
revoke all on table public.voiceup_coordinator_account_binding_grants
  from public, anon, authenticated;

create or replace function public.voiceup_issue_coordinator_account_binding(
  p_workspace_id text,
  p_coordinator_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_coordinator public.voiceup_coordinators%rowtype;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz := v_now + interval '30 minutes';
begin
  if v_actor_id is null
    or not public.voiceup_can_manage_coordinator_network(p_workspace_id)
  then
    raise exception using errcode = '42501', message = 'voiceup:coordinator_binding_not_authorized';
  end if;

  select coordinator.*
    into v_coordinator
  from public.voiceup_coordinators coordinator
  where coordinator.id = p_coordinator_id
    and coordinator.workspace_id = p_workspace_id
    and coordinator.deleted_at is null
  for update;

  if not found
    or v_coordinator.status <> 'active'
    or v_coordinator.mobile_verified_at is null
  then
    raise exception using errcode = '22023', message = 'voiceup:coordinator_binding_unavailable';
  end if;

  if v_coordinator.auth_user_id is not null then
    return jsonb_build_object('issued', false, 'code', 'coordinator_already_bound');
  end if;

  -- Reissuing is the revocation path for an unused or expired grant. The raw
  -- predecessor token is never stored and cannot become valid again.
  update public.voiceup_coordinator_account_binding_grants binding_grant
  set revoked_at = v_now,
      revoked_by_user_id = v_actor_id
  where binding_grant.workspace_id = p_workspace_id
    and binding_grant.coordinator_id = p_coordinator_id
    and binding_grant.consumed_at is null
    and binding_grant.revoked_at is null;

  v_token := 'vucb_' || encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  insert into public.voiceup_coordinator_account_binding_grants (
    workspace_id,
    coordinator_id,
    coordinator_version,
    token_hash,
    issued_by_user_id,
    issued_at,
    expires_at
  ) values (
    p_workspace_id,
    p_coordinator_id,
    v_coordinator.version,
    v_token_hash,
    v_actor_id,
    v_now,
    v_expires_at
  );

  return jsonb_build_object(
    'issued', true,
    'token', v_token,
    'expiresAt', v_expires_at
  );
end;
$function$;

create or replace function public.voiceup_claim_coordinator_account_binding(
  p_binding_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_actor_id uuid := auth.uid();
  v_email_confirmed_at timestamptz;
  v_token_hash text;
  v_grant public.voiceup_coordinator_account_binding_grants%rowtype;
  v_coordinator public.voiceup_coordinators%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;

  select users.email_confirmed_at
    into v_email_confirmed_at
  from auth.users users
  where users.id = v_actor_id
    and users.deleted_at is null;

  if not found or v_email_confirmed_at is null then
    raise exception using errcode = '28000', message = 'voiceup:verified_email_required';
  end if;

  if coalesce(p_binding_token, '') !~ '^vucb_[0-9a-f]{64}$' then
    raise exception using errcode = '28000', message = 'voiceup:coordinator_binding_invalid';
  end if;

  v_token_hash := encode(digest(p_binding_token, 'sha256'), 'hex');
  select binding_grant.*
    into v_grant
  from public.voiceup_coordinator_account_binding_grants binding_grant
  where binding_grant.token_hash = v_token_hash
  for update;

  if not found
    or v_grant.consumed_at is not null
    or v_grant.revoked_at is not null
    or v_grant.expires_at <= v_now
  then
    raise exception using errcode = '28000', message = 'voiceup:coordinator_binding_invalid';
  end if;

  -- A confirmed Auth mailbox alone is insufficient. The claimant must already
  -- own a supporter record through the independently verified claim contract.
  if not exists (
    select 1
    from public.voiceup_supporter_accounts supporter_account
    where supporter_account.auth_user_id = v_actor_id
      and supporter_account.workspace_id = v_grant.workspace_id
  ) then
    raise exception using errcode = '42501', message = 'voiceup:verified_supporter_account_required';
  end if;

  select coordinator.*
    into v_coordinator
  from public.voiceup_coordinators coordinator
  where coordinator.id = v_grant.coordinator_id
    and coordinator.workspace_id = v_grant.workspace_id
    and coordinator.deleted_at is null
  for update;

  if not found
    or v_coordinator.status <> 'active'
    or v_coordinator.mobile_verified_at is null
    or v_coordinator.version <> v_grant.coordinator_version
    or v_coordinator.auth_user_id is not null
  then
    raise exception using errcode = '28000', message = 'voiceup:coordinator_binding_invalid';
  end if;

  if exists (
    select 1
    from public.voiceup_coordinators other
    where other.workspace_id = v_grant.workspace_id
      and other.auth_user_id = v_actor_id
      and other.deleted_at is null
      and other.id <> v_grant.coordinator_id
  ) then
    raise exception using errcode = '23505', message = 'voiceup:coordinator_account_already_bound';
  end if;

  update public.voiceup_coordinators coordinator
  set auth_user_id = v_actor_id,
      version = coordinator.version + 1,
      updated_by = v_actor_id,
      updated_at = v_now
  where coordinator.id = v_grant.coordinator_id
    and coordinator.workspace_id = v_grant.workspace_id
    and coordinator.auth_user_id is null;

  if not found then
    raise exception using errcode = '40001', message = 'voiceup:coordinator_binding_conflict';
  end if;

  update public.voiceup_coordinator_account_binding_grants binding_grant
  set consumed_at = v_now,
      consumed_by_user_id = v_actor_id
  where binding_grant.id = v_grant.id
    and binding_grant.consumed_at is null
    and binding_grant.revoked_at is null;

  if not found then
    raise exception using errcode = '40001', message = 'voiceup:coordinator_binding_conflict';
  end if;

  insert into public.voiceup_coordinator_audit (
    workspace_id,
    coordinator_id,
    actor_user_id,
    action,
    metadata
  ) values (
    v_grant.workspace_id,
    v_grant.coordinator_id,
    v_actor_id,
    'coordinator.updated',
    jsonb_build_object(
      'change', 'auth_account_bound',
      'bindingGrantId', v_grant.id,
      'issuedByUserId', v_grant.issued_by_user_id
    )
  );

  return jsonb_build_object(
    'bound', true,
    'workspaceId', v_grant.workspace_id,
    'coordinatorId', v_grant.coordinator_id,
    'boundAt', v_now
  );
end;
$function$;

-- Resolve pgcrypto wherever the project installed it. No extension or schema is
-- created here, and the functions retain a closed search path.
do $coordinator_binding_pgcrypto_search_path$
declare
  pgcrypto_schema name;
begin
  select extension_schema.nspname
    into pgcrypto_schema
  from pg_extension extension_info
  join pg_namespace extension_schema on extension_schema.oid = extension_info.extnamespace
  where extension_info.extname = 'pgcrypto';

  if pgcrypto_schema is null
    or to_regprocedure(format('%I.digest(text,text)', pgcrypto_schema)) is null
    or to_regprocedure(format('%I.gen_random_bytes(integer)', pgcrypto_schema)) is null
  then
    raise exception 'Coordinator account binding pgcrypto prerequisite failed.';
  end if;

  execute format(
    'alter function public.voiceup_issue_coordinator_account_binding(text,uuid) set search_path = public, auth, %I, pg_temp',
    pgcrypto_schema
  );
  execute format(
    'alter function public.voiceup_claim_coordinator_account_binding(text) set search_path = public, auth, %I, pg_temp',
    pgcrypto_schema
  );
end
$coordinator_binding_pgcrypto_search_path$;

revoke all on function public.voiceup_issue_coordinator_account_binding(text, uuid)
  from public, anon, service_role;
grant execute on function public.voiceup_issue_coordinator_account_binding(text, uuid)
  to authenticated;

revoke all on function public.voiceup_claim_coordinator_account_binding(text)
  from public, anon, service_role;
grant execute on function public.voiceup_claim_coordinator_account_binding(text)
  to authenticated;

comment on table public.voiceup_coordinator_account_binding_grants is
  'Hashed, expiring, single-use grants for explicitly authorized coordinator-to-Auth account binding.';
comment on function public.voiceup_issue_coordinator_account_binding(text, uuid) is
  'Allows an existing coordinator-network manager to issue a short-lived binding grant for one active, mobile-verified coordinator.';
comment on function public.voiceup_claim_coordinator_account_binding(text) is
  'Binds a confirmed, independently verified supporter Auth account to the coordinator named only by a valid grant; grants no coordinator permissions.';

notify pgrst, 'reload schema';

commit;
