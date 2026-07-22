BEGIN;

-- The frozen Coordinator migration declared PL/pgSQL locals named phone_hash
-- and coordinator_id. Those names also occur as columns in statements inside
-- their functions, so PostgreSQL's default variable-conflict mode rejects the
-- statements as ambiguous. Verify the deployed contracts before replacing
-- only those two affected function bodies.
do $coordinator_ambiguity_prerequisites$
declare
  pgcrypto_schema name;
  digest_function_oid oid;
  digest_return_type regtype;
  required_function record;
  required_function_oid oid;
  actual_return_type regtype;
begin
  select extension_schema.nspname
    into pgcrypto_schema
  from pg_extension extension_info
  join pg_namespace extension_schema on extension_schema.oid = extension_info.extnamespace
  where extension_info.extname = 'pgcrypto';

  if pgcrypto_schema is null then
    raise exception 'Coordinator ambiguity cleanup prerequisite failed: extension pgcrypto is not installed.';
  end if;

  digest_function_oid := to_regprocedure(format('%I.digest(text,text)', pgcrypto_schema));
  if digest_function_oid is null then
    raise exception 'Coordinator ambiguity cleanup prerequisite failed: %.digest(text,text) is missing.',
      pgcrypto_schema;
  end if;

  select function_info.prorettype::regtype
    into digest_return_type
  from pg_proc function_info
  where function_info.oid = digest_function_oid;

  if digest_return_type <> 'bytea'::regtype then
    raise exception 'Coordinator ambiguity cleanup prerequisite failed: %.digest(text,text) must return bytea, found %.',
      pgcrypto_schema,
      digest_return_type;
  end if;

  for required_function in
    select *
    from (values
      (
        'public.voiceup_consume_coordinator_mobile_verification(text,text,text)',
        'boolean'
      ),
      (
        'public.upsert_voiceup_coordinator(text,jsonb,jsonb,text[],text)',
        'jsonb'
      )
    ) as expected(signature, return_type)
  loop
    required_function_oid := to_regprocedure(required_function.signature);
    if required_function_oid is null then
      raise exception 'Coordinator ambiguity cleanup prerequisite failed: required function % is missing.',
        required_function.signature;
    end if;

    select function_info.prorettype::regtype
      into actual_return_type
    from pg_proc function_info
    where function_info.oid = required_function_oid;

    if actual_return_type <> required_function.return_type::regtype then
      raise exception 'Coordinator ambiguity cleanup prerequisite failed: function % must return %, found %.',
        required_function.signature,
        required_function.return_type,
        actual_return_type;
    end if;
  end loop;
end
$coordinator_ambiguity_prerequisites$;

