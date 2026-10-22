BEGIN;

create or replace function public.voiceup_record_otp_failure(
  p_challenge_id uuid,
  p_workspace_id text,
  p_phone_hash text,
  p_purpose text,
  p_max_attempts integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_attempt_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  update public.voiceup_otp_challenges
  set attempt_count = least(attempt_count + 1, p_max_attempts)
  where id = p_challenge_id
    and workspace_id = p_workspace_id
    and phone_hash = p_phone_hash
    and purpose = p_purpose
    and verified_at is null
    and expires_at > clock_timestamp()
    and attempt_count < p_max_attempts
  returning attempt_count into v_attempt_count;
  return coalesce(v_attempt_count, p_max_attempts);
end;
$function$;

revoke all on function public.voiceup_record_otp_failure(uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.voiceup_record_otp_failure(uuid, text, text, text, integer)
  to service_role;

-- Returns only authorization context. It never returns supporter data.
create or replace function public.voiceup_public_verification_context(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text,
  p_phone text,
  p_verification_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_phone text;
  v_challenge record;
  v_method text;
  v_supporter_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;

  v_phone := public.voiceup_normalize_public_phone(p_phone);
  if v_phone is null or length(coalesce(p_verification_token, '')) < 24 then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;

  select challenge.*
    into v_challenge
  from public.voiceup_otp_challenges challenge
  where challenge.workspace_id = p_workspace_id
    and challenge.purpose = 'public-signing'
    and challenge.verified_at is not null
    and challenge.expires_at > clock_timestamp()
    and challenge.phone_hash = encode(digest(p_workspace_id || ':' || v_phone, 'sha256'), 'hex')
    and challenge.metadata ->> 'verificationTokenHash' =
      encode(digest(p_verification_token, 'sha256'), 'hex')
    and challenge.metadata ->> 'slug' = p_campaign_slug
    and coalesce(challenge.metadata ->> 'campaignId', p_campaign_id) = p_campaign_id
  order by challenge.verified_at desc
  limit 1;

  if not found then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;

  v_method := coalesce(v_challenge.metadata ->> 'verificationMethod', 'phone_otp');
  v_supporter_id := nullif(v_challenge.metadata ->> 'supporterId', '');
  if v_method = 'screen_otp' then
    if coalesce(v_challenge.metadata ->> 'phoneOwnershipVerified', '') <> 'false'
      or v_supporter_id is null
      or not exists (
        select 1
        from public.voiceup_workspaces workspace,
          jsonb_array_elements(coalesce(workspace.data -> 'signers', '[]'::jsonb)) signer
        where workspace.id = p_workspace_id
          and signer ->> 'id' = v_supporter_id
          and signer ->> 'campaignId' = p_campaign_id
          and coalesce(
            nullif(signer ->> 'canonicalPhone', ''),
            public.voiceup_normalize_public_phone(signer ->> 'phone')
          ) = v_phone
      )
    then
      raise exception using errcode = '28000', message = 'voiceup:screen_verification_submit_required';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'verificationMethod', v_method,
    'phoneOwnershipVerified', v_method = 'phone_otp',
    'emailOwnershipVerified', false,
    'supporterId', v_supporter_id
  );
end;
$function$;

revoke all on function public.voiceup_public_verification_context(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.voiceup_public_verification_context(text, text, text, text, text)
  to service_role;

-- Screen OTP can create one new supporter. Until that supporter is bound to the
-- challenge, the token cannot resume, read, save, or modify any phone-matched row.
create or replace function public.mutate_voiceup_public_participation_screen_safe(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text,
  p_action text,
  p_phone text,
  p_verification_token text,
  p_idempotency_key text,
  p_payload jsonb,
  p_server_metadata jsonb,
  p_has_location_reference boolean,
  p_location_reference jsonb,
  p_has_requested_location_reference boolean,
  p_requested_location_reference jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_phone text;
  v_now timestamptz := clock_timestamp();
  v_challenge record;
  v_method text;
  v_email text;
  v_bound_supporter_id text;
  v_existing_signer jsonb;
  v_workspace_data jsonb;
  v_updated_signers jsonb;
  v_updated_audit_logs jsonb;
  v_result jsonb;
  v_result_supporter_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;

  v_phone := public.voiceup_normalize_public_phone(p_phone);
  if v_phone is null or length(coalesce(p_verification_token, '')) < 24 then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;

  select challenge.*
    into v_challenge
  from public.voiceup_otp_challenges challenge
  where challenge.workspace_id = p_workspace_id
    and challenge.purpose = 'public-signing'
    and challenge.verified_at is not null
    and challenge.expires_at > v_now
    and challenge.phone_hash = encode(digest(p_workspace_id || ':' || v_phone, 'sha256'), 'hex')
    and challenge.metadata ->> 'verificationTokenHash' =
      encode(digest(p_verification_token, 'sha256'), 'hex')
    and challenge.metadata ->> 'slug' = p_campaign_slug
    and coalesce(challenge.metadata ->> 'campaignId', p_campaign_id) = p_campaign_id
  order by challenge.verified_at desc
  limit 1
  for update;

  if not found then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;

  v_method := coalesce(v_challenge.metadata ->> 'verificationMethod', 'phone_otp');
  if v_method <> 'screen_otp' then
    return public.mutate_voiceup_public_participation_with_location(
      p_workspace_id, p_campaign_id, p_campaign_slug, p_action, p_phone,
      p_verification_token, p_idempotency_key, p_payload, p_server_metadata,
      p_has_location_reference, p_location_reference,
      p_has_requested_location_reference, p_requested_location_reference
    );
  end if;

  if coalesce(v_challenge.metadata ->> 'phoneOwnershipVerified', '') <> 'false' then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;

  if p_action = 'submit_support' then
    v_email := btrim(coalesce(p_payload #>> '{profile,email}', ''));
    if length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      raise exception using errcode = '22023', message = 'voiceup:invalid_email';
    end if;
  end if;

  select workspace.data
    into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
  end if;

  select signer
    into v_existing_signer
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and coalesce(
      nullif(signer ->> 'canonicalPhone', ''),
      public.voiceup_normalize_public_phone(signer ->> 'phone')
    ) = v_phone
  order by coalesce(signer ->> 'supportSubmittedAt', signer ->> 'signedAt', signer ->> 'createdAt', '') desc
  limit 1;

  v_bound_supporter_id := nullif(v_challenge.metadata ->> 'supporterId', '');
  if v_bound_supporter_id is null then
    if p_action <> 'submit_support' then
      raise exception using errcode = '28000', message = 'voiceup:screen_verification_submit_required';
    end if;
    if v_existing_signer is not null then
      raise exception using errcode = '23505', message = 'voiceup:screen_verification_existing_supporter';
    end if;
  else
    if v_existing_signer is null or v_existing_signer ->> 'id' <> v_bound_supporter_id then
      raise exception using errcode = '28000', message = 'voiceup:screen_verification_submit_required';
    end if;
    if p_action = 'submit_support'
      and coalesce(v_challenge.metadata ->> 'submitIdempotencyKey', '') <> p_idempotency_key
    then
      raise exception using errcode = '23505', message = 'voiceup:screen_verification_existing_supporter';
    end if;
  end if;

  v_result := public.mutate_voiceup_public_participation_with_location(
    p_workspace_id, p_campaign_id, p_campaign_slug, p_action, p_phone,
    p_verification_token, p_idempotency_key, p_payload,
    coalesce(p_server_metadata, '{}'::jsonb) || jsonb_build_object(
      'verificationMethod', 'screen_otp',
      'phoneOwnershipVerified', false,
      'emailOwnershipVerified', false
    ),
    p_has_location_reference, p_location_reference,
    p_has_requested_location_reference, p_requested_location_reference
  );

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    return v_result;
  end if;
  v_result_supporter_id := nullif(v_result #>> '{signer,id}', '');
  if v_result_supporter_id is null
    or (v_bound_supporter_id is not null and v_result_supporter_id <> v_bound_supporter_id)
  then
    raise exception using errcode = '28000', message = 'voiceup:screen_verification_submit_required';
  end if;

  if v_bound_supporter_id is null then
    update public.voiceup_otp_challenges
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'supporterId', v_result_supporter_id,
      'submitIdempotencyKey', p_idempotency_key,
      'supporterBoundAt', v_now
    )
    where id = v_challenge.id
      and coalesce(metadata ->> 'supporterId', '') = '';
    if not found then
      raise exception using errcode = '40001', message = 'voiceup:screen_verification_already_consumed';
    end if;
  end if;

  -- Refresh after the delegated atomic mutation so no newly written signer,
  -- location, consent, idempotency, or audit data can be overwritten.
  select workspace.data
    into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id
  for update;

  select coalesce(jsonb_agg(
    case when signer ->> 'id' = v_result_supporter_id then
      signer || jsonb_build_object(
        'otpVerified', false,
        'verificationMethod', 'screen_otp',
        'phoneOwnershipVerified', false,
        'emailOwnershipVerified', false
      )
    else signer end
  ), '[]'::jsonb)
    into v_updated_signers
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer;

  select coalesce(jsonb_agg(
    case when audit ->> 'idempotencyKey' = p_idempotency_key then
      jsonb_set(
        audit,
        '{metadata}',
        coalesce(audit -> 'metadata', '{}'::jsonb) || jsonb_build_object(
          'verificationMethod', 'screen_otp',
          'phoneOwnershipVerified', false,
          'emailOwnershipVerified', false
        ),
        true
      )
    else audit end
  ), '[]'::jsonb)
    into v_updated_audit_logs
  from jsonb_array_elements(coalesce(v_workspace_data -> 'auditLogs', '[]'::jsonb)) audit;

  update public.voiceup_workspaces
  set data = v_workspace_data || jsonb_build_object(
        'signers', v_updated_signers,
        'auditLogs', v_updated_audit_logs
      ),
      updated_at = v_now
  where id = p_workspace_id;

  v_result := v_result || jsonb_build_object(
    'signer', coalesce(v_result -> 'signer', '{}'::jsonb) || jsonb_build_object(
      'otpVerified', false,
      'verificationMethod', 'screen_otp',
      'phoneOwnershipVerified', false,
      'emailOwnershipVerified', false
    ),
    'profile', coalesce(v_result -> 'profile', '{}'::jsonb) || jsonb_build_object(
      'otpVerified', false,
      'verificationMethod', 'screen_otp',
      'phoneOwnershipVerified', false,
      'emailOwnershipVerified', false
    )
  );
  return v_result;
end;
$function$;

revoke all on function public.mutate_voiceup_public_participation_screen_safe(
  text, text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.mutate_voiceup_public_participation_screen_safe(
  text, text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb, boolean, jsonb
) to service_role;

do $screen_otp_pgcrypto_search_path$
declare
  pgcrypto_schema name;
begin
  select extension_schema.nspname
    into pgcrypto_schema
  from pg_extension extension_info
  join pg_namespace extension_schema on extension_schema.oid = extension_info.extnamespace
  where extension_info.extname = 'pgcrypto';
  if pgcrypto_schema is null then
    raise exception 'Screen OTP prerequisite failed: extension pgcrypto is not installed.';
  end if;
  execute format(
    'alter function public.voiceup_public_verification_context(text,text,text,text,text) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
  execute format(
    'alter function public.mutate_voiceup_public_participation_screen_safe(text,text,text,text,text,text,text,jsonb,jsonb,boolean,jsonb,boolean,jsonb) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
end
$screen_otp_pgcrypto_search_path$;

COMMIT;
