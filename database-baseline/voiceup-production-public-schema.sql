


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."approve_voiceup_scan_review_item"("p_workspace_id" "text", "p_campaign_id" "text", "p_review_item_id" "text", "p_expected_version" integer, "p_upload_fingerprint" "text", "p_source_reference" "text", "p_source_row_fingerprint" "text", "p_approval_key" "text", "p_review_payload" "jsonb", "p_supporter_fields" "jsonb", "p_consent" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actor_id uuid := auth.uid();
  workspace_state jsonb;
  workspace_review_payload jsonb;
  review public.voiceup_scan_review_items%rowtype;
  existing_ledger public.voiceup_scan_approval_ledger%rowtype;
  duplicate_supporter public.voiceup_scan_supporters%rowtype;
  v_supporter_id text;
  v_supporter_payload jsonb;
  audit_id uuid;
  expected_source_row_fingerprint text;
  expected_approval_key text;
  v_normalized_name text;
  v_normalized_email text;
  v_normalized_phone text;
  v_supporter_identity_key text;
  v_duplicate_supporter_id text;
  v_result_code text;
  v_safe_message text;
begin
  if actor_id is null or not public.voiceup_can_approve_field_collection(p_workspace_id, p_campaign_id) then
    return jsonb_build_object(
      'code', 'unauthorized', 'blocking', true,
      'message', 'You are not authorized to approve this Field Collection review item.',
      'reviewItemId', p_review_item_id
    );
  end if;

  select data into workspace_state
  from public.voiceup_workspaces
  where id = p_workspace_id
  for update;

  if workspace_state is null then
    return jsonb_build_object(
      'code', 'review_item_not_found', 'blocking', true,
      'message', 'The Field Collection workspace could not be found.',
      'reviewItemId', p_review_item_id
    );
  end if;

  select scan
  into workspace_review_payload
  from jsonb_array_elements(
    case when jsonb_typeof(workspace_state -> 'scanItems') = 'array'
      then workspace_state -> 'scanItems' else '[]'::jsonb end
  ) scan
  where scan ->> 'id' = p_review_item_id
    and scan ->> 'campaignId' = p_campaign_id
  limit 1;

  expected_source_row_fingerprint := public.voiceup_identity_key(
    'voiceup-source-row-v1',
    array[p_workspace_id, p_campaign_id, p_upload_fingerprint, p_source_reference]
  );
  expected_approval_key := public.voiceup_identity_key(
    'voiceup-approval-v1',
    array[p_workspace_id, p_campaign_id, p_review_item_id, expected_source_row_fingerprint]
  );

  if p_source_row_fingerprint <> expected_source_row_fingerprint
    or p_approval_key <> expected_approval_key then
    return jsonb_build_object(
      'code', 'validation_failed', 'blocking', true,
      'message', 'The approval identity is invalid. Refresh the review item and try again.',
      'reviewItemId', p_review_item_id
    );
  end if;

  select * into existing_ledger
  from public.voiceup_scan_approval_ledger ledger
  where ledger.approval_key = p_approval_key;

  if found then
    insert into public.voiceup_field_collection_audit (
      actor_user_id, workspace_id, campaign_id, review_item_id, supporter_id,
      approval_key, source_row_fingerprint, result_code, audit_payload
    ) values (
      actor_id, p_workspace_id, p_campaign_id, p_review_item_id, existing_ledger.supporter_id,
      p_approval_key, p_source_row_fingerprint, 'approval_already_completed',
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'action', 'scan.approval_retried',
        'actor', actor_id::text,
        'campaignId', p_campaign_id,
        'description', 'Repeated Field Collection approval returned the existing supporter.',
        'createdAt', now(),
        'metadata', jsonb_build_object(
          'workspaceId', p_workspace_id,
          'reviewItemId', p_review_item_id,
          'supporterId', existing_ledger.supporter_id,
          'approvalKey', p_approval_key,
          'sourceRowFingerprint', p_source_row_fingerprint,
          'resultCode', 'approval_already_completed'
        )
      )
    );
    update public.voiceup_workspaces set data = data, updated_at = now() where id = p_workspace_id;
    return jsonb_build_object(
      'code', 'approval_already_completed', 'blocking', false,
      'message', 'This review item was already approved. The existing supporter was returned.',
      'reviewItemId', p_review_item_id,
      'supporterId', existing_ledger.supporter_id
    );
  end if;

  if workspace_review_payload is not null
    and coalesce(workspace_review_payload ->> 'status', 'Needs review') <> 'Needs review' then
    return jsonb_build_object(
      'code', case when workspace_review_payload ->> 'status' = 'Approved'
        then 'already_approved' else 'validation_failed' end,
      'blocking', workspace_review_payload ->> 'status' <> 'Approved',
      'message', case when workspace_review_payload ->> 'status' = 'Approved'
        then 'This review item is already approved.'
        else 'Only review items that still need review can be approved.' end,
      'reviewItemId', p_review_item_id,
      'supporterId', workspace_review_payload ->> 'supporterId'
    );
  end if;

  select * into duplicate_supporter
  from public.voiceup_scan_supporters supporter
  where supporter.workspace_id = p_workspace_id
    and supporter.campaign_id = p_campaign_id
    and supporter.source_row_fingerprint = p_source_row_fingerprint
  limit 1;

  if found and duplicate_supporter.review_item_id <> p_review_item_id then
    insert into public.voiceup_field_collection_audit (
      actor_user_id, workspace_id, campaign_id, review_item_id, supporter_id,
      approval_key, source_row_fingerprint, result_code, audit_payload
    ) values (
      actor_id, p_workspace_id, p_campaign_id, p_review_item_id, duplicate_supporter.supporter_id,
      p_approval_key, p_source_row_fingerprint, 'same_source_row_blocked',
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'action', 'scan.duplicate_blocked',
        'actor', actor_id::text,
        'campaignId', p_campaign_id,
        'description', 'A duplicate source row was blocked during Field Collection approval.',
        'createdAt', now(),
        'metadata', jsonb_build_object(
          'workspaceId', p_workspace_id,
          'reviewItemId', p_review_item_id,
          'matchedSupporterId', duplicate_supporter.supporter_id,
          'approvalKey', p_approval_key,
          'sourceRowFingerprint', p_source_row_fingerprint,
          'resultCode', 'same_source_row_blocked'
        )
      )
    );
    return jsonb_build_object(
      'code', 'same_source_row_blocked', 'blocking', true,
      'message', 'This source row has already produced a supporter in this campaign.',
      'reviewItemId', p_review_item_id,
      'matchedSupporterId', duplicate_supporter.supporter_id
    );
  end if;

  insert into public.voiceup_scan_review_items (
    review_item_id, workspace_id, campaign_id, upload_fingerprint,
    source_row_fingerprint, status, raw_fields, consent, review_payload, version
  ) values (
    p_review_item_id, p_workspace_id, p_campaign_id, p_upload_fingerprint,
    p_source_row_fingerprint, 'needs_review', coalesce(p_supporter_fields, '{}'::jsonb),
    coalesce(p_consent, '{}'::jsonb), coalesce(p_review_payload, '{}'::jsonb),
    greatest(coalesce(p_expected_version, 1), 1)
  ) on conflict (review_item_id) do nothing;

  select * into review
  from public.voiceup_scan_review_items item
  where item.review_item_id = p_review_item_id
  for update;

  if not found or review.workspace_id <> p_workspace_id or review.campaign_id <> p_campaign_id then
    return jsonb_build_object(
      'code', 'review_item_not_found', 'blocking', true,
      'message', 'The review item could not be found in this campaign.',
      'reviewItemId', p_review_item_id
    );
  end if;

  if review.status = 'approved' and review.supporter_id is not null then
    return jsonb_build_object(
      'code', 'already_approved', 'blocking', false,
      'message', 'This review item is already approved.',
      'reviewItemId', p_review_item_id,
      'supporterId', review.supporter_id
    );
  end if;

  audit_id := gen_random_uuid();
  insert into public.voiceup_field_collection_audit (
    id, actor_user_id, workspace_id, campaign_id, review_item_id, approval_key,
    source_row_fingerprint, result_code, audit_payload
  ) values (
    audit_id, actor_id, p_workspace_id, p_campaign_id, p_review_item_id, p_approval_key,
    p_source_row_fingerprint, 'approval_requested',
    jsonb_build_object(
      'id', audit_id::text,
      'action', 'scan.approval_requested',
      'actor', actor_id::text,
      'campaignId', p_campaign_id,
      'description', 'Field Collection approval requested.',
      'createdAt', now(),
      'metadata', jsonb_build_object(
        'workspaceId', p_workspace_id,
        'reviewItemId', p_review_item_id,
        'approvalKey', p_approval_key,
        'sourceRowFingerprint', p_source_row_fingerprint,
        'resultCode', 'approval_requested'
      )
    )
  );

  if review.version <> coalesce(p_expected_version, 1) then
    insert into public.voiceup_field_collection_audit (
      actor_user_id, workspace_id, campaign_id, review_item_id, approval_key,
      source_row_fingerprint, result_code, audit_payload
    ) values (
      actor_id, p_workspace_id, p_campaign_id, p_review_item_id, p_approval_key,
      p_source_row_fingerprint, 'stale_review_version',
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'action', 'scan.approval_conflict',
        'actor', actor_id::text,
        'campaignId', p_campaign_id,
        'description', 'A stale Field Collection approval was rejected.',
        'createdAt', now(),
        'metadata', jsonb_build_object(
          'workspaceId', p_workspace_id,
          'reviewItemId', p_review_item_id,
          'approvalKey', p_approval_key,
          'sourceRowFingerprint', p_source_row_fingerprint,
          'resultCode', 'stale_review_version'
        )
      )
    );
    return jsonb_build_object(
      'code', 'stale_review_version', 'blocking', true,
      'message', 'This review item changed in another session. Refresh before approving.',
      'reviewItemId', p_review_item_id
    );
  end if;

  if review.status <> 'needs_review' then
    return jsonb_build_object(
      'code', 'validation_failed', 'blocking', true,
      'message', 'Only review items that still need review can be approved.',
      'reviewItemId', p_review_item_id
    );
  end if;

  v_normalized_name := public.voiceup_normalize_person_name(p_supporter_fields ->> 'name');
  v_normalized_email := public.voiceup_normalize_email(p_supporter_fields ->> 'email');
  v_normalized_phone := public.voiceup_normalize_indian_phone(p_supporter_fields ->> 'phone');

  if v_normalized_name is null or v_normalized_name = '' then
    v_result_code := 'validation_failed';
    v_safe_message := 'Enter the supporter name before approval.';
  elsif coalesce(p_consent ->> 'paperConsentRecorded', 'false') <> 'true' then
    v_result_code := 'consent_missing';
    v_safe_message := 'Paper digitization consent is required before approval.';
  end if;

  if v_result_code is not null then
    insert into public.voiceup_field_collection_audit (
      actor_user_id, workspace_id, campaign_id, review_item_id, approval_key,
      source_row_fingerprint, result_code, audit_payload
    ) values (
      actor_id, p_workspace_id, p_campaign_id, p_review_item_id, p_approval_key,
      p_source_row_fingerprint, v_result_code,
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'action', case when v_result_code = 'consent_missing' then 'scan.consent_missing' else 'scan.validation_failed' end,
        'actor', actor_id::text,
        'campaignId', p_campaign_id,
        'description', v_safe_message,
        'createdAt', now(),
        'metadata', jsonb_build_object(
          'workspaceId', p_workspace_id,
          'reviewItemId', p_review_item_id,
          'approvalKey', p_approval_key,
          'sourceRowFingerprint', p_source_row_fingerprint,
          'resultCode', v_result_code
        )
      )
    );
    return jsonb_build_object(
      'code', v_result_code, 'blocking', true, 'message', v_safe_message,
      'reviewItemId', p_review_item_id
    );
  end if;

  if v_normalized_phone is not null then
    select * into duplicate_supporter
    from public.voiceup_scan_supporters supporter
    where supporter.workspace_id = p_workspace_id
      and supporter.campaign_id = p_campaign_id
      and supporter.normalized_phone = v_normalized_phone
    limit 1;

    if found then
      v_duplicate_supporter_id := duplicate_supporter.supporter_id;
    else
      select signer ->> 'id'
      into v_duplicate_supporter_id
      from jsonb_array_elements(
        case when jsonb_typeof(workspace_state -> 'signers') = 'array'
          then workspace_state -> 'signers' else '[]'::jsonb end
      ) signer
      where signer ->> 'campaignId' = p_campaign_id
        and public.voiceup_normalize_indian_phone(signer ->> 'phone') = v_normalized_phone
      limit 1;
    end if;

    if v_duplicate_supporter_id is not null then
      insert into public.voiceup_field_collection_audit (
        actor_user_id, workspace_id, campaign_id, review_item_id, supporter_id,
        approval_key, source_row_fingerprint, result_code, audit_payload
      ) values (
        actor_id, p_workspace_id, p_campaign_id, p_review_item_id, v_duplicate_supporter_id,
        p_approval_key, p_source_row_fingerprint, 'exact_phone_duplicate_blocked',
        jsonb_build_object(
          'id', gen_random_uuid()::text,
          'action', 'scan.duplicate_blocked',
          'actor', actor_id::text,
          'campaignId', p_campaign_id,
          'description', 'A verified phone duplicate was blocked during Field Collection approval.',
          'createdAt', now(),
          'metadata', jsonb_build_object(
            'workspaceId', p_workspace_id,
            'reviewItemId', p_review_item_id,
            'matchedSupporterId', v_duplicate_supporter_id,
            'approvalKey', p_approval_key,
            'sourceRowFingerprint', p_source_row_fingerprint,
            'resultCode', 'exact_phone_duplicate_blocked'
          )
        )
      );
      return jsonb_build_object(
        'code', 'exact_phone_duplicate_blocked', 'blocking', true,
        'message', 'A supporter with this verified phone already exists in this campaign.',
        'reviewItemId', p_review_item_id,
        'matchedSupporterId', v_duplicate_supporter_id
      );
    end if;
  end if;

  v_supporter_identity_key := case
    when v_normalized_phone is not null then public.voiceup_identity_key(
      'voiceup-supporter-phone-v1', array[p_workspace_id, p_campaign_id, v_normalized_phone]
    )
    when v_normalized_email is not null then public.voiceup_identity_key(
      'voiceup-supporter-email-v1', array[p_workspace_id, p_campaign_id, v_normalized_email]
    )
    else public.voiceup_identity_key(
      'voiceup-supporter-source-name-v1',
      array[p_workspace_id, p_campaign_id, v_normalized_name, p_source_row_fingerprint]
    )
  end;

  v_supporter_id := gen_random_uuid()::text;
  v_supporter_payload := coalesce(p_supporter_fields, '{}'::jsonb)
    || jsonb_build_object(
      'id', v_supporter_id,
      'campaignId', p_campaign_id,
      'source', 'scan',
      'status', 'pending',
      'signedAt', now(),
      'sourceScanItemId', p_review_item_id,
      'sourceRowFingerprint', p_source_row_fingerprint,
      'approvalKey', p_approval_key,
      'paperConsentRecorded', true
    );

  insert into public.voiceup_scan_supporters (
    supporter_id, workspace_id, campaign_id, review_item_id, source_row_fingerprint,
    supporter_identity_key, normalized_name, normalized_email, normalized_phone,
    raw_fields, supporter_payload
  ) values (
    v_supporter_id, p_workspace_id, p_campaign_id, p_review_item_id, p_source_row_fingerprint,
    v_supporter_identity_key, v_normalized_name, v_normalized_email, v_normalized_phone,
    coalesce(p_supporter_fields, '{}'::jsonb), v_supporter_payload
  );

  update public.voiceup_scan_review_items
  set status = 'approved',
      raw_fields = coalesce(p_supporter_fields, '{}'::jsonb),
      normalized_name = v_normalized_name,
      normalized_email = v_normalized_email,
      normalized_phone = v_normalized_phone,
      consent = coalesce(p_consent, '{}'::jsonb),
      review_payload = coalesce(p_review_payload, '{}'::jsonb),
      supporter_id = v_supporter_id,
      approval_key = p_approval_key,
      version = version + 1,
      updated_at = now()
  where review_item_id = p_review_item_id;

  insert into public.voiceup_scan_approval_ledger (
    approval_key, review_item_id, workspace_id, campaign_id, source_row_fingerprint,
    supporter_id, actor_user_id, duplicate_decision, result_status
  ) values (
    p_approval_key, p_review_item_id, p_workspace_id, p_campaign_id, p_source_row_fingerprint,
    v_supporter_id, actor_id, 'no_duplicate', 'approval_completed'
  );

  audit_id := gen_random_uuid();
  insert into public.voiceup_field_collection_audit (
    id, actor_user_id, workspace_id, campaign_id, review_item_id, supporter_id,
    approval_key, source_row_fingerprint, result_code, audit_payload
  ) values (
    audit_id, actor_id, p_workspace_id, p_campaign_id, p_review_item_id, v_supporter_id,
    p_approval_key, p_source_row_fingerprint, 'approval_completed',
    jsonb_build_object(
      'id', audit_id::text,
      'action', 'scan.approved',
      'actor', actor_id::text,
      'campaignId', p_campaign_id,
      'description', 'Approved a Field Collection review item.',
      'createdAt', now(),
      'metadata', jsonb_build_object(
        'workspaceId', p_workspace_id,
        'reviewItemId', p_review_item_id,
        'supporterId', v_supporter_id,
        'approvalKey', p_approval_key,
        'sourceRowFingerprint', p_source_row_fingerprint,
        'resultCode', 'approval_completed'
      )
    )
  );

  update public.voiceup_workspaces
  set data = data, updated_at = now()
  where id = p_workspace_id;

  return jsonb_build_object(
    'code', 'approval_completed', 'blocking', false,
    'message', 'The review item was approved and exactly one supporter was created.',
    'reviewItemId', p_review_item_id,
    'supporterId', v_supporter_id
  );
