begin;

create extension if not exists pgcrypto;

create table if not exists public.voiceup_scan_review_items (
  review_item_id text primary key,
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  upload_fingerprint text not null,
  source_row_fingerprint text not null,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected')),
  raw_fields jsonb not null default '{}'::jsonb,
  normalized_name text,
  normalized_email text,
  normalized_phone text,
  consent jsonb not null default '{}'::jsonb,
  review_payload jsonb not null default '{}'::jsonb,
  supporter_id text,
  approval_key text,
  version integer not null default 1 check (version > 0),
  historical_link_uncertain boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, campaign_id, review_item_id)
);

create index if not exists voiceup_scan_review_items_workspace_campaign_idx
  on public.voiceup_scan_review_items (workspace_id, campaign_id);
create index if not exists voiceup_scan_review_items_source_idx
  on public.voiceup_scan_review_items (workspace_id, campaign_id, source_row_fingerprint);
create index if not exists voiceup_scan_review_items_status_idx
  on public.voiceup_scan_review_items (workspace_id, campaign_id, status);

create table if not exists public.voiceup_scan_supporters (
  supporter_id text primary key,
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  review_item_id text not null references public.voiceup_scan_review_items(review_item_id) on delete restrict,
  source_row_fingerprint text not null,
  supporter_identity_key text not null,
  normalized_name text,
  normalized_email text,
  normalized_phone text,
  raw_fields jsonb not null,
  supporter_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (review_item_id),
  unique (workspace_id, campaign_id, source_row_fingerprint)
);

create unique index if not exists voiceup_scan_supporters_campaign_phone_unique_idx
  on public.voiceup_scan_supporters (workspace_id, campaign_id, normalized_phone)
  where normalized_phone is not null and normalized_phone <> '';
create index if not exists voiceup_scan_supporters_workspace_campaign_idx
  on public.voiceup_scan_supporters (workspace_id, campaign_id);

create table if not exists public.voiceup_scan_approval_ledger (
  approval_key text primary key,
  review_item_id text not null references public.voiceup_scan_review_items(review_item_id) on delete restrict,
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  source_row_fingerprint text not null,
  supporter_id text not null references public.voiceup_scan_supporters(supporter_id) on delete restrict,
  actor_user_id uuid references auth.users(id),
  duplicate_decision text not null,
  result_status text not null check (
    result_status in ('approval_completed', 'approval_already_completed', 'existing_supporter_returned')
  ),
  created_at timestamptz not null default now(),
  unique (review_item_id),
  unique (workspace_id, campaign_id, source_row_fingerprint),
  unique (supporter_id)
);

create index if not exists voiceup_scan_approval_ledger_workspace_campaign_idx
  on public.voiceup_scan_approval_ledger (workspace_id, campaign_id);

create table if not exists public.voiceup_field_collection_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  review_item_id text,
  supporter_id text,
  approval_key text,
  source_row_fingerprint text,
  result_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  audit_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists voiceup_field_collection_audit_workspace_campaign_idx
  on public.voiceup_field_collection_audit (workspace_id, campaign_id, created_at desc);
create index if not exists voiceup_field_collection_audit_review_idx
  on public.voiceup_field_collection_audit (review_item_id, created_at desc);

alter table public.voiceup_scan_review_items enable row level security;
alter table public.voiceup_scan_supporters enable row level security;
alter table public.voiceup_scan_approval_ledger enable row level security;
alter table public.voiceup_field_collection_audit enable row level security;

create or replace function public.voiceup_identity_key(namespace text, parts text[])
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
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

