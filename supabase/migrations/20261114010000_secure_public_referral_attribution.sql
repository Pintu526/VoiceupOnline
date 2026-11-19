BEGIN;

-- Resolve referral input while the workspace row is locked. Only the canonical
-- persisted code crosses the public signing persistence boundary; supporter
-- records and phone numbers are never returned to the caller.
create or replace function public.voiceup_resolve_public_referral_attribution(
  p_workspace_id text,
  p_campaign_id text,
  p_referral_input text,
  p_supporter_phone text
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  v_workspace_data jsonb;
  v_input text := btrim(coalesce(p_referral_input, ''));
  v_code_input text;
  v_phone_input text;
  v_supporter_phone text;
  v_referrer jsonb;
  v_referrer_code text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if v_input = '' or length(v_input) > 160 then
    raise exception using errcode = '22023', message = 'voiceup:invalid_referral';
  end if;

  select workspace.data
    into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
  end if;

  v_code_input := upper(regexp_replace(v_input, '[[:space:]]+', '', 'g'));
  if v_code_input !~ '^VU-[A-Z0-9]{6,64}$' then
    v_phone_input := public.voiceup_normalize_public_phone(v_input);
    if v_phone_input is null then
      raise exception using errcode = '22023', message = 'voiceup:invalid_referral';
    end if;
  end if;

  select signer
    into v_referrer
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and upper(btrim(coalesce(signer ->> 'referralCode', ''))) ~ '^VU-[A-Z0-9]{6,64}$'
    and (
      coalesce(signer ->> 'supportSubmittedAt', '') <> ''
      or signer ->> 'status' = 'verified'
    )
    and (
      (
        v_code_input ~ '^VU-[A-Z0-9]{6,64}$'
        and upper(btrim(signer ->> 'referralCode')) = v_code_input
      )
      or (
        v_code_input !~ '^VU-[A-Z0-9]{6,64}$'
        and coalesce(
          nullif(signer ->> 'canonicalPhone', ''),
          public.voiceup_normalize_public_phone(signer ->> 'phone')
        ) = v_phone_input
      )
    )
  order by coalesce(
    signer ->> 'supportSubmittedAt',
    signer ->> 'signedAt',
    signer ->> 'createdAt',
    ''
  ) desc
  limit 1;

  if v_referrer is null then
    raise exception using errcode = '22023', message = 'voiceup:invalid_referral';
  end if;

  v_supporter_phone := public.voiceup_normalize_public_phone(p_supporter_phone);
  if v_supporter_phone is null
    or coalesce(
      nullif(v_referrer ->> 'canonicalPhone', ''),
      public.voiceup_normalize_public_phone(v_referrer ->> 'phone')
    ) = v_supporter_phone
  then
    raise exception using errcode = '22023', message = 'voiceup:self_referral';
  end if;

  v_referrer_code := upper(btrim(v_referrer ->> 'referralCode'));
  return v_referrer_code;
end;
$function$;

revoke all on function public.voiceup_resolve_public_referral_attribution(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.voiceup_resolve_public_referral_attribution(text, text, text, text)
  to service_role;

-- Keep the existing location-aware signing boundary and add canonical referral
-- resolution in the same transaction, before the atomic participation RPC can
-- persist the profile patch.
create or replace function public.mutate_voiceup_public_participation_with_location(
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
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  sanitized_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  trusted_location jsonb;
  trusted_requested_location jsonb;
  mutation_result jsonb;
  supporter_id text;
  workspace_data jsonb;
  updated_signers jsonb;
  referral_profile jsonb;
  referral_input text;
  canonical_referral_code text;
  referral_source text;
  supporter_phone text;
  existing_supporter jsonb;
  existing_referral_input text;
  existing_canonical_referral_code text;
  existing_referral_profile jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;

  referral_profile := coalesce(sanitized_payload -> 'profile', '{}'::jsonb);
  if p_action in ('save_draft', 'submit_support', 'update_profile')
    and jsonb_typeof(referral_profile) = 'object'
    and referral_profile ?| array['referredBy', 'referredByPhoneOrCode', 'referralSource']
  then
    supporter_phone := public.voiceup_normalize_public_phone(p_phone);
    if supporter_phone is null then
      raise exception using errcode = '22023', message = 'voiceup:invalid_phone';
    end if;

    -- Serialize attribution decisions with every other workspace mutation. The
    -- existing supporter lookup deliberately matches the atomic participation
    -- RPC's campaign + canonical phone identity and ordering.
    select workspace.data
      into workspace_data
    from public.voiceup_workspaces workspace
    where workspace.id = p_workspace_id
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
    end if;

    select signer
      into existing_supporter
    from jsonb_array_elements(coalesce(workspace_data -> 'signers', '[]'::jsonb)) signer
    where signer ->> 'campaignId' = p_campaign_id
      and coalesce(
        nullif(signer ->> 'canonicalPhone', ''),
        public.voiceup_normalize_public_phone(signer ->> 'phone')
      ) = supporter_phone
    order by
      case when coalesce(signer ->> 'supportSubmittedAt', '') <> '' then 0 else 1 end,
      case when signer ->> 'source' = 'online' then 0 else 1 end,
      coalesce(signer ->> 'signedAt', signer ->> 'createdAt', '') desc
    limit 1;

    referral_input := coalesce(
      nullif(btrim(referral_profile ->> 'referredByPhoneOrCode'), ''),
      nullif(btrim(referral_profile ->> 'referredBy'), ''),
      ''
    );
    referral_source := coalesce(nullif(btrim(referral_profile ->> 'referralSource'), ''), 'manual');
    if referral_source not in ('url', 'manual') then
      raise exception using errcode = '22023', message = 'voiceup:invalid_referral';
    end if;

    referral_profile := referral_profile
      - 'referredBy'
      - 'referredByPhoneOrCode'
      - 'referralSource';

    existing_referral_input := coalesce(
      nullif(btrim(existing_supporter ->> 'referredBy'), ''),
      nullif(btrim(existing_supporter ->> 'referredByPhoneOrCode'), ''),
      ''
    );
    if existing_referral_input <> '' then
      existing_canonical_referral_code := public.voiceup_resolve_public_referral_attribution(
        p_workspace_id,
        p_campaign_id,
        existing_referral_input,
        p_phone
      );
      if referral_input <> '' then
        canonical_referral_code := public.voiceup_resolve_public_referral_attribution(
          p_workspace_id,
          p_campaign_id,
          referral_input,
          p_phone
        );
        if canonical_referral_code <> existing_canonical_referral_code then
          raise exception using errcode = '22023', message = 'voiceup:invalid_referral';
        end if;
      end if;

      -- Never let a retry, restored draft, or later verified profile request
      -- rewrite attribution metadata. Fill a missing legacy twin with the
      -- canonical code while preserving every already-persisted value.
      existing_referral_profile := jsonb_build_object(
        'referredBy', case
          when nullif(btrim(existing_supporter ->> 'referredBy'), '') is not null
            then existing_supporter -> 'referredBy'
          else to_jsonb(existing_canonical_referral_code)
        end,
        'referredByPhoneOrCode', case
          when nullif(btrim(existing_supporter ->> 'referredByPhoneOrCode'), '') is not null
            then existing_supporter -> 'referredByPhoneOrCode'
          else to_jsonb(existing_canonical_referral_code)
        end
      );
      if existing_supporter ? 'referralSource' then
        existing_referral_profile := existing_referral_profile || jsonb_build_object(
          'referralSource', existing_supporter -> 'referralSource'
        );
      end if;
      referral_profile := referral_profile || existing_referral_profile;
    elsif referral_input <> '' then
      canonical_referral_code := public.voiceup_resolve_public_referral_attribution(
        p_workspace_id,
        p_campaign_id,
        referral_input,
        p_phone
      );
      referral_profile := referral_profile || jsonb_build_object(
        'referredBy', canonical_referral_code,
        'referredByPhoneOrCode', canonical_referral_code,
        'referralSource', referral_source
      );
    end if;
    sanitized_payload := jsonb_set(sanitized_payload, '{profile}', referral_profile, true);
  end if;

  if p_has_location_reference then
    trusted_location := public.voiceup_prepare_location_reference_v1(p_location_reference, true);
    sanitized_payload := sanitized_payload #- '{profile,locationReference}';
    if trusted_location ->> 'verificationState' = 'canonical_verified' then
      sanitized_payload := jsonb_set(
        sanitized_payload,
        '{profile}',
        coalesce(sanitized_payload -> 'profile', '{}'::jsonb)
          || public.voiceup_project_location_reference_labels_v1(trusted_location),
        true
      );
    end if;
  end if;
  if p_has_requested_location_reference then
    trusted_requested_location := public.voiceup_prepare_location_reference_v1(
      p_requested_location_reference, true
    );
    sanitized_payload := sanitized_payload #- '{application,requestedLocationReference}';
    if trusted_requested_location ->> 'verificationState' = 'canonical_verified' then
      sanitized_payload := jsonb_set(
        sanitized_payload,
        '{application,requestedGeography}',
        coalesce(sanitized_payload #> '{application,requestedGeography}', '{}'::jsonb)
          || public.voiceup_project_location_reference_labels_v1(trusted_requested_location),
        true
      );
    end if;
  end if;

  mutation_result := public.mutate_voiceup_public_participation(
    p_workspace_id,
    p_campaign_id,
    p_campaign_slug,
    p_action,
    p_phone,
    p_verification_token,
    p_idempotency_key,
    sanitized_payload,
    p_server_metadata
  );
  supporter_id := mutation_result #>> '{signer,id}';
  if supporter_id is null or (not p_has_location_reference and not p_has_requested_location_reference) then
    return mutation_result;
  end if;

  select data into workspace_data
  from public.voiceup_workspaces
  where id = p_workspace_id
  for update;

  select coalesce(jsonb_agg(
    case when signer ->> 'id' = supporter_id then
      signer
      || case when p_has_location_reference
        then jsonb_build_object('locationReference', trusted_location)
        else '{}'::jsonb end
      || case when p_has_requested_location_reference then jsonb_build_object(
        'coordinatorApplication',
        coalesce(signer -> 'coordinatorApplication', '{}'::jsonb)
          || jsonb_build_object('requestedLocationReference', trusted_requested_location)
      ) else '{}'::jsonb end
    else signer end
  ), '[]'::jsonb)
  into updated_signers
  from jsonb_array_elements(coalesce(workspace_data -> 'signers', '[]'::jsonb)) signer;

  update public.voiceup_workspaces
  set data = jsonb_set(workspace_data, '{signers}', updated_signers, true),
      updated_at = clock_timestamp()
  where id = p_workspace_id;

  if p_has_location_reference then
    mutation_result := jsonb_set(
      mutation_result,
      '{signer}',
      coalesce(mutation_result -> 'signer', '{}'::jsonb)
        || jsonb_build_object('locationReference', trusted_location),
      true
    );
    mutation_result := jsonb_set(
      mutation_result,
      '{profile}',
      coalesce(mutation_result -> 'profile', '{}'::jsonb)
        || jsonb_build_object('locationReference', trusted_location),
      true
    );
  end if;
  if p_has_requested_location_reference then
    mutation_result := jsonb_set(
      mutation_result,
      '{signer,coordinatorApplication}',
      coalesce(mutation_result #> '{signer,coordinatorApplication}', '{}'::jsonb)
        || jsonb_build_object('requestedLocationReference', trusted_requested_location),
      true
    );
  end if;
  return mutation_result;
end;
$function$;

revoke all on function public.mutate_voiceup_public_participation_with_location(
  text, text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.mutate_voiceup_public_participation_with_location(
  text, text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb, boolean, jsonb
) to service_role;

comment on function public.voiceup_resolve_public_referral_attribution(text, text, text, text) is
  'Resolves a persisted same-campaign supporter by referral code or mobile and returns only the canonical referral code.';
comment on function public.mutate_voiceup_public_participation_with_location(
  text, text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb, boolean, jsonb
) is
  'Location-aware public participation boundary with locked, canonical, server-validated referral attribution.';

COMMIT;