create or replace function public.voiceup_consume_coordinator_mobile_verification(
  target_workspace_id text,
  normalized_phone text,
  verification_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_id uuid;
  expected_phone_hash text := encode(digest(target_workspace_id || ':' || normalized_phone, 'sha256'), 'hex');
  token_hash text := encode(digest(coalesce(verification_token, ''), 'sha256'), 'hex');
begin
  if coalesce(verification_token, '') = '' then return false; end if;
  select challenge.id into challenge_id
  from public.voiceup_otp_challenges challenge
  where challenge.workspace_id = target_workspace_id
    and challenge.phone_hash = expected_phone_hash
    and challenge.purpose = 'coordinator-mobile'
    and challenge.verified_at is not null
    and challenge.expires_at > now()
    and challenge.metadata ->> 'verificationTokenHash' = token_hash
    and challenge.metadata ->> 'coordinatorConsumedAt' is null
  order by challenge.verified_at desc
  limit 1
  for update;
  if challenge_id is null then return false; end if;
  update public.voiceup_otp_challenges
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('coordinatorConsumedAt', now())
  where id = challenge_id;
  return true;
end;
$$;

create or replace function public.upsert_voiceup_coordinator(
  p_workspace_id text,
  p_coordinator jsonb,
  p_geography jsonb,
  p_campaign_ids text[] default array[]::text[],
  p_verification_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
<<upsert_coordinator>>
declare
  actor_id uuid := auth.uid();
  workspace_record public.voiceup_workspaces%rowtype;
  v_coordinator_id uuid := coalesce(nullif(p_coordinator ->> 'id', '')::uuid, gen_random_uuid());
  existing_record public.voiceup_coordinators%rowtype;
  manager_record public.voiceup_coordinators%rowtype;
  full_name_value text := btrim(coalesce(p_coordinator ->> 'fullName', ''));
  phone_value text := btrim(coalesce(p_coordinator ->> 'phone', ''));
  normalized_phone_value text;
  email_value text := nullif(btrim(coalesce(p_coordinator ->> 'email', '')), '');
  normalized_email_value text;
  role_value text := coalesce(p_coordinator ->> 'role', 'field_coordinator');
  status_value text := coalesce(p_coordinator ->> 'status', 'invited');
  reports_to_id uuid := nullif(p_coordinator ->> 'reportsToCoordinatorId', '')::uuid;
  referred_by_code text := upper(btrim(coalesce(p_coordinator ->> 'referredByCode', '')));
  referred_by_id uuid;
  geography_id_value uuid;
  geography_level text;
  expected_level text;
  referral_code_value text;
  photo_path_value text := nullif(btrim(coalesce(p_coordinator ->> 'photoPath', '')), '');
  postal_code_value text := nullif(btrim(coalesce(p_geography ->> 'postalCode', '')), '');
  expected_version integer := coalesce(nullif(p_coordinator ->> 'version', '')::integer, 0);
  mobile_verified_at_value timestamptz;
  is_new boolean := false;
  phone_changed boolean := false;
  campaign_id_value text;
begin
  if actor_id is null or not public.voiceup_can_manage_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network management is not authorized.';
  end if;
  select * into workspace_record from public.voiceup_workspaces
  where id = p_workspace_id for update;
  if not found then raise exception 'Workspace not found.'; end if;

  normalized_phone_value := public.voiceup_normalize_indian_phone(phone_value);
  normalized_email_value := public.voiceup_normalize_email(email_value);
  if length(full_name_value) < 2 then raise exception 'Coordinator name is required.'; end if;
  if normalized_phone_value is null then raise exception 'Enter a valid Indian mobile number.'; end if;
  if email_value is not null and normalized_email_value is null then raise exception 'Enter a valid email address.'; end if;
  if role_value not in (
    'national_coordinator', 'state_coordinator', 'district_coordinator', 'block_coordinator',
    'panchayat_coordinator', 'ward_coordinator', 'field_coordinator'
  ) then raise exception 'Coordinator role is invalid.'; end if;
  if status_value not in ('invited', 'active', 'inactive', 'suspended') then
    raise exception 'Coordinator status is invalid.';
  end if;
  if postal_code_value is not null and postal_code_value !~ '^[0-9]{6}$' then
    raise exception 'Coordinator PIN code must contain six digits.';
  end if;

  select * into existing_record
  from public.voiceup_coordinators
  where id = v_coordinator_id and workspace_id = p_workspace_id and deleted_at is null
  for update;
  is_new := not found;
  if is_new and exists (
    select 1 from public.voiceup_coordinators other where other.id = v_coordinator_id
  ) then raise exception 'Coordinator identifier belongs to another workspace.'; end if;
  if not is_new and expected_version <> existing_record.version then
    raise exception 'Coordinator changed since it was opened. Refresh and retry.';
  end if;
  phone_changed := is_new or existing_record.normalized_phone <> normalized_phone_value;
  mobile_verified_at_value := case when is_new then null else existing_record.mobile_verified_at end;
  if phone_changed then
    if not public.voiceup_consume_coordinator_mobile_verification(
      p_workspace_id, normalized_phone_value, p_verification_token
    ) then
      raise exception 'Verified mobile proof is required for this coordinator.';
    end if;
    mobile_verified_at_value := now();
  end if;

  if photo_path_value is not null and photo_path_value not like p_workspace_id || '/coordinators/' || v_coordinator_id::text || '/%' then
    raise exception 'Coordinator photo path is outside the coordinator profile.';
  end if;

  geography_id_value := public.voiceup_ensure_coordinator_geography(
    p_workspace_id,
    coalesce(p_geography, '{}'::jsonb),
    actor_id
  );
  expected_level := public.voiceup_coordinator_role_level(role_value);
  if geography_id_value is null then raise exception 'Coordinator geography is required.'; end if;
  select level into geography_level
  from public.voiceup_coordinator_geographies
  where id = geography_id_value and workspace_id = p_workspace_id and active;
  if expected_level is not null and geography_level <> expected_level then
    raise exception 'Coordinator role must match the assigned geography level.';
  end if;

  if reports_to_id is not null then
    select * into manager_record from public.voiceup_coordinators
    where id = reports_to_id and workspace_id = p_workspace_id and deleted_at is null;
    if not found then raise exception 'Reporting coordinator was not found.'; end if;
    if public.voiceup_coordinator_role_rank(manager_record.role) <= public.voiceup_coordinator_role_rank(role_value) then
      raise exception 'Reporting coordinator must have a broader role.';
    end if;
    if not is_new and exists (
      with recursive descendants as (
        select id from public.voiceup_coordinators
        where reports_to_coordinator_id = v_coordinator_id and workspace_id = p_workspace_id and deleted_at is null
        union all
        select child.id from public.voiceup_coordinators child
        join descendants parent on child.reports_to_coordinator_id = parent.id
        where child.workspace_id = p_workspace_id and child.deleted_at is null
      ) select 1 from descendants where id = reports_to_id
    ) then raise exception 'Reporting hierarchy cannot contain a cycle.'; end if;
  end if;

  foreach campaign_id_value in array coalesce(p_campaign_ids, array[]::text[]) loop
    if not exists (
      select 1 from jsonb_array_elements(coalesce(workspace_record.data -> 'campaigns', '[]'::jsonb)) campaign
      where campaign ->> 'id' = campaign_id_value
    ) then raise exception 'Linked campaign does not belong to this workspace.'; end if;
  end loop;

  if referred_by_code <> '' then
    select id into referred_by_id from public.voiceup_coordinators
    where workspace_id = p_workspace_id and referral_code = referred_by_code and deleted_at is null;
    if referred_by_id is null then raise exception 'Referral code was not found.'; end if;
    if referred_by_id = v_coordinator_id then raise exception 'A coordinator cannot refer themselves.'; end if;
  end if;

  referral_code_value := case
    when is_new then 'VC-' || upper(substr(encode(digest(p_workspace_id || ':' || v_coordinator_id::text, 'sha256'), 'hex'), 1, 8))
    else existing_record.referral_code
  end;

  insert into public.voiceup_coordinators (
    id, workspace_id, full_name, phone, normalized_phone, email, normalized_email,
    photo_path, role, status, geography_id, postal_code, reports_to_coordinator_id, referral_code,
    referred_by_coordinator_id, mobile_verified_at, notes, created_by, updated_by
  ) values (
    v_coordinator_id, p_workspace_id, full_name_value, phone_value, normalized_phone_value,
    email_value, normalized_email_value, photo_path_value, role_value, status_value,
    geography_id_value, postal_code_value, reports_to_id, referral_code_value, referred_by_id,
    mobile_verified_at_value, coalesce(p_coordinator ->> 'notes', ''), actor_id, actor_id
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    normalized_phone = excluded.normalized_phone,
    email = excluded.email,
    normalized_email = excluded.normalized_email,
    photo_path = excluded.photo_path,
    role = excluded.role,
    status = excluded.status,
    geography_id = excluded.geography_id,
    postal_code = excluded.postal_code,
    reports_to_coordinator_id = excluded.reports_to_coordinator_id,
    referred_by_coordinator_id = excluded.referred_by_coordinator_id,
    mobile_verified_at = excluded.mobile_verified_at,
    notes = excluded.notes,
    version = public.voiceup_coordinators.version + 1,
    updated_by = actor_id,
    updated_at = now();

  update public.voiceup_coordinator_campaigns link
  set active = false, revoked_at = now()
  where link.coordinator_id = v_coordinator_id
    and link.workspace_id = p_workspace_id
    and link.active;
  foreach campaign_id_value in array coalesce(p_campaign_ids, array[]::text[]) loop
    insert into public.voiceup_coordinator_campaigns (
      coordinator_id, workspace_id, campaign_id, active, assigned_by, assigned_at, revoked_at
    ) values (
      v_coordinator_id, p_workspace_id, campaign_id_value, true, actor_id, now(), null
    ) on conflict (coordinator_id, campaign_id) do update set
      active = true, assigned_by = actor_id, assigned_at = now(), revoked_at = null;
  end loop;

  update public.voiceup_coordinator_referrals
  set status = 'revoked', updated_at = now()
  where workspace_id = p_workspace_id
    and referred_coordinator_id = v_coordinator_id
    and status = 'accepted';
  if referred_by_id is not null then
    insert into public.voiceup_coordinator_referrals (
      workspace_id, inviter_coordinator_id, referred_coordinator_id, referral_code, status, accepted_at
    ) values (
      p_workspace_id, referred_by_id, v_coordinator_id, referred_by_code, 'accepted', now()
    ) on conflict (workspace_id, referred_coordinator_id) do update set
      inviter_coordinator_id = excluded.inviter_coordinator_id,
      referral_code = excluded.referral_code,
      status = 'accepted', accepted_at = now(), updated_at = now();
  end if;

  insert into public.voiceup_coordinator_audit (
    workspace_id, coordinator_id, actor_user_id, action, metadata
  ) values (
    p_workspace_id,
    v_coordinator_id,
    actor_id,
    case when is_new then 'coordinator.created' else 'coordinator.updated' end,
    jsonb_build_object(
      'role', role_value,
      'status', status_value,
      'geographyId', geography_id_value,
      'reportsToCoordinatorId', reports_to_id,
      'campaignCount', coalesce(array_length(p_campaign_ids, 1), 0),
      'mobileVerified', mobile_verified_at_value is not null
    )
  );
  if phone_changed then
    insert into public.voiceup_coordinator_audit (
      workspace_id, coordinator_id, actor_user_id, action, metadata
    ) values (p_workspace_id, v_coordinator_id, actor_id, 'coordinator.mobile_verified', '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'id', v_coordinator_id,
    'referralCode', referral_code_value,
    'version', case when is_new then 1 else existing_record.version + 1 end
  );
end;
$$;

-- CREATE OR REPLACE preserves ownership and grants. Restore the extension-aware
-- search path set by 20260720025000 after replacing the function definitions.
do $coordinator_ambiguity_search_path$
declare
  pgcrypto_schema name;
begin
  select extension_schema.nspname
    into pgcrypto_schema
  from pg_extension extension_info
  join pg_namespace extension_schema on extension_schema.oid = extension_info.extnamespace
  where extension_info.extname = 'pgcrypto';

  if pgcrypto_schema is null then
    raise exception 'Coordinator ambiguity cleanup prerequisite failed: extension pgcrypto is not installed.';
  end if;

  execute format(
    'alter function public.voiceup_consume_coordinator_mobile_verification(text,text,text) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
  execute format(
    'alter function public.upsert_voiceup_coordinator(text,jsonb,jsonb,text[],text) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
end
$coordinator_ambiguity_search_path$;

COMMIT;