create or replace function public.voiceup_normalize_indian_phone(raw_phone text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.voiceup_normalize_email(raw_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(btrim(coalesce(raw_email, ''))) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      then lower(btrim(raw_email))
    else null
  end;
$$;

create or replace function public.voiceup_normalize_person_name(raw_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(btrim(coalesce(raw_name, '')), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function public.voiceup_can_approve_field_collection(
  target_workspace_id text,
  target_campaign_id text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
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

drop policy if exists "Field Collection reviewers read review items" on public.voiceup_scan_review_items;
create policy "Field Collection reviewers read review items"
  on public.voiceup_scan_review_items
  for select
  to authenticated
  using (public.voiceup_can_approve_field_collection(workspace_id, campaign_id));

drop policy if exists "Field Collection reviewers read supporters" on public.voiceup_scan_supporters;
create policy "Field Collection reviewers read supporters"
  on public.voiceup_scan_supporters
  for select
  to authenticated
  using (public.voiceup_can_approve_field_collection(workspace_id, campaign_id));

drop policy if exists "Field Collection reviewers read approval ledger" on public.voiceup_scan_approval_ledger;
create policy "Field Collection reviewers read approval ledger"
  on public.voiceup_scan_approval_ledger
  for select
  to authenticated
  using (public.voiceup_can_approve_field_collection(workspace_id, campaign_id));

drop policy if exists "Field Collection reviewers read audit" on public.voiceup_field_collection_audit;
create policy "Field Collection reviewers read audit"
  on public.voiceup_field_collection_audit
  for select
  to authenticated
  using (public.voiceup_can_approve_field_collection(workspace_id, campaign_id));

revoke all on table public.voiceup_scan_review_items from anon, authenticated;
revoke all on table public.voiceup_scan_supporters from anon, authenticated;
revoke all on table public.voiceup_scan_approval_ledger from anon, authenticated;
revoke all on table public.voiceup_field_collection_audit from anon, authenticated;
grant select on table public.voiceup_scan_review_items to authenticated;
grant select on table public.voiceup_scan_supporters to authenticated;
grant select on table public.voiceup_scan_approval_ledger to authenticated;
grant select on table public.voiceup_field_collection_audit to authenticated;

create or replace function public.voiceup_merge_authoritative_field_collection_state(
  target_workspace_id text,
  incoming_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
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

create or replace function public.voiceup_protect_field_collection_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.data := public.voiceup_merge_authoritative_field_collection_state(new.id, new.data);
  return new;
end;
$$;

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
    v_supporter_identity_key, v_normalized_name, v_normalized_email, v_normalized_phone,
    raw_fields, supporter_payload
  ) values (
    v_supporter_id, p_workspace_id, p_campaign_id, p_review_item_id, p_source_row_fingerprint,
    supporter_identity_key, normalized_name, normalized_email, normalized_phone,
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

create or replace function public.record_voiceup_scan_batch_audit(
  p_workspace_id text,
  p_campaign_id text,
  p_batch_id text,
  p_result_code text,
  p_counts jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

-- Idempotent compatibility backfill. The current workflow creates one review
-- item per image, so existing private images use row:0. Manual records use the
-- review ID as their source reference. No historical supporter link is guessed.
with existing_reviews as (
  select
    workspace.id as workspace_id,
    scan ->> 'campaignId' as campaign_id,
    scan ->> 'id' as review_item_id,
    scan,
    case
      when nullif(scan ->> 'filePath', '') is not null then 'legacy:' || (scan ->> 'filePath')
      else 'legacy-review:' || (scan ->> 'id')
    end as legacy_digest,
    case
      when nullif(scan ->> 'filePath', '') is not null then 'row:0'
      else 'review:' || (scan ->> 'id')
    end as source_reference
  from public.voiceup_workspaces workspace
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(workspace.data -> 'scanItems') = 'array'
      then workspace.data -> 'scanItems' else '[]'::jsonb end
  ) scan
  where nullif(scan ->> 'id', '') is not null
    and nullif(scan ->> 'campaignId', '') is not null
), fingerprinted_reviews as (
  select *,
    public.voiceup_identity_key(
      'voiceup-upload-v1',
      array[workspace_id, campaign_id, lower(legacy_digest), '0', '']
    ) as upload_fingerprint
  from existing_reviews
), sourced_reviews as (
  select *,
    public.voiceup_identity_key(
      'voiceup-source-row-v1',
      array[workspace_id, campaign_id, upload_fingerprint, source_reference]
    ) as source_row_fingerprint
  from fingerprinted_reviews
)
insert into public.voiceup_scan_review_items (
  review_item_id, workspace_id, campaign_id, upload_fingerprint, source_row_fingerprint,
  status, raw_fields, normalized_name, normalized_email, normalized_phone,
  consent, review_payload, version, created_at, updated_at
)
select
  review_item_id, workspace_id, campaign_id, upload_fingerprint, source_row_fingerprint,
  case scan ->> 'status' when 'Approved' then 'approved' when 'Rejected' then 'rejected' else 'needs_review' end,
  coalesce(scan -> 'parsedSigner', '{}'::jsonb),
  public.voiceup_normalize_person_name(scan #>> '{parsedSigner,name}'),
  public.voiceup_normalize_email(scan #>> '{parsedSigner,email}'),
  public.voiceup_normalize_indian_phone(scan #>> '{parsedSigner,phone}'),
  jsonb_build_object(
    'paperConsentRecorded', coalesce(scan ->> 'paperConsentRecorded' = 'true', false),
    'smsConsent', coalesce(scan ->> 'smsConsent' = 'true', false),
    'whatsappConsent', coalesce(scan ->> 'whatsappConsent' = 'true', false),
    'noOngoingCommunications', coalesce(scan ->> 'noOngoingCommunications' = 'true', false),
    'consentPurpose', scan ->> 'consentPurpose'
  ),
  scan,
  greatest(coalesce((scan ->> 'reviewVersion')::integer, 1), 1),
  coalesce((scan ->> 'createdAt')::timestamptz, now()),
  now()
from sourced_reviews
on conflict (review_item_id) do nothing;

with historical_links as (
  select
    review.review_item_id,
    review.workspace_id,
    review.campaign_id,
    review.source_row_fingerprint,
    review.normalized_name,
    review.normalized_email,
    review.normalized_phone,
    signer,
    count(*) over (partition by review.review_item_id) as match_count
  from public.voiceup_scan_review_items review
  join public.voiceup_workspaces workspace on workspace.id = review.workspace_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(workspace.data -> 'signers') = 'array'
      then workspace.data -> 'signers' else '[]'::jsonb end
  ) signer
  where review.status = 'approved'
    and signer ->> 'campaignId' = review.campaign_id
    and signer ->> 'sourceScanItemId' = review.review_item_id
)
insert into public.voiceup_scan_supporters (
  supporter_id, workspace_id, campaign_id, review_item_id, source_row_fingerprint,
  supporter_identity_key, normalized_name, normalized_email, normalized_phone,
  raw_fields, supporter_payload
)
select
  signer ->> 'id', workspace_id, campaign_id, review_item_id, source_row_fingerprint,
  case
    when normalized_phone is not null then public.voiceup_identity_key(
      'voiceup-supporter-phone-v1', array[workspace_id, campaign_id, normalized_phone]
    )
    when normalized_email is not null then public.voiceup_identity_key(
      'voiceup-supporter-email-v1', array[workspace_id, campaign_id, normalized_email]
    )
    else public.voiceup_identity_key(
      'voiceup-supporter-source-name-v1', array[workspace_id, campaign_id, normalized_name, source_row_fingerprint]
    )
  end,
  normalized_name, normalized_email, normalized_phone,
  signer, signer
from historical_links
where match_count = 1 and nullif(signer ->> 'id', '') is not null
on conflict do nothing;

update public.voiceup_scan_review_items review
set supporter_id = supporter.supporter_id,
    approval_key = public.voiceup_identity_key(
      'voiceup-approval-v1',
      array[review.workspace_id, review.campaign_id, review.review_item_id, review.source_row_fingerprint]
    ),
    historical_link_uncertain = false,
    updated_at = now()
from public.voiceup_scan_supporters supporter
where review.review_item_id = supporter.review_item_id
  and review.workspace_id = supporter.workspace_id
  and review.campaign_id = supporter.campaign_id;

update public.voiceup_scan_review_items review
set historical_link_uncertain = true,
    updated_at = now()
where review.status = 'approved'
  and review.supporter_id is null;

insert into public.voiceup_scan_approval_ledger (
  approval_key, review_item_id, workspace_id, campaign_id, source_row_fingerprint,
  supporter_id, actor_user_id, duplicate_decision, result_status
)
select
  review.approval_key, review.review_item_id, review.workspace_id, review.campaign_id,
  review.source_row_fingerprint, review.supporter_id, null,
  'historical_backfill', 'approval_completed'
from public.voiceup_scan_review_items review
where review.status = 'approved'
  and review.supporter_id is not null
  and review.approval_key is not null
on conflict do nothing;

drop trigger if exists voiceup_protect_field_collection_state_trigger on public.voiceup_workspaces;
create trigger voiceup_protect_field_collection_state_trigger
before insert or update of data on public.voiceup_workspaces
for each row execute function public.voiceup_protect_field_collection_state();

revoke all on function public.voiceup_identity_key(text, text[]) from public;
revoke all on function public.voiceup_normalize_indian_phone(text) from public;
revoke all on function public.voiceup_normalize_email(text) from public;
revoke all on function public.voiceup_normalize_person_name(text) from public;
revoke all on function public.voiceup_can_approve_field_collection(text, text) from public;
revoke all on function public.voiceup_merge_authoritative_field_collection_state(text, jsonb) from public;
revoke all on function public.voiceup_protect_field_collection_state() from public;
revoke all on function public.approve_voiceup_scan_review_item(text, text, text, integer, text, text, text, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.record_voiceup_scan_batch_audit(text, text, text, text, jsonb) from public;

grant execute on function public.approve_voiceup_scan_review_item(text, text, text, integer, text, text, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.record_voiceup_scan_batch_audit(text, text, text, text, jsonb) to authenticated;
grant execute on function public.voiceup_can_approve_field_collection(text, text) to authenticated;

commit;
