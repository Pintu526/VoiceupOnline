BEGIN;

create or replace function public.approve_voiceup_scan_review_item(
  p_workspace_id text,
  p_campaign_id text,
  p_review_item_id text,
  p_expected_version integer,
  p_upload_fingerprint text,
  p_source_reference text,
  p_source_row_fingerprint text,
  p_approval_key text,
  p_review_payload jsonb,
  p_supporter_fields jsonb,
  p_consent jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

COMMIT;