end;
$$;


ALTER FUNCTION "public"."approve_voiceup_scan_review_item"("p_workspace_id" "text", "p_campaign_id" "text", "p_review_item_id" "text", "p_expected_version" integer, "p_upload_fingerprint" "text", "p_source_reference" "text", "p_source_row_fingerprint" "text", "p_approval_key" "text", "p_review_payload" "jsonb", "p_supporter_fields" "jsonb", "p_consent" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_voiceup_coordinator_geography"("p_workspace_id" "text", "p_geography_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or not public.voiceup_can_manage_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network management is not authorized.';
  end if;
  if exists (select 1 from public.voiceup_coordinators where geography_id = p_geography_id and deleted_at is null)
    or exists (select 1 from public.voiceup_coordinator_geographies where parent_id = p_geography_id and active) then
    raise exception 'Geography is in use and cannot be archived.';
  end if;
  update public.voiceup_coordinator_geographies
  set active = false, updated_at = now()
  where id = p_geography_id and workspace_id = p_workspace_id and active;
  if not found then raise exception 'Geography not found.'; end if;
  insert into public.voiceup_coordinator_audit (workspace_id, actor_user_id, action, metadata)
  values (p_workspace_id, actor_id, 'coordinator.geography_archived', jsonb_build_object('geographyId', p_geography_id));
  return jsonb_build_object('id', p_geography_id, 'archived', true);
end;
$$;


ALTER FUNCTION "public"."archive_voiceup_coordinator_geography"("p_workspace_id" "text", "p_geography_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actor_id uuid := auth.uid();
  coordinator_record public.voiceup_coordinators%rowtype;
begin
  if actor_id is null or not public.voiceup_can_manage_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network management is not authorized.';
  end if;
  select * into coordinator_record from public.voiceup_coordinators
  where id = p_coordinator_id and workspace_id = p_workspace_id and deleted_at is null for update;
  if not found then raise exception 'Coordinator not found.'; end if;
  if coordinator_record.version <> p_expected_version then
    raise exception 'Coordinator changed since it was opened. Refresh and retry.';
  end if;
  if exists (
    select 1 from public.voiceup_coordinators child
    where child.reports_to_coordinator_id = p_coordinator_id and child.deleted_at is null
  ) then raise exception 'Reassign direct reports before deleting this coordinator.'; end if;
  update public.voiceup_coordinators
  set status = 'inactive', deleted_at = now(), version = version + 1, updated_by = actor_id, updated_at = now()
  where id = p_coordinator_id;
  update public.voiceup_coordinator_campaigns
  set active = false, revoked_at = now()
  where coordinator_id = p_coordinator_id and active;
  insert into public.voiceup_coordinator_audit (
    workspace_id, coordinator_id, actor_user_id, action, metadata
  ) values (p_workspace_id, p_coordinator_id, actor_id, 'coordinator.deleted', jsonb_build_object('role', coordinator_record.role));
  return jsonb_build_object('id', p_coordinator_id, 'deleted', true);
end;
$$;


ALTER FUNCTION "public"."delete_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_voiceup_coordinator_network"("p_workspace_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.voiceup_can_read_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network access is not authorized.';
  end if;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'canManage', public.voiceup_can_manage_coordinator_network(p_workspace_id),
    'coordinators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', coordinator.id,
        'workspaceId', coordinator.workspace_id,
        'authUserId', coordinator.auth_user_id,
        'fullName', coordinator.full_name,
        'phone', coordinator.phone,
        'email', coordinator.email,
        'photoPath', coordinator.photo_path,
        'role', coordinator.role,
        'status', coordinator.status,
        'geographyId', coordinator.geography_id,
        'postalCode', coordinator.postal_code,
        'reportsToCoordinatorId', coordinator.reports_to_coordinator_id,
        'referralCode', coordinator.referral_code,
        'referredByCoordinatorId', coordinator.referred_by_coordinator_id,
        'mobileVerifiedAt', coordinator.mobile_verified_at,
        'notes', coordinator.notes,
        'version', coordinator.version,
        'createdAt', coordinator.created_at,
        'updatedAt', coordinator.updated_at
      ) order by coordinator.full_name)
      from public.voiceup_coordinators coordinator
      where coordinator.workspace_id = p_workspace_id and coordinator.deleted_at is null
    ), '[]'::jsonb),
    'geographies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', geography.id,
        'workspaceId', geography.workspace_id,
        'parentId', geography.parent_id,
        'level', geography.level,
        'name', geography.name,
        'path', geography.path,
        'depth', geography.depth
      ) order by geography.path)
      from public.voiceup_coordinator_geographies geography
      where geography.workspace_id = p_workspace_id and geography.active
    ), '[]'::jsonb),
    'campaignLinks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coordinatorId', link.coordinator_id,
        'campaignId', link.campaign_id,
        'assignedAt', link.assigned_at
      )) from public.voiceup_coordinator_campaigns link
      where link.workspace_id = p_workspace_id and link.active
    ), '[]'::jsonb),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', referral.id,
        'inviterCoordinatorId', referral.inviter_coordinator_id,
        'referredCoordinatorId', referral.referred_coordinator_id,
        'referralCode', referral.referral_code,
        'status', referral.status,
        'acceptedAt', referral.accepted_at
      ) order by referral.created_at desc)
      from public.voiceup_coordinator_referrals referral
      where referral.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(activity_row.payload order by activity_row.created_at desc)
      from (
        select audit.created_at, jsonb_build_object(
          'id', audit.id,
          'coordinatorId', audit.coordinator_id,
          'action', audit.action,
          'metadata', audit.metadata,
          'createdAt', audit.created_at
        ) as payload
        from public.voiceup_coordinator_audit audit
        where audit.workspace_id = p_workspace_id
        order by audit.created_at desc
        limit 200
      ) activity_row
    ), '[]'::jsonb)
  );
