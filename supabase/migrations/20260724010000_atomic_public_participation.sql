BEGIN;

create extension if not exists pgcrypto;

-- Canonical public identity rule. Indian mobiles accept local, leading-zero,
-- 91 and +91 spellings. Explicit international numbers retain their country
-- code; ambiguous local numbers are never merged with an international form.
create or replace function public.voiceup_normalize_public_phone(raw_phone text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  trimmed text := btrim(coalesce(raw_phone, ''));
  digits text := regexp_replace(btrim(coalesce(raw_phone, '')), '[^0-9]', '', 'g');
begin
  if digits ~ '^0[6-9][0-9]{9}$' then
    return substr(digits, 2);
  end if;
  if digits ~ '^91[6-9][0-9]{9}$' then
    return substr(digits, 3);
  end if;
  if digits ~ '^[6-9][0-9]{9}$' then
    return digits;
  end if;
  if left(trimmed, 1) = '+' and digits ~ '^[1-9][0-9]{7,14}$' then
    return '+' || digits;
  end if;
  if digits ~ '^[0-9]{8,15}$' then
    return digits;
  end if;
  return null;
end;
$$;

revoke all on function public.voiceup_normalize_public_phone(text) from public;

create or replace function public.mutate_voiceup_public_participation(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text,
  p_action text,
  p_phone text,
  p_verification_token text,
  p_idempotency_key text,
  p_payload jsonb,
  p_server_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_data jsonb;
  v_campaign jsonb;
  v_signers jsonb;
  v_signer jsonb;
  v_original_signer jsonb;
  v_safe_signer jsonb;
  v_metrics jsonb;
  v_result jsonb;
  v_idempotency jsonb;
  v_existing_idempotency jsonb;
  v_audit_logs jsonb;
  v_audit_event jsonb;
  v_profile_patch jsonb := coalesce(p_payload -> 'profile', '{}'::jsonb);
  v_consents_patch jsonb := coalesce(p_payload -> 'consents', '{}'::jsonb);
  v_application_patch jsonb := coalesce(p_payload -> 'application', '{}'::jsonb);
  v_current_consents jsonb;
  v_current_application jsonb;
  v_consent_record jsonb;
  v_phone text;
  v_identity_hash text;
  v_supporter_id text;
  v_now timestamptz := clock_timestamp();
  v_changed_fields text[] := array[]::text[];
  v_invalid_fields text[];
  v_missing_fields text[] := array[]::text[];
  v_required_field text;
  v_key text;
  v_value jsonb;
  v_is_stale boolean := false;
  v_support_already_complete boolean := false;
  v_support_consent_version text;
  v_source text := left(coalesce(nullif(p_server_metadata ->> 'source', ''), 'public-edge-function'), 80);
  v_coordinator_transition jsonb;
  v_authoritative_coordinator record;
  v_profile_allowed constant text[] := array[
    'name', 'email', 'whatsappNumber', 'telegramHandle',
    'selectedAuthorityId', 'selectedAuthorityName',
    'countryId', 'country', 'stateId', 'state', 'districtId', 'district',
    'blockId', 'block', 'panchayatId', 'panchayat', 'wardId', 'ward',
    'address', 'postalCode', 'comment', 'languagePreference',
    'communicationPreference', 'volunteerInterest', 'coordinatorInterest',
    'profilePhotoPath', 'profilePhotoUpdatedAt', 'profileCompletion',
    'referredBy', 'referredByPhoneOrCode', 'referralSource', 'referralCode'
  ];
  v_consent_allowed constant text[] := array[
    'campaignSupport', 'campaignCommunication', 'coordinatorContact', 'photoUsage'
  ];
  v_application_allowed constant text[] := array[
    'requestedLevel', 'requestedGeography', 'experience', 'availability', 'coordinatorConsent'
  ];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;

  if p_action is null or p_action not in (
    'save_draft',
    'submit_support',
    'resume_verified_supporter',
    'update_profile',
    'record_consents',
    'submit_coordinator_application',
    'sync_coordinator_application_state'
  ) then
    raise exception using errcode = '22023', message = 'voiceup:unsupported_action';
  end if;

  if coalesce(jsonb_typeof(p_payload), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_server_metadata), 'null') <> 'object'
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_payload';
  end if;
  if octet_length(p_payload::text) > 49152 or octet_length(p_server_metadata::text) > 4096 then
    raise exception using errcode = '22023', message = 'voiceup:payload_too_large';
  end if;
  if p_payload ?| array[
    'workspace', 'workspaceData', 'campaigns', 'signers', 'auditLogs',
    'organization', 'authorities', 'scanItems', 'coordinators'
  ] then
    raise exception using errcode = '22023', message = 'voiceup:protected_patch_field';
  end if;
  if p_payload::text ~* 'data:[^;]+;base64,' then
    raise exception using errcode = '22023', message = 'voiceup:base64_not_allowed';
  end if;

  v_phone := public.voiceup_normalize_public_phone(p_phone);
  if v_phone is null then
    raise exception using errcode = '22023', message = 'voiceup:invalid_phone';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) < 12
    or length(p_idempotency_key) > 160
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_idempotency_key';
  end if;
  if length(coalesce(p_verification_token, '')) < 24 then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;

  select array_agg(field_name order by field_name)
    into v_invalid_fields
  from jsonb_object_keys(v_profile_patch) as field_name
  where not (field_name = any(v_profile_allowed));
  if coalesce(cardinality(v_invalid_fields), 0) > 0 then
    raise exception using errcode = '22023', message = 'voiceup:unsupported_profile_field';
  end if;

  select array_agg(field_name order by field_name)
    into v_invalid_fields
  from jsonb_object_keys(v_consents_patch) as field_name
  where not (field_name = any(v_consent_allowed));
  if coalesce(cardinality(v_invalid_fields), 0) > 0 then
    raise exception using errcode = '22023', message = 'voiceup:unsupported_consent_field';
  end if;

  select array_agg(field_name order by field_name)
    into v_invalid_fields
  from jsonb_object_keys(v_application_patch) as field_name
  where not (field_name = any(v_application_allowed));
  if coalesce(cardinality(v_invalid_fields), 0) > 0 then
    raise exception using errcode = '22023', message = 'voiceup:unsupported_application_field';
  end if;
  if v_application_patch ? 'applicationStatus'
    or p_payload ? 'status'
    or p_payload ? 'role'
    or p_payload ? 'approvalStatus'
  then
    raise exception using errcode = '22023', message = 'voiceup:coordinator_authority_protected';
  end if;
  if v_application_patch ? 'requestedGeography'
    and (
      jsonb_typeof(v_application_patch -> 'requestedGeography') <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(v_application_patch -> 'requestedGeography') geography_key
        where geography_key not in (
          'countryId', 'country', 'stateId', 'state', 'districtId', 'district',
          'blockId', 'block', 'panchayatId', 'panchayat', 'wardId', 'ward'
        )
      )
    )
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_geography';
  end if;

  perform set_config('lock_timeout', '2000ms', true);
  perform set_config('statement_timeout', '8000ms', true);

  begin
    -- The row is acquired before any workspace JSON is trusted or mutated.
    select workspace.data
      into v_workspace_data
    from public.voiceup_workspaces workspace
    where workspace.id = p_workspace_id
    for update;

    if not found then
      raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
    end if;

    select campaign_item
      into v_campaign
    from jsonb_array_elements(coalesce(v_workspace_data -> 'campaigns', '[]'::jsonb)) campaign_item
    where campaign_item ->> 'id' = p_campaign_id
      and campaign_item ->> 'slug' = p_campaign_slug
    limit 1;

    if v_campaign is null
      or v_campaign ->> 'status' <> 'Published'
      or not exists (
        select 1
        from public.voiceup_public_campaign_index campaign_index
        where campaign_index.workspace_id = p_workspace_id
          and campaign_index.campaign_id = p_campaign_id
          and campaign_index.slug = p_campaign_slug
          and campaign_index.status = 'Published'
      )
    then
      raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
    end if;

    if coalesce(v_workspace_data #>> '{organization,subscriptionStatus}', '') not in ('Active', 'Trial') then
      raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
    end if;
    if v_workspace_data #>> '{organization,subscriptionStatus}' = 'Trial'
      and coalesce(v_workspace_data #>> '{organization,trialEndsAt}', '') <> ''
      and (v_workspace_data #>> '{organization,trialEndsAt}')::date < current_date
    then
      raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
    end if;

    if not exists (
      select 1
      from public.voiceup_otp_challenges challenge
      where challenge.workspace_id = p_workspace_id
        and challenge.purpose = 'public-signing'
        and challenge.verified_at is not null
        and challenge.expires_at > v_now
        and challenge.phone_hash = encode(
          digest(p_workspace_id || ':' || v_phone, 'sha256'),
          'hex'
        )
        and challenge.metadata ->> 'verificationTokenHash' = encode(
          digest(p_verification_token, 'sha256'),
          'hex'
        )
        and challenge.metadata ->> 'slug' = p_campaign_slug
        and coalesce(challenge.metadata ->> 'campaignId', p_campaign_id) = p_campaign_id
    ) then
      raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
    end if;

    v_identity_hash := encode(digest(p_campaign_id || ':' || v_phone, 'sha256'), 'hex');
    v_signers := coalesce(v_workspace_data -> 'signers', '[]'::jsonb);

    select signer_item
      into v_signer
    from jsonb_array_elements(v_signers) signer_item
    where signer_item ->> 'campaignId' = p_campaign_id
      and coalesce(
        nullif(signer_item ->> 'canonicalPhone', ''),
        public.voiceup_normalize_public_phone(signer_item ->> 'phone')
      ) = v_phone
    order by
      case when coalesce(signer_item ->> 'supportSubmittedAt', '') <> '' then 0 else 1 end,
      case when signer_item ->> 'source' = 'online' then 0 else 1 end,
      coalesce(signer_item ->> 'signedAt', signer_item ->> 'createdAt', '') desc
    limit 1;

    v_supporter_id := v_signer ->> 'id';
    v_idempotency := coalesce(v_workspace_data -> 'publicParticipationIdempotency', '[]'::jsonb);
    select history_item
      into v_existing_idempotency
    from jsonb_array_elements(v_idempotency) history_item
    where history_item ->> 'key' = p_idempotency_key
    limit 1;

    if v_existing_idempotency is not null then
      if v_existing_idempotency ->> 'campaignId' <> p_campaign_id
        or v_existing_idempotency ->> 'identityHash' <> v_identity_hash
        or v_existing_idempotency ->> 'action' <> p_action
      then
        raise exception using errcode = '23505', message = 'voiceup:idempotency_conflict';
      end if;
      return v_existing_idempotency -> 'result';
    end if;

    v_original_signer := v_signer;
    v_support_already_complete := v_signer is not null
      and (
        coalesce(v_signer ->> 'supportSubmittedAt', '') <> ''
        or (
          v_signer ->> 'source' = 'online'
          and v_signer ->> 'status' = 'verified'
          and coalesce(v_signer ->> 'signedAt', '') <> ''
        )
      );

    if p_action = 'resume_verified_supporter' and v_signer is null then
      v_signer := null;
      v_changed_fields := array['verifiedResume'];
    elsif p_action in ('update_profile', 'record_consents', 'submit_coordinator_application', 'sync_coordinator_application_state')
      and v_signer is null
    then
      raise exception using errcode = '22023', message = 'voiceup:supporter_not_found';
    elsif v_signer is null then
      v_supporter_id := 'sig-' || replace(gen_random_uuid()::text, '-', '');
      v_signer := jsonb_build_object(
        'id', v_supporter_id,
        'campaignId', p_campaign_id,
        'phone', v_phone,
        'canonicalPhone', v_phone,
        'otpVerified', true,
        'source', 'online',
        'status', 'pending',
        'createdAt', v_now,
        'draftUpdatedAt', v_now
      );
      v_changed_fields := array['supporterCreated'];
    end if;

    if v_signer is not null then
      v_supporter_id := v_signer ->> 'id';
      v_signer := v_signer
        || jsonb_build_object('canonicalPhone', v_phone, 'otpVerified', true);
    end if;

    if p_action in ('save_draft', 'update_profile', 'submit_support') then
      v_is_stale := coalesce(p_payload ->> 'baseUpdatedAt', '') <> ''
        and coalesce(v_signer ->> 'profileUpdatedAt', v_signer ->> 'draftUpdatedAt', '') <> ''
        and (p_payload ->> 'baseUpdatedAt')::timestamptz
          < coalesce(v_signer ->> 'profileUpdatedAt', v_signer ->> 'draftUpdatedAt')::timestamptz;

      for v_key, v_value in
        select profile_field.key, profile_field.value
        from jsonb_each(v_profile_patch) profile_field
      loop
        if jsonb_typeof(v_value) not in ('string', 'boolean', 'number', 'null', 'object') then
          raise exception using errcode = '22023', message = 'voiceup:invalid_profile_field';
        end if;
        if v_key = 'communicationPreference'
          and jsonb_typeof(v_value) = 'object'
          and exists (
            select 1 from jsonb_object_keys(v_value) preference_key
            where preference_key not in ('email', 'sms', 'whatsapp')
          )
        then
          raise exception using errcode = '22023', message = 'voiceup:unsupported_profile_field';
        end if;
        if v_key = 'profileCompletion'
          and jsonb_typeof(v_value) = 'object'
          and exists (
            select 1 from jsonb_object_keys(v_value) completion_key
            where completion_key not in ('completedFields', 'completedAt', 'percentage')
          )
        then
          raise exception using errcode = '22023', message = 'voiceup:unsupported_profile_field';
        end if;
        if v_key = 'profilePhotoPath'
          and (
            v_value #>> '{}' !~ ('^' || p_workspace_id || '/supporters/' || v_supporter_id || '/[^.][^/]*$')
            or v_value #>> '{}' like '%..%'
          )
        then
          raise exception using errcode = '22023', message = 'voiceup:invalid_photo_reference';
        end if;

        -- A stale browser may fill blanks but cannot erase or replace newer data.
        if not v_is_stale
          or not (v_signer ? v_key)
          or v_signer -> v_key is null
          or v_signer -> v_key = 'null'::jsonb
          or v_signer ->> v_key = ''
        then
          v_signer := jsonb_set(v_signer, array[v_key], v_value, true);
          v_changed_fields := array_append(v_changed_fields, v_key);
        end if;
      end loop;

      v_signer := v_signer || jsonb_build_object(
        'profileUpdatedAt', v_now,
        'draftUpdatedAt', v_now
      );
      v_changed_fields := array_append(v_changed_fields, 'profileUpdatedAt');
    end if;

    if p_action = 'save_draft' then
      -- A completed support record can be enriched but never returned to draft.
      if not v_support_already_complete then
        v_signer := v_signer || jsonb_build_object('status', 'pending');
      end if;
    end if;

    if p_action in ('record_consents', 'submit_support') then
      if jsonb_typeof(v_consents_patch) <> 'object' then
        raise exception using errcode = '22023', message = 'voiceup:invalid_consent';
      end if;
      v_current_consents := coalesce(v_signer -> 'consents', '{}'::jsonb);

      for v_key, v_value in
        select consent_field.key, consent_field.value
        from jsonb_each(v_consents_patch) consent_field
      loop
        if jsonb_typeof(v_value) <> 'object'
          or jsonb_typeof(v_value -> 'granted') <> 'boolean'
          or length(coalesce(v_value ->> 'version', '')) < 1
        then
          raise exception using errcode = '22023', message = 'voiceup:invalid_consent';
        end if;
        v_consent_record := jsonb_build_object(
          'granted', (v_value ->> 'granted')::boolean,
          'recordedAt', v_now,
          'version', left(v_value ->> 'version', 160),
          'policyId', left(coalesce(v_value ->> 'policyId', v_value ->> 'version'), 160),
          'captureSource', v_source,
          'campaignId', p_campaign_id,
          'supporterId', v_supporter_id
        );
        v_current_consents := jsonb_set(v_current_consents, array[v_key], v_consent_record, true);
        v_signer := jsonb_set(v_signer, '{consentHistory}', (
          select coalesce(jsonb_agg(history_row.value), '[]'::jsonb)
          from (
          select *
          from (
            select v_consent_record as value, 0 as ordering
            union all
            select history_item, history_ordinality::integer
            from jsonb_array_elements(coalesce(v_signer -> 'consentHistory', '[]'::jsonb))
              with ordinality as prior(history_item, history_ordinality)
          ) bounded_history
          order by ordering
          limit 50
          ) history_row
        ), true);
        v_changed_fields := array_append(v_changed_fields, 'consents.' || v_key);
        if v_key = 'campaignSupport' then
          v_support_consent_version := v_consent_record ->> 'version';
        end if;
      end loop;
      v_signer := jsonb_set(v_signer, '{consents}', v_current_consents, true);
    end if;

    if p_action = 'submit_support' then
      if coalesce(v_current_consents #>> '{campaignSupport,granted}', 'false') <> 'true' then
        raise exception using errcode = '22023', message = 'voiceup:consent_required';
      end if;

      for v_required_field in
        select required_field #>> '{}'
        from jsonb_array_elements(
          case
            when jsonb_typeof(v_campaign -> 'requiredFields') = 'array'
              and jsonb_array_length(v_campaign -> 'requiredFields') > 0
              then v_campaign -> 'requiredFields'
            else '["name","phone"]'::jsonb
          end
        ) required_field
      loop
        if v_required_field = 'phone' then
          continue;
        end if;
        if btrim(coalesce(v_signer ->> v_required_field, '')) = '' then
          v_missing_fields := array_append(v_missing_fields, v_required_field);
        end if;
      end loop;
      if cardinality(v_missing_fields) > 0 then
        raise exception using errcode = '22023', message = 'voiceup:required_fields_missing';
      end if;
      if exists (
        select 1
        from unnest(array['country', 'state', 'district', 'block', 'panchayat', 'ward']) level_name
        where coalesce(v_signer ->> (level_name || 'Id'), '') <> ''
          and (
            coalesce(v_signer ->> level_name, '') = ''
            or v_signer ->> (level_name || 'Id') !~ '^[A-Za-z0-9._:-]{1,160}$'
          )
      ) then
        raise exception using errcode = '22023', message = 'voiceup:invalid_geography';
      end if;

      if not v_support_already_complete then
        if coalesce((v_campaign ->> 'maxSignersAllowed')::integer, 0) > 0
          and (
            select count(*)
            from jsonb_array_elements(v_signers) existing
            where existing ->> 'campaignId' = p_campaign_id
              and (
                coalesce(existing ->> 'supportSubmittedAt', '') <> ''
                or (existing ->> 'source' = 'online' and existing ->> 'status' = 'verified')
              )
          ) >= (v_campaign ->> 'maxSignersAllowed')::integer
        then
          raise exception using errcode = '22023', message = 'voiceup:campaign_limit_reached';
        end if;

        if coalesce((v_workspace_data #>> '{organization,monthlySignatureLimit}')::integer, 0)
            + coalesce((v_workspace_data #>> '{organization,bonusSignatureCredits}')::integer, 0) > 0
          and (
            select count(*)
            from jsonb_array_elements(v_signers) monthly_signer
            where left(coalesce(monthly_signer ->> 'supportSubmittedAt', monthly_signer ->> 'signedAt', ''), 7)
              = to_char(v_now, 'YYYY-MM')
          ) >= coalesce((v_workspace_data #>> '{organization,monthlySignatureLimit}')::integer, 0)
            + coalesce((v_workspace_data #>> '{organization,bonusSignatureCredits}')::integer, 0)
        then
          raise exception using errcode = '22023', message = 'voiceup:monthly_limit_reached';
        end if;
      end if;

      v_signer := v_signer || jsonb_build_object(
        'status', 'verified',
        'supportSubmittedAt', coalesce(v_signer -> 'supportSubmittedAt', to_jsonb(v_now)),
        'signedAt', coalesce(v_signer -> 'signedAt', to_jsonb(v_now)),
        'digitalSupportedAt', coalesce(v_signer -> 'digitalSupportedAt', to_jsonb(v_now)),
        'consentAccepted', true,
        'consentTextSnapshot', coalesce(v_campaign ->> 'consentText', ''),
        'consentVersion', coalesce(v_support_consent_version, v_current_consents #>> '{campaignSupport,version}'),
        'consentAcceptedAt', coalesce(v_signer -> 'consentAcceptedAt', to_jsonb(v_now)),
        'consentSource', v_source,
        'consentCampaignId', p_campaign_id,
        'consentWorkspaceId', p_workspace_id,
        'consentEvidence', jsonb_build_object(
          'accepted', true,
          'textSnapshot', coalesce(v_campaign ->> 'consentText', ''),
          'version', coalesce(v_support_consent_version, v_current_consents #>> '{campaignSupport,version}'),
          'acceptedAt', v_now,
          'source', v_source,
          'campaignId', p_campaign_id,
          'workspaceId', p_workspace_id
        )
      );
      if v_signer ->> 'source' in ('scan', 'field') then
        v_signer := jsonb_set(v_signer, '{participationSources}', (
          select jsonb_agg(distinct source_value)
          from jsonb_array_elements_text(
            coalesce(v_signer -> 'participationSources', '[]'::jsonb) || '["paper","digital"]'::jsonb
          ) source_value
        ), true);
      else
        v_signer := v_signer || jsonb_build_object('source', 'online');
      end if;
      v_changed_fields := array_cat(v_changed_fields, array['status', 'supportSubmittedAt', 'digitalSupportedAt']);
    end if;

    if p_action = 'submit_coordinator_application' then
      if coalesce(v_application_patch #>> '{coordinatorConsent,granted}', 'false') <> 'true'
        or length(coalesce(v_application_patch #>> '{coordinatorConsent,version}', '')) < 1
      then
        raise exception using errcode = '22023', message = 'voiceup:coordinator_consent_required';
      end if;
      v_current_application := v_signer -> 'coordinatorApplication';
      if v_current_application is not null
        and coalesce(v_current_application ->> 'status', '') not in ('Incomplete', 'Pending Approval')
      then
        raise exception using errcode = '23505', message = 'voiceup:active_coordinator_application_exists';
      end if;
      v_current_application := coalesce(v_current_application, '{}'::jsonb)
        || (v_application_patch - 'coordinatorConsent')
        || jsonb_build_object(
          'status', 'Pending Approval',
          'submittedAt', coalesce(v_current_application -> 'submittedAt', to_jsonb(v_now)),
          'updatedAt', v_now,
          'coordinatorConsent', jsonb_build_object(
            'granted', true,
            'recordedAt', v_now,
            'version', v_application_patch #>> '{coordinatorConsent,version}',
            'captureSource', v_source,
            'campaignId', p_campaign_id,
            'supporterId', v_supporter_id
          )
        );
      v_signer := jsonb_set(v_signer, '{coordinatorApplication}', v_current_application, true)
        || jsonb_build_object('coordinatorInterest', true);
      v_changed_fields := array_cat(v_changed_fields, array['coordinatorApplication', 'coordinatorInterest']);
      v_coordinator_transition := jsonb_build_object(
        'from', coalesce((v_original_signer -> 'coordinatorApplication') ->> 'status', 'None'),
        'to', 'Pending Approval'
      );
    end if;

    if p_action = 'sync_coordinator_application_state' then
      v_current_application := v_signer -> 'coordinatorApplication';
      if v_current_application is null then
        raise exception using errcode = '22023', message = 'voiceup:coordinator_application_not_found';
      end if;

      select coordinator.id, coordinator.status, coordinator.updated_at
        into v_authoritative_coordinator
      from public.voiceup_coordinators coordinator
      where coordinator.workspace_id = p_workspace_id
        and coordinator.deleted_at is null
        and public.voiceup_normalize_public_phone(coordinator.phone) = v_phone
      order by coordinator.updated_at desc
      limit 1;

      if found then
        v_coordinator_transition := jsonb_build_object(
          'from', v_current_application ->> 'status',
          'to', case
            when v_authoritative_coordinator.status = 'active'
              and exists (
                select 1
                from public.voiceup_coordinator_campaigns campaign_link
                where campaign_link.workspace_id = p_workspace_id
                  and campaign_link.coordinator_id = v_authoritative_coordinator.id
                  and campaign_link.campaign_id = p_campaign_id
                  and campaign_link.active
              ) then 'Approved'
            when v_authoritative_coordinator.status = 'inactive' then 'Rejected'
            when v_authoritative_coordinator.status = 'suspended' then 'Suspended'
            else 'Pending Approval'
          end
        );
        v_current_application := v_current_application || jsonb_build_object(
          'status', v_coordinator_transition ->> 'to',
          'authoritativeCoordinatorId', v_authoritative_coordinator.id,
          'authoritativeSyncedAt', v_now,
          'updatedAt', v_now
        );
        v_signer := jsonb_set(v_signer, '{coordinatorApplication}', v_current_application, true);
        v_changed_fields := array_append(v_changed_fields, 'coordinatorApplication.status');
      end if;
    end if;

    if v_signer is not null and p_action <> 'resume_verified_supporter' then
      if v_original_signer is null then
        v_signers := jsonb_build_array(v_signer) || v_signers;
      else
        select coalesce(jsonb_agg(
          case when signer_item ->> 'id' = v_supporter_id then v_signer else signer_item end
        ), '[]'::jsonb)
          into v_signers
        from jsonb_array_elements(v_signers) signer_item;
      end if;
    end if;

    select jsonb_build_object(
      'total', count(*) filter (where supporter ->> 'campaignId' = p_campaign_id),
      'verified', count(*) filter (
        where supporter ->> 'campaignId' = p_campaign_id and supporter ->> 'status' = 'verified'
      ),
      'pending', count(*) filter (
        where supporter ->> 'campaignId' = p_campaign_id and supporter ->> 'status' = 'pending'
      ),
      'duplicates', count(*) filter (
        where supporter ->> 'campaignId' = p_campaign_id and supporter ->> 'status' = 'duplicate'
      ),
      'online', count(*) filter (
        where supporter ->> 'campaignId' = p_campaign_id
          and (supporter ->> 'source' = 'online' or coalesce(supporter ->> 'digitalSupportedAt', '') <> '')
      ),
      'scanned', count(*) filter (
        where supporter ->> 'campaignId' = p_campaign_id and supporter ->> 'source' = 'scan'
      ),
      'digitalSupporters', count(*) filter (
        where supporter ->> 'campaignId' = p_campaign_id
          and (supporter ->> 'source' = 'online' or coalesce(supporter ->> 'digitalSupportedAt', '') <> '')
          and supporter ->> 'status' = 'verified'
      ),
      'paperRecordsDigitised', count(*) filter (
        where supporter ->> 'campaignId' = p_campaign_id and supporter ->> 'source' in ('scan', 'field')
      ),
      'verifiedSupporters', count(*) filter (
        where supporter ->> 'campaignId' = p_campaign_id and supporter ->> 'status' = 'verified'
      ),
      'activeGeographyCoverage', count(distinct concat_ws('|',
        supporter ->> 'stateId', supporter ->> 'state',
        supporter ->> 'districtId', supporter ->> 'district'
      )) filter (
        where supporter ->> 'campaignId' = p_campaign_id
          and supporter ->> 'status' = 'verified'
          and coalesce(supporter ->> 'stateId', supporter ->> 'state', '') <> ''
      )
    )
      into v_metrics
    from jsonb_array_elements(v_signers) supporter;

    v_metrics := v_metrics || jsonb_build_object(
      'paperRecordsReceived', greatest(
        coalesce((v_metrics ->> 'paperRecordsDigitised')::integer, 0),
        (
          select count(*)
          from jsonb_array_elements(coalesce(v_workspace_data -> 'scanItems', '[]'::jsonb)) scan_item
          where scan_item ->> 'campaignId' = p_campaign_id
        )
      ),
      'paperRecordsPending', (
        select count(*)
        from jsonb_array_elements(coalesce(v_workspace_data -> 'scanItems', '[]'::jsonb)) scan_item
        where scan_item ->> 'campaignId' = p_campaign_id
          and scan_item ->> 'status' = 'Needs review'
      ),
      'progress', case
        when greatest(
          coalesce((v_campaign ->> 'maxSignersAllowed')::integer, 0),
          coalesce((v_campaign ->> 'goal')::integer, 0)
        ) > 0 then least(100, round(
          coalesce((v_metrics ->> 'verifiedSupporters')::numeric, 0) * 100
          / greatest(
            coalesce((v_campaign ->> 'maxSignersAllowed')::integer, 0),
            coalesce((v_campaign ->> 'goal')::integer, 0)
          )
        ))
        else 0
      end,
      'coordinatorCounts', jsonb_build_object(
        'total', (
          select count(*) from public.voiceup_coordinators coordinator
          where coordinator.workspace_id = p_workspace_id and coordinator.deleted_at is null
        ),
        'active', (
          select count(*) from public.voiceup_coordinators coordinator
          where coordinator.workspace_id = p_workspace_id
            and coordinator.deleted_at is null and coordinator.status = 'active'
        )
      )
    );

    if v_signer is not null then
      v_missing_fields := array[]::text[];
      for v_required_field in
        select required_field #>> '{}'
        from jsonb_array_elements(
          case
            when jsonb_typeof(v_campaign -> 'requiredFields') = 'array'
              and jsonb_array_length(v_campaign -> 'requiredFields') > 0
              then v_campaign -> 'requiredFields'
            else '["name","phone"]'::jsonb
          end
        ) required_field
      loop
        if v_required_field = 'phone' then
          if v_phone is null then v_missing_fields := array_append(v_missing_fields, 'phone'); end if;
        elsif btrim(coalesce(v_signer ->> v_required_field, '')) = '' then
          v_missing_fields := array_append(v_missing_fields, v_required_field);
        end if;
      end loop;

      v_safe_signer := jsonb_strip_nulls(jsonb_build_object(
        'id', v_signer -> 'id',
        'campaignId', v_signer -> 'campaignId',
        'name', v_signer -> 'name',
        'email', v_signer -> 'email',
        'phone', v_signer -> 'phone',
        'whatsappNumber', v_signer -> 'whatsappNumber',
        'telegramHandle', v_signer -> 'telegramHandle',
        'otpVerified', true,
        'selectedAuthorityId', v_signer -> 'selectedAuthorityId',
        'selectedAuthorityName', v_signer -> 'selectedAuthorityName',
        'countryId', v_signer -> 'countryId',
        'country', v_signer -> 'country',
        'stateId', v_signer -> 'stateId',
        'state', v_signer -> 'state',
        'districtId', v_signer -> 'districtId',
        'district', v_signer -> 'district',
        'blockId', v_signer -> 'blockId',
        'block', v_signer -> 'block',
        'panchayatId', v_signer -> 'panchayatId',
        'panchayat', v_signer -> 'panchayat',
        'wardId', v_signer -> 'wardId',
        'ward', v_signer -> 'ward',
        'address', v_signer -> 'address',
        'postalCode', v_signer -> 'postalCode',
        'comment', v_signer -> 'comment',
        'source', v_signer -> 'source',
        'status', v_signer -> 'status',
        'signedAt', v_signer -> 'signedAt',
        'supportSubmittedAt', v_signer -> 'supportSubmittedAt',
        'profileUpdatedAt', v_signer -> 'profileUpdatedAt',
        'languagePreference', v_signer -> 'languagePreference',
        'communicationPreference', v_signer -> 'communicationPreference',
        'volunteerInterest', v_signer -> 'volunteerInterest',
        'coordinatorInterest', v_signer -> 'coordinatorInterest',
        'profilePhotoPath', v_signer -> 'profilePhotoPath',
        'profilePhotoUpdatedAt', v_signer -> 'profilePhotoUpdatedAt',
        'referralCode', v_signer -> 'referralCode',
        'referredBy', v_signer -> 'referredBy',
        'referredByPhoneOrCode', v_signer -> 'referredByPhoneOrCode',
        'referralSource', v_signer -> 'referralSource',
        'consentAccepted', v_signer -> 'consentAccepted',
        'consentTextSnapshot', v_signer -> 'consentTextSnapshot',
        'consentVersion', v_signer -> 'consentVersion',
        'consentAcceptedAt', v_signer -> 'consentAcceptedAt',
        'consentSource', v_signer -> 'consentSource',
        'consentCampaignId', v_signer -> 'consentCampaignId',
        'consentWorkspaceId', v_signer -> 'consentWorkspaceId',
        'consentEvidence', v_signer -> 'consentEvidence',
        'consents', case
          when v_signer ? 'consents' then v_signer -> 'consents'
          when coalesce(v_signer ->> 'consentAccepted', 'false') = 'true' then
            jsonb_build_object('campaignSupport', jsonb_build_object(
              'granted', true,
              'recordedAt', v_signer -> 'consentAcceptedAt',
              'version', coalesce(v_signer -> 'consentVersion', '"legacy-campaign-support"'::jsonb),
              'captureSource', coalesce(v_signer -> 'consentSource', '"legacy"'::jsonb),
              'campaignId', p_campaign_id,
              'supporterId', v_supporter_id
            ))
          else null
        end,
        'coordinatorApplication', v_signer -> 'coordinatorApplication',
        'profileCompletion', jsonb_build_object(
          'requiredFields', coalesce(v_campaign -> 'requiredFields', '["name","phone"]'::jsonb),
          'missingFields', to_jsonb(v_missing_fields),
          'profileUpdatedAt', coalesce(v_signer -> 'profileUpdatedAt', v_signer -> 'draftUpdatedAt')
        )
      ));
    else
      v_safe_signer := null;
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'action', p_action,
      'signer', v_safe_signer,
      'profile', v_safe_signer,
      'supporterStatus', coalesce(v_safe_signer ->> 'status', 'not_started'),
      'coordinatorApplicationStatus', v_safe_signer #>> '{coordinatorApplication,status}',
      'metrics', v_metrics,
      'message', case p_action
        when 'save_draft' then 'Your verified draft has been saved.'
        when 'submit_support' then 'Thank you. Your support has been recorded.'
        when 'resume_verified_supporter' then
          case when v_safe_signer is null then 'No saved supporter profile was found.' else 'Your verified profile has been restored.' end
        when 'update_profile' then 'Your supporter profile has been updated.'
        when 'record_consents' then 'Your consent preferences have been updated.'
        when 'submit_coordinator_application' then 'Your coordinator application is pending approval.'
        else 'Coordinator application status synchronized.'
      end
    );

    v_audit_event := jsonb_build_object(
      'id', 'audit-' || replace(gen_random_uuid()::text, '-', ''),
      'action', 'public_participation.' || p_action,
      'campaignId', p_campaign_id,
      'supporterId', v_supporter_id,
      'identityHash', v_identity_hash,
      'idempotencyKey', p_idempotency_key,
      'createdAt', v_now,
      'source', v_source,
      'changedFields', to_jsonb(v_changed_fields),
      'consentVersion', v_support_consent_version,
      'coordinatorApplicationTransition', v_coordinator_transition,
      'metadata', jsonb_strip_nulls(jsonb_build_object(
        'requestId', left(coalesce(p_server_metadata ->> 'requestId', ''), 160),
        'clientHash', left(coalesce(p_server_metadata ->> 'clientHash', ''), 160),
        'transactionStartedAt', v_now
      ))
    );

    select coalesce(jsonb_agg(audit_row.value), '[]'::jsonb)
      into v_audit_logs
    from (
      select *
      from (
        select v_audit_event as value, 0 as ordering
        union all
        select audit_item, audit_ordinality::integer
        from jsonb_array_elements(coalesce(v_workspace_data -> 'auditLogs', '[]'::jsonb))
          with ordinality as prior(audit_item, audit_ordinality)
      ) bounded_audit
      order by ordering
      limit 500
    ) audit_row;

    select coalesce(jsonb_agg(history_row.value), '[]'::jsonb)
      into v_idempotency
    from (
      select *
      from (
        select jsonb_build_object(
          'key', p_idempotency_key,
          'campaignId', p_campaign_id,
          'supporterId', v_supporter_id,
          'identityHash', v_identity_hash,
          'action', p_action,
          'createdAt', v_now,
          'result', v_result
        ) as value, 0 as ordering
        union all
        select history_item, history_ordinality::integer
        from jsonb_array_elements(v_idempotency)
          with ordinality as prior(history_item, history_ordinality)
      ) bounded_idempotency
      order by ordering
      limit 100
    ) history_row;

    v_workspace_data := v_workspace_data
      || jsonb_build_object(
        'signers', v_signers,
        'auditLogs', v_audit_logs,
        'publicParticipationIdempotency', v_idempotency
      );

    -- Exactly one workspace persistence occurs while the row lock is held.
    update public.voiceup_workspaces
    set data = v_workspace_data,
        updated_at = v_now
    where id = p_workspace_id;

    update public.voiceup_public_campaign_index
    set metrics = v_metrics,
        updated_at = v_now
    where workspace_id = p_workspace_id
      and campaign_id = p_campaign_id;

    return v_result;
  exception
    when lock_not_available or query_canceled then
      return jsonb_build_object(
        'ok', false,
        'code', 'busy',
        'retryable', true,
        'message', 'Participation is busy. Retry safely with the same idempotency key.'
      );
  end;
end;
$$;

-- Supabase may install pgcrypto in its managed extensions schema. Discover and
-- validate that schema before pinning it into the SECURITY DEFINER search path.
do $public_participation_pgcrypto_search_path$
declare
  pgcrypto_schema name;
  digest_function_oid oid;
  digest_return_type regtype;
  rpc_function_oid oid;
  rpc_return_type regtype;
begin
  select extension_schema.nspname
    into pgcrypto_schema
  from pg_extension extension_info
  join pg_namespace extension_schema on extension_schema.oid = extension_info.extnamespace
  where extension_info.extname = 'pgcrypto';

  if pgcrypto_schema is null then
    raise exception 'Public participation pgcrypto prerequisite failed: extension pgcrypto is not installed.';
  end if;

  digest_function_oid := to_regprocedure(format('%I.digest(text,text)', pgcrypto_schema));
  if digest_function_oid is null then
    raise exception 'Public participation pgcrypto prerequisite failed: %.digest(text,text) is missing.',
      pgcrypto_schema;
  end if;

  select function_info.prorettype::regtype
    into digest_return_type
  from pg_proc function_info
  where function_info.oid = digest_function_oid;

  if digest_return_type <> 'bytea'::regtype then
    raise exception 'Public participation pgcrypto prerequisite failed: %.digest(text,text) must return bytea, found %.',
      pgcrypto_schema,
      digest_return_type;
  end if;

  rpc_function_oid := to_regprocedure(
    'public.mutate_voiceup_public_participation(text,text,text,text,text,text,text,jsonb,jsonb)'
  );
  if rpc_function_oid is null then
    raise exception 'Public participation pgcrypto prerequisite failed: mutation RPC is missing.';
  end if;

  select function_info.prorettype::regtype
    into rpc_return_type
  from pg_proc function_info
  where function_info.oid = rpc_function_oid;

  if rpc_return_type <> 'jsonb'::regtype then
    raise exception 'Public participation pgcrypto prerequisite failed: mutation RPC must return jsonb, found %.',
      rpc_return_type;
  end if;

  execute format(
    'alter function public.mutate_voiceup_public_participation(text,text,text,text,text,text,text,jsonb,jsonb) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
end
$public_participation_pgcrypto_search_path$;

revoke all on function public.mutate_voiceup_public_participation(
  text, text, text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.mutate_voiceup_public_participation(
  text, text, text, text, text, text, text, jsonb, jsonb
) to service_role;

comment on function public.mutate_voiceup_public_participation(
  text, text, text, text, text, text, text, jsonb, jsonb
) is
  'Atomic public participation boundary. Whole-workspace row locking is an accepted temporary scaling constraint.';

COMMIT;