end;
$$;


ALTER FUNCTION "public"."get_voiceup_coordinator_network"("p_workspace_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mutate_voiceup_public_participation"("p_workspace_id" "text", "p_campaign_id" "text", "p_campaign_slug" "text", "p_action" "text", "p_phone" "text", "p_verification_token" "text", "p_idempotency_key" "text", "p_payload" "jsonb", "p_server_metadata" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $_$
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

      v_safe_signer := jsonb_strip_nulls(
        jsonb_build_object(
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
          'source', v_signer -> 'source'
        )
        ||
        jsonb_build_object(
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
          'consentEvidence', v_signer -> 'consentEvidence'
        )
        ||
        jsonb_build_object(
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
        )
      );
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
$_$;


ALTER FUNCTION "public"."mutate_voiceup_public_participation"("p_workspace_id" "text", "p_campaign_id" "text", "p_campaign_slug" "text", "p_action" "text", "p_phone" "text", "p_verification_token" "text", "p_idempotency_key" "text", "p_payload" "jsonb", "p_server_metadata" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mutate_voiceup_public_participation"("p_workspace_id" "text", "p_campaign_id" "text", "p_campaign_slug" "text", "p_action" "text", "p_phone" "text", "p_verification_token" "text", "p_idempotency_key" "text", "p_payload" "jsonb", "p_server_metadata" "jsonb") IS 'Atomic public participation boundary. Whole-workspace row locking is an accepted temporary scaling constraint.';



CREATE OR REPLACE FUNCTION "public"."record_voiceup_scan_batch_audit"("p_workspace_id" "text", "p_campaign_id" "text", "p_batch_id" "text", "p_result_code" "text", "p_counts" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actor_id uuid := auth.uid();
  audit_id uuid := gen_random_uuid();
begin
  if actor_id is null or not public.voiceup_can_approve_field_collection(p_workspace_id, p_campaign_id) then
    raise exception 'Unauthorized Field Collection batch audit';
  end if;
  if p_result_code not in ('batch_started', 'batch_completed', 'batch_partial_failure') then
    raise exception 'Unsupported Field Collection batch audit result';
  end if;
  insert into public.voiceup_field_collection_audit (
    id, actor_user_id, workspace_id, campaign_id, result_code, metadata, audit_payload
  ) values (
    audit_id, actor_id, p_workspace_id, p_campaign_id, p_result_code,
    jsonb_build_object('batchId', p_batch_id, 'counts', coalesce(p_counts, '{}'::jsonb)),
    jsonb_build_object(
      'id', audit_id::text,
      'action', case when p_result_code = 'batch_started' then 'scan.batch_started'
        when p_result_code = 'batch_completed' then 'scan.batch_completed'
        else 'scan.batch_partial_failure' end,
      'actor', actor_id::text,
      'campaignId', p_campaign_id,
      'description', case when p_result_code = 'batch_started' then 'Field Collection batch approval started.'
        when p_result_code = 'batch_completed' then 'Field Collection batch approval completed.'
        else 'Field Collection batch approval completed with partial failures.' end,
      'createdAt', now(),
      'metadata', jsonb_build_object(
        'workspaceId', p_workspace_id,
        'batchId', p_batch_id,
        'resultCode', p_result_code,
        'counts', coalesce(p_counts, '{}'::jsonb)
      )
    )
  );
  update public.voiceup_workspaces set data = data, updated_at = now() where id = p_workspace_id;
end;
$$;


ALTER FUNCTION "public"."record_voiceup_scan_batch_audit"("p_workspace_id" "text", "p_campaign_id" "text", "p_batch_id" "text", "p_result_code" "text", "p_counts" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_voiceup_coordinator_status"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_status" "text", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  actor_id uuid := auth.uid();
  coordinator_record public.voiceup_coordinators%rowtype;
begin
  if actor_id is null or not public.voiceup_can_manage_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network management is not authorized.';
  end if;
  if p_status not in ('invited', 'active', 'inactive', 'suspended') then
    raise exception 'Coordinator status is invalid.';
  end if;
  select * into coordinator_record from public.voiceup_coordinators
  where id = p_coordinator_id and workspace_id = p_workspace_id and deleted_at is null for update;
  if not found then raise exception 'Coordinator not found.'; end if;
  if coordinator_record.version <> p_expected_version then
    raise exception 'Coordinator changed since it was opened. Refresh and retry.';
  end if;
  if p_status = 'active' and coordinator_record.mobile_verified_at is null then
    raise exception 'Mobile verification is required before activation.';
  end if;
  update public.voiceup_coordinators
  set status = p_status, version = version + 1, updated_by = actor_id, updated_at = now()
  where id = p_coordinator_id;
  insert into public.voiceup_coordinator_audit (
    workspace_id, coordinator_id, actor_user_id, action, metadata
  ) values (
    p_workspace_id, p_coordinator_id, actor_id, 'coordinator.status_changed',
    jsonb_build_object('from', coordinator_record.status, 'to', p_status)
  );
  return jsonb_build_object('id', p_coordinator_id, 'version', coordinator_record.version + 1, 'status', p_status);
end;
$$;


ALTER FUNCTION "public"."set_voiceup_coordinator_status"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_status" "text", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator" "jsonb", "p_geography" "jsonb", "p_campaign_ids" "text"[] DEFAULT ARRAY[]::"text"[], "p_verification_token" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."upsert_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator" "jsonb", "p_geography" "jsonb", "p_campaign_ids" "text"[], "p_verification_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_can_approve_field_collection"("target_workspace_id" "text", "target_campaign_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.voiceup_workspaces workspace
      where workspace.id = target_workspace_id
        and exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(workspace.data -> 'campaigns') = 'array' then workspace.data -> 'campaigns'
              else '[]'::jsonb
            end
          ) campaign
          where campaign ->> 'id' = target_campaign_id
        )
    )
    and (
      public.voiceup_is_platform_admin()
      or exists (
        select 1
        from public.voiceup_workspace_members member
        where member.workspace_id = target_workspace_id
          and member.user_id = auth.uid()
          and member.active
          and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer')
          and (
            member.role <> 'campaign_admin'
            or public.voiceup_has_active_resource_assignment(
              target_workspace_id,
              'voiceup',
              'campaign',
              target_campaign_id
            )
          )
      )
    );
$$;


ALTER FUNCTION "public"."voiceup_can_approve_field_collection"("target_workspace_id" "text", "target_campaign_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_can_manage_coordinator_network"("target_workspace_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null and (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.voiceup_workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.active
        and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin')
    )
  );
$$;


ALTER FUNCTION "public"."voiceup_can_manage_coordinator_network"("target_workspace_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_can_manage_private_evidence"("target_workspace_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.voiceup_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.active
      and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer')
  );
$$;


ALTER FUNCTION "public"."voiceup_can_manage_private_evidence"("target_workspace_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."voiceup_can_manage_private_evidence"("target_workspace_id" "text") IS 'Returns true only for active workspace members with a pilot role authorised to manage private evidence.';



CREATE OR REPLACE FUNCTION "public"."voiceup_can_manage_workspace_storage"("target_workspace_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.voiceup_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.active
      and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer')
  );
$$;


ALTER FUNCTION "public"."voiceup_can_manage_workspace_storage"("target_workspace_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."voiceup_can_manage_workspace_storage"("target_workspace_id" "text") IS 'Returns true only for active, approved storage managers in the exact workspace path prefix.';



CREATE OR REPLACE FUNCTION "public"."voiceup_can_read_coordinator_network"("target_workspace_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select auth.uid() is not null and (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.voiceup_workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.active
        and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer', 'viewer')
    )
  );
$$;


ALTER FUNCTION "public"."voiceup_can_read_coordinator_network"("target_workspace_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_consume_coordinator_mobile_verification"("target_workspace_id" "text", "normalized_phone" "text", "verification_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."voiceup_consume_coordinator_mobile_verification"("target_workspace_id" "text", "normalized_phone" "text", "verification_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_coordinator_role_level"("target_role" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case target_role
    when 'national_coordinator' then 'country'
    when 'state_coordinator' then 'state'
    when 'district_coordinator' then 'district'
    when 'block_coordinator' then 'block'
    when 'panchayat_coordinator' then 'panchayat'
    when 'ward_coordinator' then 'ward'
    when 'field_coordinator' then 'ward'
    else null
  end;
$$;


ALTER FUNCTION "public"."voiceup_coordinator_role_level"("target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_coordinator_role_rank"("target_role" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case target_role
    when 'national_coordinator' then 7
    when 'state_coordinator' then 6
    when 'district_coordinator' then 5
    when 'block_coordinator' then 4
    when 'panchayat_coordinator' then 3
    when 'ward_coordinator' then 2
    when 'field_coordinator' then 1
    else 0
  end;
$$;


ALTER FUNCTION "public"."voiceup_coordinator_role_rank"("target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_ensure_coordinator_geography"("target_workspace_id" "text", "geography" "jsonb", "actor_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  level_names text[] := array['country', 'state', 'district', 'block', 'panchayat', 'ward'];
  current_level text;
  current_name text;
  current_normalized text;
  current_id uuid;
  parent_geography_id uuid := null;
  parent_path text[] := array[]::text[];
  level_index integer;
  previous_level_index integer := 0;
begin
  for level_index in 1..array_length(level_names, 1) loop
    current_level := level_names[level_index];
    current_name := btrim(coalesce(geography ->> current_level, ''));
    if current_name = '' then
      continue;
    end if;
    if level_index > 1 and previous_level_index <> level_index - 1 then
      raise exception 'Coordinator geography is missing a parent for %.', current_level;
    end if;
    current_normalized := public.voiceup_normalize_person_name(current_name);
    select item.id, item.path
      into current_id, parent_path
    from public.voiceup_coordinator_geographies item
    where item.workspace_id = target_workspace_id
      and item.parent_id is not distinct from parent_geography_id
      and item.level = current_level
      and item.normalized_name = current_normalized
      and item.active
    limit 1;
    if current_id is null then
      insert into public.voiceup_coordinator_geographies (
        workspace_id, parent_id, level, name, normalized_name, path, depth, created_by
      ) values (
        target_workspace_id,
        parent_geography_id,
        current_level,
        current_name,
        current_normalized,
        coalesce(parent_path, array[]::text[]) || current_name,
        level_index - 1,
        actor_id
      ) returning id, path into current_id, parent_path;
      insert into public.voiceup_coordinator_audit (
        workspace_id, actor_user_id, action, metadata
      ) values (
        target_workspace_id,
        actor_id,
        'coordinator.geography_created',
        jsonb_build_object('geographyId', current_id, 'level', current_level, 'name', current_name)
      );
    end if;
    parent_geography_id := current_id;
    previous_level_index := level_index;
    current_id := null;
  end loop;
  return parent_geography_id;
end;
$$;


ALTER FUNCTION "public"."voiceup_ensure_coordinator_geography"("target_workspace_id" "text", "geography" "jsonb", "actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_has_active_resource_assignment"("target_workspace_id" "text", "target_application_key" "text", "target_resource_type" "text", "target_resource_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.workspace_resource_members assignment
    where assignment.workspace_id = target_workspace_id
      and assignment.application_key = target_application_key
      and assignment.resource_type = target_resource_type
      and assignment.resource_id = target_resource_id
      and assignment.user_id = auth.uid()
      and assignment.active
  );
$$;


ALTER FUNCTION "public"."voiceup_has_active_resource_assignment"("target_workspace_id" "text", "target_application_key" "text", "target_resource_type" "text", "target_resource_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_identity_key"("namespace" "text", "parts" "text"[]) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  part text;
  result text := octet_length(convert_to(coalesce(namespace, ''), 'UTF8'))::text || ':' || coalesce(namespace, '');
begin
  foreach part in array coalesce(parts, array[]::text[]) loop
    result := result || '|' || octet_length(convert_to(coalesce(part, ''), 'UTF8'))::text || ':' || coalesce(part, '');
  end loop;
  return result;
end;
$$;


ALTER FUNCTION "public"."voiceup_identity_key"("namespace" "text", "parts" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_members member
    where member.user_id = auth.uid()
      and member.role = 'platform_owner'
  ) or exists (
    select 1
    from public.voiceup_workspace_members member
    where member.user_id = auth.uid()
      and member.role = 'platform_owner'
  );
$$;


ALTER FUNCTION "public"."voiceup_is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_is_workspace_member"("target_workspace_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.voiceup_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = auth.uid()
      and member.active
  );
$$;


ALTER FUNCTION "public"."voiceup_is_workspace_member"("target_workspace_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."voiceup_is_workspace_member"("target_workspace_id" "text") IS 'Returns true only when auth.uid() has an active membership for the requested workspace.';



CREATE OR REPLACE FUNCTION "public"."voiceup_merge_authoritative_field_collection_state"("target_workspace_id" "text", "incoming_state" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  result jsonb := coalesce(incoming_state, '{}'::jsonb);
  incoming_scans jsonb;
  incoming_signers jsonb;
  incoming_audits jsonb;
  merged_scans jsonb;
  merged_signers jsonb;
  merged_audits jsonb;
begin
  incoming_scans := case when jsonb_typeof(result -> 'scanItems') = 'array' then result -> 'scanItems' else '[]'::jsonb end;
  incoming_signers := case when jsonb_typeof(result -> 'signers') = 'array' then result -> 'signers' else '[]'::jsonb end;
  incoming_audits := case when jsonb_typeof(result -> 'auditLogs') = 'array' then result -> 'auditLogs' else '[]'::jsonb end;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into merged_scans
  from (
    select value as item
    from jsonb_array_elements(incoming_scans)
    where not exists (
      select 1
      from public.voiceup_scan_review_items authoritative
      where authoritative.workspace_id = target_workspace_id
        and authoritative.status = 'approved'
        and authoritative.review_item_id = value ->> 'id'
    )
    union all
    select review.review_payload
      || jsonb_build_object(
        'id', review.review_item_id,
        'campaignId', review.campaign_id,
        'status', 'Approved',
        'supporterId', review.supporter_id,
        'approvalKey', review.approval_key,
        'uploadFingerprint', review.upload_fingerprint,
        'sourceRowFingerprint', review.source_row_fingerprint,
        'reviewVersion', review.version,
        'historicalLinkUncertain', review.historical_link_uncertain
      )
    from public.voiceup_scan_review_items review
    where review.workspace_id = target_workspace_id
      and review.status = 'approved'
  ) merged;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into merged_signers
  from (
    select value as item
    from jsonb_array_elements(incoming_signers)
    where not exists (
      select 1
      from public.voiceup_scan_supporters authoritative
      where authoritative.workspace_id = target_workspace_id
        and (
          authoritative.supporter_id = value ->> 'id'
          or authoritative.review_item_id = value ->> 'sourceScanItemId'
        )
    )
    union all
    select supporter.supporter_payload
    from public.voiceup_scan_supporters supporter
    where supporter.workspace_id = target_workspace_id
  ) merged;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into merged_audits
  from (
    select value as item
    from jsonb_array_elements(incoming_audits)
    where not exists (
      select 1
      from public.voiceup_field_collection_audit authoritative
      where authoritative.workspace_id = target_workspace_id
        and authoritative.audit_payload ->> 'id' = value ->> 'id'
    )
    union all
    select audit.audit_payload
    from public.voiceup_field_collection_audit audit
    where audit.workspace_id = target_workspace_id
  ) merged;

  result := jsonb_set(result, '{scanItems}', merged_scans, true);
  result := jsonb_set(result, '{signers}', merged_signers, true);
  result := jsonb_set(result, '{auditLogs}', merged_audits, true);
  return result;
end;
$$;


ALTER FUNCTION "public"."voiceup_merge_authoritative_field_collection_state"("target_workspace_id" "text", "incoming_state" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_normalize_email"("raw_email" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
  select case
    when lower(btrim(coalesce(raw_email, ''))) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      then lower(btrim(raw_email))
    else null
  end;
$_$;


ALTER FUNCTION "public"."voiceup_normalize_email"("raw_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_normalize_indian_phone"("raw_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  compact text := translate(
    regexp_replace(btrim(coalesce(raw_phone, '')), '[[:space:]-]', '', 'g'),
    '()[]',
    ''
  );
begin
  if left(compact, 3) = '+91' and length(compact) = 13 then
    compact := substr(compact, 4);
  elsif left(compact, 2) = '91' and length(compact) = 12 then
    compact := substr(compact, 3);
  end if;
  if compact ~ '^[6-9][0-9]{9}$' then
    return compact;
  end if;
  return null;
end;
$_$;


ALTER FUNCTION "public"."voiceup_normalize_indian_phone"("raw_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_normalize_person_name"("raw_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select lower(regexp_replace(btrim(coalesce(raw_name, '')), '[[:space:]]+', ' ', 'g'));
$$;


ALTER FUNCTION "public"."voiceup_normalize_person_name"("raw_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_normalize_public_phone"("raw_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."voiceup_normalize_public_phone"("raw_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."voiceup_protect_field_collection_state"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.data := public.voiceup_merge_authoritative_field_collection_state(new.id, new.data);
  return new;
end;
$$;


ALTER FUNCTION "public"."voiceup_protect_field_collection_state"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "campaign_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "description" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "category" "text",
    "description" "text",
    "appeal_content" "text",
    "authority_target_level" "text",
    "location" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaigns_authority_target_level_check" CHECK (("authority_target_level" = ANY (ARRAY['district'::"text", 'state'::"text", 'country'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integration_settings" (
    "organization_id" "uuid" NOT NULL,
    "razorpay" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "whatsapp" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sms" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "email" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "storage" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "analytics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."integration_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "campaign_id" "uuid",
    "bucket" "text" NOT NULL,
    "path" "text" NOT NULL,
    "asset_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['platform_owner'::"text", 'organization_admin'::"text", 'campaign_admin'::"text", 'reviewer'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_email" "text",
    "plan" "text" DEFAULT 'Starter'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'Trial'::"text" NOT NULL,
    "custom_domain" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."signers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "location" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source" "text" DEFAULT 'online'::"text" NOT NULL,
    "status" "text" DEFAULT 'verified'::"text" NOT NULL,
    "accepted_appeal" "text",
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."signers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "provider" "text" DEFAULT 'Razorpay'::"text" NOT NULL,
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "plan" "text" NOT NULL,
    "status" "text" NOT NULL,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_coordinator_audit" (
    "id" bigint NOT NULL,
    "workspace_id" "text" NOT NULL,
    "coordinator_id" "uuid",
    "actor_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "voiceup_coordinator_audit_action_check" CHECK (("action" = ANY (ARRAY['coordinator.created'::"text", 'coordinator.updated'::"text", 'coordinator.status_changed'::"text", 'coordinator.deleted'::"text", 'coordinator.mobile_verified'::"text", 'coordinator.photo_updated'::"text", 'coordinator.campaigns_changed'::"text", 'coordinator.referral_linked'::"text", 'coordinator.geography_created'::"text", 'coordinator.geography_archived'::"text"])))
);


ALTER TABLE "public"."voiceup_coordinator_audit" OWNER TO "postgres";


ALTER TABLE "public"."voiceup_coordinator_audit" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."voiceup_coordinator_audit_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."voiceup_coordinator_campaigns" (
    "coordinator_id" "uuid" NOT NULL,
    "workspace_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."voiceup_coordinator_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_coordinator_geographies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "text" NOT NULL,
    "parent_id" "uuid",
    "level" "text" NOT NULL,
    "name" "text" NOT NULL,
    "normalized_name" "text" NOT NULL,
    "path" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "depth" integer NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "voiceup_coordinator_geographies_depth_check" CHECK ((("depth" >= 0) AND ("depth" <= 5))),
    CONSTRAINT "voiceup_coordinator_geographies_level_check" CHECK (("level" = ANY (ARRAY['country'::"text", 'state'::"text", 'district'::"text", 'block'::"text", 'panchayat'::"text", 'ward'::"text"]))),
    CONSTRAINT "voiceup_coordinator_geographies_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 120)))
);


ALTER TABLE "public"."voiceup_coordinator_geographies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_coordinator_referrals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "text" NOT NULL,
    "inviter_coordinator_id" "uuid" NOT NULL,
    "referred_coordinator_id" "uuid" NOT NULL,
    "referral_code" "text" NOT NULL,
    "status" "text" NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "voiceup_coordinator_referrals_no_self" CHECK (("inviter_coordinator_id" <> "referred_coordinator_id")),
    CONSTRAINT "voiceup_coordinator_referrals_status_check" CHECK (("status" = ANY (ARRAY['accepted'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."voiceup_coordinator_referrals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_coordinators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "text" NOT NULL,
    "auth_user_id" "uuid",
    "full_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "normalized_phone" "text" NOT NULL,
    "email" "text",
    "normalized_email" "text",
    "photo_path" "text",
    "role" "text" NOT NULL,
    "status" "text" NOT NULL,
    "geography_id" "uuid",
    "postal_code" "text",
    "reports_to_coordinator_id" "uuid",
    "referral_code" "text" NOT NULL,
    "referred_by_coordinator_id" "uuid",
    "mobile_verified_at" timestamp with time zone,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "voiceup_coordinators_full_name_check" CHECK ((("length"("btrim"("full_name")) >= 2) AND ("length"("btrim"("full_name")) <= 120))),
    CONSTRAINT "voiceup_coordinators_no_self_report" CHECK (("reports_to_coordinator_id" IS DISTINCT FROM "id")),
    CONSTRAINT "voiceup_coordinators_notes_check" CHECK (("length"("notes") <= 2000)),
    CONSTRAINT "voiceup_coordinators_postal_code_check" CHECK ((("postal_code" IS NULL) OR ("postal_code" ~ '^[0-9]{6}$'::"text"))),
    CONSTRAINT "voiceup_coordinators_role_check" CHECK (("role" = ANY (ARRAY['national_coordinator'::"text", 'state_coordinator'::"text", 'district_coordinator'::"text", 'block_coordinator'::"text", 'panchayat_coordinator'::"text", 'ward_coordinator'::"text", 'field_coordinator'::"text"]))),
    CONSTRAINT "voiceup_coordinators_status_check" CHECK (("status" = ANY (ARRAY['invited'::"text", 'active'::"text", 'inactive'::"text", 'suspended'::"text"]))),
    CONSTRAINT "voiceup_coordinators_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."voiceup_coordinators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_field_collection_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "workspace_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "review_item_id" "text",
    "supporter_id" "text",
    "approval_key" "text",
    "source_row_fingerprint" "text",
    "result_code" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "audit_payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."voiceup_field_collection_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_otp_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "text" NOT NULL,
    "phone_hash" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sent_count" integer DEFAULT 1 NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "voiceup_otp_challenges_purpose_check" CHECK (("purpose" = ANY (ARRAY['public-signing'::"text", 'onboarding'::"text", 'coordinator-mobile'::"text"])))
);


ALTER TABLE "public"."voiceup_otp_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_public_campaign_index" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "status" "text" NOT NULL,
    "campaign" "jsonb" NOT NULL,
    "organization" "jsonb",
    "authorities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."voiceup_public_campaign_index" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_public_campaign_index_backup_20260730" (
    "id" "uuid",
    "workspace_id" "text",
    "campaign_id" "text",
    "slug" "text",
    "status" "text",
    "campaign" "jsonb",
    "organization" "jsonb",
    "authorities" "jsonb",
    "metrics" "jsonb",
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."voiceup_public_campaign_index_backup_20260730" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_scan_approval_ledger" (
    "approval_key" "text" NOT NULL,
    "review_item_id" "text" NOT NULL,
    "workspace_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "source_row_fingerprint" "text" NOT NULL,
    "supporter_id" "text" NOT NULL,
    "actor_user_id" "uuid",
    "duplicate_decision" "text" NOT NULL,
    "result_status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "voiceup_scan_approval_ledger_result_status_check" CHECK (("result_status" = ANY (ARRAY['approval_completed'::"text", 'approval_already_completed'::"text", 'existing_supporter_returned'::"text"])))
);


ALTER TABLE "public"."voiceup_scan_approval_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_scan_review_items" (
    "review_item_id" "text" NOT NULL,
    "workspace_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "upload_fingerprint" "text" NOT NULL,
    "source_row_fingerprint" "text" NOT NULL,
    "status" "text" DEFAULT 'needs_review'::"text" NOT NULL,
    "raw_fields" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "normalized_name" "text",
    "normalized_email" "text",
    "normalized_phone" "text",
    "consent" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "review_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "supporter_id" "text",
    "approval_key" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "historical_link_uncertain" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "voiceup_scan_review_items_status_check" CHECK (("status" = ANY (ARRAY['needs_review'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "voiceup_scan_review_items_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."voiceup_scan_review_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_scan_supporters" (
    "supporter_id" "text" NOT NULL,
    "workspace_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "review_item_id" "text" NOT NULL,
    "source_row_fingerprint" "text" NOT NULL,
    "supporter_identity_key" "text" NOT NULL,
    "normalized_name" "text",
    "normalized_email" "text",
    "normalized_phone" "text",
    "raw_fields" "jsonb" NOT NULL,
    "supporter_payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."voiceup_scan_supporters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voiceup_workspace_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."voiceup_workspace_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."voiceup_workspace_members" IS 'Pilot workspace membership. Client access is read-only; provisioning is server or administrator controlled.';



CREATE TABLE IF NOT EXISTS "public"."voiceup_workspaces" (
    "id" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."voiceup_workspaces" OWNER TO "postgres";


COMMENT ON TABLE "public"."voiceup_workspaces" IS 'Temporary MVP shared JSON workspace for Voiceup Bharat. Replace with normalized tenant tables and authenticated policies before production scale.';



CREATE TABLE IF NOT EXISTS "public"."workspace_resource_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "application_key" "text" NOT NULL,
    "role" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "text" NOT NULL,
    "resource_slug" "text",
    "active" boolean DEFAULT true NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_resource_members" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."integration_settings"
    ADD CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."signers"
    ADD CONSTRAINT "signers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voiceup_coordinator_audit"
    ADD CONSTRAINT "voiceup_coordinator_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voiceup_coordinator_campaigns"
    ADD CONSTRAINT "voiceup_coordinator_campaigns_pkey" PRIMARY KEY ("coordinator_id", "campaign_id");



ALTER TABLE ONLY "public"."voiceup_coordinator_geographies"
    ADD CONSTRAINT "voiceup_coordinator_geographies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voiceup_coordinator_referrals"
    ADD CONSTRAINT "voiceup_coordinator_referrals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voiceup_coordinator_referrals"
    ADD CONSTRAINT "voiceup_coordinator_referrals_workspace_id_referred_coordin_key" UNIQUE ("workspace_id", "referred_coordinator_id");



ALTER TABLE ONLY "public"."voiceup_coordinators"
    ADD CONSTRAINT "voiceup_coordinators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voiceup_field_collection_audit"
    ADD CONSTRAINT "voiceup_field_collection_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voiceup_otp_challenges"
    ADD CONSTRAINT "voiceup_otp_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voiceup_public_campaign_index"
    ADD CONSTRAINT "voiceup_public_campaign_index_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."voiceup_public_campaign_index"
    ADD CONSTRAINT "voiceup_public_campaign_index_workspace_id_campaign_id_key" UNIQUE ("workspace_id", "campaign_id");



ALTER TABLE ONLY "public"."voiceup_scan_approval_ledger"
    ADD CONSTRAINT "voiceup_scan_approval_ledger_pkey" PRIMARY KEY ("approval_key");



ALTER TABLE ONLY "public"."voiceup_scan_approval_ledger"
    ADD CONSTRAINT "voiceup_scan_approval_ledger_review_item_id_key" UNIQUE ("review_item_id");



ALTER TABLE ONLY "public"."voiceup_scan_approval_ledger"
    ADD CONSTRAINT "voiceup_scan_approval_ledger_supporter_id_key" UNIQUE ("supporter_id");



ALTER TABLE ONLY "public"."voiceup_scan_approval_ledger"
    ADD CONSTRAINT "voiceup_scan_approval_ledger_workspace_id_campaign_id_sourc_key" UNIQUE ("workspace_id", "campaign_id", "source_row_fingerprint");



ALTER TABLE ONLY "public"."voiceup_scan_review_items"
    ADD CONSTRAINT "voiceup_scan_review_items_pkey" PRIMARY KEY ("review_item_id");



ALTER TABLE ONLY "public"."voiceup_scan_review_items"
    ADD CONSTRAINT "voiceup_scan_review_items_workspace_id_campaign_id_review_i_key" UNIQUE ("workspace_id", "campaign_id", "review_item_id");



ALTER TABLE ONLY "public"."voiceup_scan_supporters"
    ADD CONSTRAINT "voiceup_scan_supporters_pkey" PRIMARY KEY ("supporter_id");



ALTER TABLE ONLY "public"."voiceup_scan_supporters"
    ADD CONSTRAINT "voiceup_scan_supporters_review_item_id_key" UNIQUE ("review_item_id");



ALTER TABLE ONLY "public"."voiceup_scan_supporters"
    ADD CONSTRAINT "voiceup_scan_supporters_workspace_id_campaign_id_source_row_key" UNIQUE ("workspace_id", "campaign_id", "source_row_fingerprint");



ALTER TABLE ONLY "public"."voiceup_workspace_members"
    ADD CONSTRAINT "voiceup_workspace_members_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."voiceup_workspace_members"
    ADD CONSTRAINT "voiceup_workspace_members_role_check" CHECK (("role" = ANY (ARRAY['platform_owner'::"text", 'workspace_admin'::"text", 'campaign_admin'::"text", 'field_officer'::"text", 'viewer'::"text"]))) NOT VALID;



COMMENT ON CONSTRAINT "voiceup_workspace_members_role_check" ON "public"."voiceup_workspace_members" IS 'Canonical role list (reconciled 2026-07-20): platform_owner, workspace_admin, campaign_admin, field_officer, viewer. Added NOT VALID to avoid invalidating any pre-existing rows; enforced for all new writes.';



ALTER TABLE ONLY "public"."voiceup_workspace_members"
    ADD CONSTRAINT "voiceup_workspace_members_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."voiceup_workspaces"
    ADD CONSTRAINT "voiceup_workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_resource_members"
    ADD CONSTRAINT "workspace_resource_members_pkey" PRIMARY KEY ("id");



CREATE INDEX "voiceup_coordinator_audit_coordinator_time_idx" ON "public"."voiceup_coordinator_audit" USING "btree" ("coordinator_id", "created_at" DESC);



CREATE INDEX "voiceup_coordinator_audit_workspace_time_idx" ON "public"."voiceup_coordinator_audit" USING "btree" ("workspace_id", "created_at" DESC);



CREATE INDEX "voiceup_coordinator_campaigns_campaign_idx" ON "public"."voiceup_coordinator_campaigns" USING "btree" ("workspace_id", "campaign_id") WHERE "active";



CREATE INDEX "voiceup_coordinator_geographies_parent_idx" ON "public"."voiceup_coordinator_geographies" USING "btree" ("workspace_id", "parent_id", "level") WHERE "active";



CREATE INDEX "voiceup_coordinator_geographies_path_idx" ON "public"."voiceup_coordinator_geographies" USING "gin" ("path");



CREATE UNIQUE INDEX "voiceup_coordinator_geographies_unique_idx" ON "public"."voiceup_coordinator_geographies" USING "btree" ("workspace_id", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "level", "normalized_name") WHERE "active";



CREATE INDEX "voiceup_coordinator_referrals_code_idx" ON "public"."voiceup_coordinator_referrals" USING "btree" ("workspace_id", "referral_code");



CREATE INDEX "voiceup_coordinator_referrals_inviter_idx" ON "public"."voiceup_coordinator_referrals" USING "btree" ("workspace_id", "inviter_coordinator_id", "status");



CREATE INDEX "voiceup_coordinators_geography_idx" ON "public"."voiceup_coordinators" USING "btree" ("workspace_id", "geography_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "voiceup_coordinators_name_idx" ON "public"."voiceup_coordinators" USING "btree" ("workspace_id", "lower"("full_name")) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "voiceup_coordinators_phone_unique_idx" ON "public"."voiceup_coordinators" USING "btree" ("workspace_id", "normalized_phone") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "voiceup_coordinators_referral_unique_idx" ON "public"."voiceup_coordinators" USING "btree" ("workspace_id", "referral_code") WHERE ("deleted_at" IS NULL);



CREATE INDEX "voiceup_coordinators_reporting_idx" ON "public"."voiceup_coordinators" USING "btree" ("workspace_id", "reports_to_coordinator_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "voiceup_coordinators_search_idx" ON "public"."voiceup_coordinators" USING "gin" ("to_tsvector"('"simple"'::"regconfig", ((((((COALESCE("full_name", ''::"text") || ' '::"text") || COALESCE("phone", ''::"text")) || ' '::"text") || COALESCE("email", ''::"text")) || ' '::"text") || COALESCE("referral_code", ''::"text"))));



CREATE INDEX "voiceup_coordinators_workspace_status_idx" ON "public"."voiceup_coordinators" USING "btree" ("workspace_id", "status", "role") WHERE ("deleted_at" IS NULL);



CREATE INDEX "voiceup_field_collection_audit_review_idx" ON "public"."voiceup_field_collection_audit" USING "btree" ("review_item_id", "created_at" DESC);



CREATE INDEX "voiceup_field_collection_audit_workspace_campaign_idx" ON "public"."voiceup_field_collection_audit" USING "btree" ("workspace_id", "campaign_id", "created_at" DESC);



CREATE INDEX "voiceup_otp_challenges_lookup_idx" ON "public"."voiceup_otp_challenges" USING "btree" ("workspace_id", "phone_hash", "purpose", "created_at" DESC);



CREATE INDEX "voiceup_public_campaign_index_slug_status_idx" ON "public"."voiceup_public_campaign_index" USING "btree" ("slug", "status");



CREATE INDEX "voiceup_scan_approval_ledger_workspace_campaign_idx" ON "public"."voiceup_scan_approval_ledger" USING "btree" ("workspace_id", "campaign_id");



CREATE INDEX "voiceup_scan_review_items_source_idx" ON "public"."voiceup_scan_review_items" USING "btree" ("workspace_id", "campaign_id", "source_row_fingerprint");



CREATE INDEX "voiceup_scan_review_items_status_idx" ON "public"."voiceup_scan_review_items" USING "btree" ("workspace_id", "campaign_id", "status");



CREATE INDEX "voiceup_scan_review_items_workspace_campaign_idx" ON "public"."voiceup_scan_review_items" USING "btree" ("workspace_id", "campaign_id");



CREATE UNIQUE INDEX "voiceup_scan_supporters_campaign_phone_unique_idx" ON "public"."voiceup_scan_supporters" USING "btree" ("workspace_id", "campaign_id", "normalized_phone") WHERE (("normalized_phone" IS NOT NULL) AND ("normalized_phone" <> ''::"text"));



CREATE INDEX "voiceup_scan_supporters_workspace_campaign_idx" ON "public"."voiceup_scan_supporters" USING "btree" ("workspace_id", "campaign_id");



CREATE INDEX "voiceup_workspace_members_user_id_idx" ON "public"."voiceup_workspace_members" USING "btree" ("user_id");



CREATE INDEX "voiceup_workspace_members_workspace_id_idx" ON "public"."voiceup_workspace_members" USING "btree" ("workspace_id");



CREATE INDEX "voiceup_workspace_members_workspace_role_idx" ON "public"."voiceup_workspace_members" USING "btree" ("workspace_id", "role");



CREATE UNIQUE INDEX "workspace_resource_members_active_unique_idx" ON "public"."workspace_resource_members" USING "btree" ("workspace_id", "user_id", "application_key", "role", "resource_type", "resource_id") WHERE "active";



CREATE INDEX "workspace_resource_members_resource_id_idx" ON "public"."workspace_resource_members" USING "btree" ("resource_id");



CREATE INDEX "workspace_resource_members_resource_idx" ON "public"."workspace_resource_members" USING "btree" ("workspace_id", "application_key", "resource_type", "resource_id");



CREATE INDEX "workspace_resource_members_resource_slug_idx" ON "public"."workspace_resource_members" USING "btree" ("resource_slug");



CREATE INDEX "workspace_resource_members_user_id_idx" ON "public"."workspace_resource_members" USING "btree" ("user_id");



CREATE INDEX "workspace_resource_members_workspace_id_idx" ON "public"."workspace_resource_members" USING "btree" ("workspace_id");



CREATE OR REPLACE TRIGGER "voiceup_protect_field_collection_state_trigger" BEFORE INSERT OR UPDATE OF "data" ON "public"."voiceup_workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."voiceup_protect_field_collection_state"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integration_settings"
    ADD CONSTRAINT "integration_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."signers"
    ADD CONSTRAINT "signers_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_coordinator_audit"
    ADD CONSTRAINT "voiceup_coordinator_audit_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."voiceup_coordinator_audit"
    ADD CONSTRAINT "voiceup_coordinator_audit_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "public"."voiceup_coordinators"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voiceup_coordinator_audit"
    ADD CONSTRAINT "voiceup_coordinator_audit_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_coordinator_campaigns"
    ADD CONSTRAINT "voiceup_coordinator_campaigns_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."voiceup_coordinator_campaigns"
    ADD CONSTRAINT "voiceup_coordinator_campaigns_coordinator_id_fkey" FOREIGN KEY ("coordinator_id") REFERENCES "public"."voiceup_coordinators"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_coordinator_campaigns"
    ADD CONSTRAINT "voiceup_coordinator_campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_coordinator_geographies"
    ADD CONSTRAINT "voiceup_coordinator_geographies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."voiceup_coordinator_geographies"
    ADD CONSTRAINT "voiceup_coordinator_geographies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."voiceup_coordinator_geographies"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."voiceup_coordinator_geographies"
    ADD CONSTRAINT "voiceup_coordinator_geographies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_coordinator_referrals"
    ADD CONSTRAINT "voiceup_coordinator_referrals_inviter_coordinator_id_fkey" FOREIGN KEY ("inviter_coordinator_id") REFERENCES "public"."voiceup_coordinators"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."voiceup_coordinator_referrals"
    ADD CONSTRAINT "voiceup_coordinator_referrals_referred_coordinator_id_fkey" FOREIGN KEY ("referred_coordinator_id") REFERENCES "public"."voiceup_coordinators"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_coordinator_referrals"
    ADD CONSTRAINT "voiceup_coordinator_referrals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_coordinators"
    ADD CONSTRAINT "voiceup_coordinators_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voiceup_coordinators"
    ADD CONSTRAINT "voiceup_coordinators_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."voiceup_coordinators"
    ADD CONSTRAINT "voiceup_coordinators_geography_id_fkey" FOREIGN KEY ("geography_id") REFERENCES "public"."voiceup_coordinator_geographies"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."voiceup_coordinators"
    ADD CONSTRAINT "voiceup_coordinators_referred_by_coordinator_id_fkey" FOREIGN KEY ("referred_by_coordinator_id") REFERENCES "public"."voiceup_coordinators"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."voiceup_coordinators"
    ADD CONSTRAINT "voiceup_coordinators_reports_to_coordinator_id_fkey" FOREIGN KEY ("reports_to_coordinator_id") REFERENCES "public"."voiceup_coordinators"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."voiceup_coordinators"
    ADD CONSTRAINT "voiceup_coordinators_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."voiceup_coordinators"
    ADD CONSTRAINT "voiceup_coordinators_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_field_collection_audit"
    ADD CONSTRAINT "voiceup_field_collection_audit_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."voiceup_field_collection_audit"
    ADD CONSTRAINT "voiceup_field_collection_audit_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_public_campaign_index"
    ADD CONSTRAINT "voiceup_public_campaign_index_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_scan_approval_ledger"
    ADD CONSTRAINT "voiceup_scan_approval_ledger_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."voiceup_scan_approval_ledger"
    ADD CONSTRAINT "voiceup_scan_approval_ledger_review_item_id_fkey" FOREIGN KEY ("review_item_id") REFERENCES "public"."voiceup_scan_review_items"("review_item_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."voiceup_scan_approval_ledger"
    ADD CONSTRAINT "voiceup_scan_approval_ledger_supporter_id_fkey" FOREIGN KEY ("supporter_id") REFERENCES "public"."voiceup_scan_supporters"("supporter_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."voiceup_scan_approval_ledger"
    ADD CONSTRAINT "voiceup_scan_approval_ledger_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_scan_review_items"
    ADD CONSTRAINT "voiceup_scan_review_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_scan_supporters"
    ADD CONSTRAINT "voiceup_scan_supporters_review_item_id_fkey" FOREIGN KEY ("review_item_id") REFERENCES "public"."voiceup_scan_review_items"("review_item_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."voiceup_scan_supporters"
    ADD CONSTRAINT "voiceup_scan_supporters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_workspace_members"
    ADD CONSTRAINT "voiceup_workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."voiceup_workspace_members"
    ADD CONSTRAINT "voiceup_workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_resource_members"
    ADD CONSTRAINT "workspace_resource_members_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_resource_members"
    ADD CONSTRAINT "workspace_resource_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_resource_members"
    ADD CONSTRAINT "workspace_resource_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."voiceup_workspaces"("id") ON DELETE CASCADE;



CREATE POLICY "Anonymous reads public campaign index" ON "public"."voiceup_public_campaign_index" FOR SELECT TO "anon" USING (("status" = 'Published'::"text"));



CREATE POLICY "Authenticated reads public campaign index" ON "public"."voiceup_public_campaign_index" FOR SELECT TO "authenticated" USING (("status" = 'Published'::"text"));



CREATE POLICY "Coordinator network members read audit" ON "public"."voiceup_coordinator_audit" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_read_coordinator_network"("workspace_id"));



CREATE POLICY "Coordinator network members read campaign links" ON "public"."voiceup_coordinator_campaigns" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_read_coordinator_network"("workspace_id"));



CREATE POLICY "Coordinator network members read coordinators" ON "public"."voiceup_coordinators" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_read_coordinator_network"("workspace_id"));



CREATE POLICY "Coordinator network members read geographies" ON "public"."voiceup_coordinator_geographies" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_read_coordinator_network"("workspace_id"));



CREATE POLICY "Coordinator network members read referrals" ON "public"."voiceup_coordinator_referrals" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_read_coordinator_network"("workspace_id"));



CREATE POLICY "Field Collection reviewers read approval ledger" ON "public"."voiceup_scan_approval_ledger" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_approve_field_collection"("workspace_id", "campaign_id"));



CREATE POLICY "Field Collection reviewers read audit" ON "public"."voiceup_field_collection_audit" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_approve_field_collection"("workspace_id", "campaign_id"));



CREATE POLICY "Field Collection reviewers read review items" ON "public"."voiceup_scan_review_items" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_approve_field_collection"("workspace_id", "campaign_id"));



CREATE POLICY "Field Collection reviewers read supporters" ON "public"."voiceup_scan_supporters" FOR SELECT TO "authenticated" USING ("public"."voiceup_can_approve_field_collection"("workspace_id", "campaign_id"));



CREATE POLICY "Public can insert signers" ON "public"."signers" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public can read published campaigns" ON "public"."campaigns" FOR SELECT USING (("status" = 'Published'::"text"));



CREATE POLICY "VoiceUp members read own workspace memberships" ON "public"."voiceup_workspace_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Voiceup public insert workspace" ON "public"."voiceup_workspaces" FOR INSERT WITH CHECK (true);



CREATE POLICY "Voiceup public read workspace" ON "public"."voiceup_workspaces" FOR SELECT USING (true);



CREATE POLICY "Voiceup public update workspace" ON "public"."voiceup_workspaces" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Workspace resource members read own assignments" ON "public"."workspace_resource_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."integration_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."signers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_coordinator_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_coordinator_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_coordinator_geographies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_coordinator_referrals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_coordinators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_field_collection_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_otp_challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_public_campaign_index" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_public_campaign_index_backup_20260730" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_scan_approval_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_scan_review_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_scan_supporters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voiceup_workspaces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_resource_members" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_voiceup_scan_review_item"("p_workspace_id" "text", "p_campaign_id" "text", "p_review_item_id" "text", "p_expected_version" integer, "p_upload_fingerprint" "text", "p_source_reference" "text", "p_source_row_fingerprint" "text", "p_approval_key" "text", "p_review_payload" "jsonb", "p_supporter_fields" "jsonb", "p_consent" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_voiceup_scan_review_item"("p_workspace_id" "text", "p_campaign_id" "text", "p_review_item_id" "text", "p_expected_version" integer, "p_upload_fingerprint" "text", "p_source_reference" "text", "p_source_row_fingerprint" "text", "p_approval_key" "text", "p_review_payload" "jsonb", "p_supporter_fields" "jsonb", "p_consent" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_voiceup_scan_review_item"("p_workspace_id" "text", "p_campaign_id" "text", "p_review_item_id" "text", "p_expected_version" integer, "p_upload_fingerprint" "text", "p_source_reference" "text", "p_source_row_fingerprint" "text", "p_approval_key" "text", "p_review_payload" "jsonb", "p_supporter_fields" "jsonb", "p_consent" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_voiceup_scan_review_item"("p_workspace_id" "text", "p_campaign_id" "text", "p_review_item_id" "text", "p_expected_version" integer, "p_upload_fingerprint" "text", "p_source_reference" "text", "p_source_row_fingerprint" "text", "p_approval_key" "text", "p_review_payload" "jsonb", "p_supporter_fields" "jsonb", "p_consent" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_voiceup_coordinator_geography"("p_workspace_id" "text", "p_geography_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_voiceup_coordinator_geography"("p_workspace_id" "text", "p_geography_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_voiceup_coordinator_geography"("p_workspace_id" "text", "p_geography_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_voiceup_coordinator_geography"("p_workspace_id" "text", "p_geography_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_expected_version" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_voiceup_coordinator_network"("p_workspace_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_voiceup_coordinator_network"("p_workspace_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_voiceup_coordinator_network"("p_workspace_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_voiceup_coordinator_network"("p_workspace_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mutate_voiceup_public_participation"("p_workspace_id" "text", "p_campaign_id" "text", "p_campaign_slug" "text", "p_action" "text", "p_phone" "text", "p_verification_token" "text", "p_idempotency_key" "text", "p_payload" "jsonb", "p_server_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mutate_voiceup_public_participation"("p_workspace_id" "text", "p_campaign_id" "text", "p_campaign_slug" "text", "p_action" "text", "p_phone" "text", "p_verification_token" "text", "p_idempotency_key" "text", "p_payload" "jsonb", "p_server_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_voiceup_scan_batch_audit"("p_workspace_id" "text", "p_campaign_id" "text", "p_batch_id" "text", "p_result_code" "text", "p_counts" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_voiceup_scan_batch_audit"("p_workspace_id" "text", "p_campaign_id" "text", "p_batch_id" "text", "p_result_code" "text", "p_counts" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_voiceup_scan_batch_audit"("p_workspace_id" "text", "p_campaign_id" "text", "p_batch_id" "text", "p_result_code" "text", "p_counts" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_voiceup_scan_batch_audit"("p_workspace_id" "text", "p_campaign_id" "text", "p_batch_id" "text", "p_result_code" "text", "p_counts" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_voiceup_coordinator_status"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_status" "text", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_voiceup_coordinator_status"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_status" "text", "p_expected_version" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."set_voiceup_coordinator_status"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_status" "text", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_voiceup_coordinator_status"("p_workspace_id" "text", "p_coordinator_id" "uuid", "p_status" "text", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator" "jsonb", "p_geography" "jsonb", "p_campaign_ids" "text"[], "p_verification_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator" "jsonb", "p_geography" "jsonb", "p_campaign_ids" "text"[], "p_verification_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator" "jsonb", "p_geography" "jsonb", "p_campaign_ids" "text"[], "p_verification_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_voiceup_coordinator"("p_workspace_id" "text", "p_coordinator" "jsonb", "p_geography" "jsonb", "p_campaign_ids" "text"[], "p_verification_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_can_approve_field_collection"("target_workspace_id" "text", "target_campaign_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_can_approve_field_collection"("target_workspace_id" "text", "target_campaign_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_can_approve_field_collection"("target_workspace_id" "text", "target_campaign_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_can_approve_field_collection"("target_workspace_id" "text", "target_campaign_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_can_manage_coordinator_network"("target_workspace_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_coordinator_network"("target_workspace_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_coordinator_network"("target_workspace_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_coordinator_network"("target_workspace_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_can_manage_private_evidence"("target_workspace_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_private_evidence"("target_workspace_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_private_evidence"("target_workspace_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_private_evidence"("target_workspace_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_can_manage_workspace_storage"("target_workspace_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_workspace_storage"("target_workspace_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_workspace_storage"("target_workspace_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_can_manage_workspace_storage"("target_workspace_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_can_read_coordinator_network"("target_workspace_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_can_read_coordinator_network"("target_workspace_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_can_read_coordinator_network"("target_workspace_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_can_read_coordinator_network"("target_workspace_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_consume_coordinator_mobile_verification"("target_workspace_id" "text", "normalized_phone" "text", "verification_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_consume_coordinator_mobile_verification"("target_workspace_id" "text", "normalized_phone" "text", "verification_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_consume_coordinator_mobile_verification"("target_workspace_id" "text", "normalized_phone" "text", "verification_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_consume_coordinator_mobile_verification"("target_workspace_id" "text", "normalized_phone" "text", "verification_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_coordinator_role_level"("target_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_coordinator_role_level"("target_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_coordinator_role_level"("target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_coordinator_role_level"("target_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_coordinator_role_rank"("target_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_coordinator_role_rank"("target_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_coordinator_role_rank"("target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_coordinator_role_rank"("target_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_ensure_coordinator_geography"("target_workspace_id" "text", "geography" "jsonb", "actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_ensure_coordinator_geography"("target_workspace_id" "text", "geography" "jsonb", "actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_ensure_coordinator_geography"("target_workspace_id" "text", "geography" "jsonb", "actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_ensure_coordinator_geography"("target_workspace_id" "text", "geography" "jsonb", "actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_has_active_resource_assignment"("target_workspace_id" "text", "target_application_key" "text", "target_resource_type" "text", "target_resource_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_has_active_resource_assignment"("target_workspace_id" "text", "target_application_key" "text", "target_resource_type" "text", "target_resource_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_has_active_resource_assignment"("target_workspace_id" "text", "target_application_key" "text", "target_resource_type" "text", "target_resource_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_has_active_resource_assignment"("target_workspace_id" "text", "target_application_key" "text", "target_resource_type" "text", "target_resource_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_identity_key"("namespace" "text", "parts" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_identity_key"("namespace" "text", "parts" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_identity_key"("namespace" "text", "parts" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_identity_key"("namespace" "text", "parts" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."voiceup_is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_is_platform_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_is_workspace_member"("target_workspace_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_is_workspace_member"("target_workspace_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_is_workspace_member"("target_workspace_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_is_workspace_member"("target_workspace_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_merge_authoritative_field_collection_state"("target_workspace_id" "text", "incoming_state" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_merge_authoritative_field_collection_state"("target_workspace_id" "text", "incoming_state" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_merge_authoritative_field_collection_state"("target_workspace_id" "text", "incoming_state" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_merge_authoritative_field_collection_state"("target_workspace_id" "text", "incoming_state" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_normalize_email"("raw_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_normalize_email"("raw_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_normalize_email"("raw_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_normalize_email"("raw_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_normalize_indian_phone"("raw_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_normalize_indian_phone"("raw_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_normalize_indian_phone"("raw_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_normalize_indian_phone"("raw_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_normalize_person_name"("raw_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_normalize_person_name"("raw_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_normalize_person_name"("raw_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_normalize_person_name"("raw_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_normalize_public_phone"("raw_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_normalize_public_phone"("raw_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_normalize_public_phone"("raw_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_normalize_public_phone"("raw_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."voiceup_protect_field_collection_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."voiceup_protect_field_collection_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."voiceup_protect_field_collection_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."voiceup_protect_field_collection_state"() TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."integration_settings" TO "anon";
GRANT ALL ON TABLE "public"."integration_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_settings" TO "service_role";



GRANT ALL ON TABLE "public"."media_assets" TO "anon";
GRANT ALL ON TABLE "public"."media_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."media_assets" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."signers" TO "anon";
GRANT ALL ON TABLE "public"."signers" TO "authenticated";
GRANT ALL ON TABLE "public"."signers" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."voiceup_coordinator_audit" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_coordinator_audit" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."voiceup_coordinator_audit_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."voiceup_coordinator_audit_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."voiceup_coordinator_audit_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."voiceup_coordinator_campaigns" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_coordinator_campaigns" TO "authenticated";



GRANT ALL ON TABLE "public"."voiceup_coordinator_geographies" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_coordinator_geographies" TO "authenticated";



GRANT ALL ON TABLE "public"."voiceup_coordinator_referrals" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_coordinator_referrals" TO "authenticated";



GRANT ALL ON TABLE "public"."voiceup_coordinators" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_coordinators" TO "authenticated";



GRANT ALL ON TABLE "public"."voiceup_field_collection_audit" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_field_collection_audit" TO "authenticated";



GRANT ALL ON TABLE "public"."voiceup_otp_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."voiceup_public_campaign_index" TO "anon";
GRANT ALL ON TABLE "public"."voiceup_public_campaign_index" TO "authenticated";
GRANT ALL ON TABLE "public"."voiceup_public_campaign_index" TO "service_role";



GRANT ALL ON TABLE "public"."voiceup_public_campaign_index_backup_20260730" TO "anon";
GRANT ALL ON TABLE "public"."voiceup_public_campaign_index_backup_20260730" TO "authenticated";
GRANT ALL ON TABLE "public"."voiceup_public_campaign_index_backup_20260730" TO "service_role";



GRANT ALL ON TABLE "public"."voiceup_scan_approval_ledger" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_scan_approval_ledger" TO "authenticated";



GRANT ALL ON TABLE "public"."voiceup_scan_review_items" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_scan_review_items" TO "authenticated";



GRANT ALL ON TABLE "public"."voiceup_scan_supporters" TO "service_role";
GRANT SELECT ON TABLE "public"."voiceup_scan_supporters" TO "authenticated";



GRANT ALL ON TABLE "public"."voiceup_workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."voiceup_workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."voiceup_workspaces" TO "anon";
GRANT ALL ON TABLE "public"."voiceup_workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."voiceup_workspaces" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_resource_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_resource_members" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
