begin;

select plan(17);

select ok(
  (
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = to_regprocedure(
      'public.approve_voiceup_scan_review_item(text,text,text,integer,text,text,text,text,jsonb,jsonb,jsonb)'
    )
  ),
  'approval function remains SECURITY DEFINER'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.approve_voiceup_scan_review_item(text,text,text,integer,text,text,text,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated retains the approval EXECUTE grant'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.voiceup_workspaces'::regclass
      and trigger_record.tgname = 'voiceup_protect_field_collection_state_trigger'
      and not trigger_record.tgisinternal
  ),
  'the Field Collection compatibility trigger remains installed'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'fc010000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'fc01-regression@voiceup.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.voiceup_workspaces (id, data)
values (
  'fc01-regression-workspace',
  jsonb_build_object(
    'campaigns', jsonb_build_array(jsonb_build_object('id', 'fc01-regression-campaign')),
    'scanItems', '[]'::jsonb,
    'signers', '[]'::jsonb,
    'auditLogs', '[]'::jsonb
  )
);

do $fc01_member$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'voiceup_workspace_members'
      and column_name = 'email'
  ) then
    execute $sql$
      insert into public.voiceup_workspace_members (
        workspace_id, user_id, email, role, active
      ) values (
        'fc01-regression-workspace',
        'fc010000-0000-4000-8000-000000000001',
        'fc01-regression@voiceup.invalid',
        'field_officer',
        true
      )
    $sql$;
  else
    insert into public.voiceup_workspace_members (
      workspace_id, user_id, role, active
    ) values (
      'fc01-regression-workspace',
      'fc010000-0000-4000-8000-000000000001',
      'field_officer',
      true
    );
  end if;
end;
$fc01_member$;

do $fc01_auth$
begin
  perform set_config(
    'request.jwt.claim.sub',
    'fc010000-0000-4000-8000-000000000001',
    true
  );
  perform set_config(
    'request.jwt.claims',
    '{"sub":"fc010000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
end;
$fc01_auth$;

create temporary table fc01_inputs as
select
  'fc01-regression-workspace'::text as workspace_id,
  'fc01-regression-campaign'::text as campaign_id,
  'fc01-regression-review'::text as review_item_id,
  'fc01-regression-upload'::text as upload_fingerprint,
  'row:0'::text as source_reference,
  public.voiceup_identity_key(
    'voiceup-source-row-v1',
    array[
      'fc01-regression-workspace',
      'fc01-regression-campaign',
      'fc01-regression-upload',
      'row:0'
    ]
  ) as source_row_fingerprint;

alter table fc01_inputs add column approval_key text;

update fc01_inputs
set approval_key = public.voiceup_identity_key(
  'voiceup-approval-v1',
  array[workspace_id, campaign_id, review_item_id, source_row_fingerprint]
);

create temporary table fc01_first_result as
select public.approve_voiceup_scan_review_item(
  inputs.workspace_id,
  inputs.campaign_id,
  inputs.review_item_id,
  1,
  inputs.upload_fingerprint,
  inputs.source_reference,
  inputs.source_row_fingerprint,
  inputs.approval_key,
  jsonb_build_object(
    'id', inputs.review_item_id,
    'campaignId', inputs.campaign_id,
    'status', 'Needs review',
    'reviewVersion', 1
  ),
  jsonb_build_object(
    'name', '  FC One  ',
    'email', ' FC01@Example.Test ',
    'phone', '+91 98765-43210'
  ),
  jsonb_build_object('paperConsentRecorded', true)
) as result
from fc01_inputs inputs;

select is(
  (select result ->> 'code' from fc01_first_result),
  'approval_completed',
  'first approval completes'
);

select ok(
  nullif((select result ->> 'supporterId' from fc01_first_result), '') is not null,
  'first approval returns a supporter ID'
);

select is(
  (select count(*)::integer from public.voiceup_scan_supporters
   where review_item_id = 'fc01-regression-review'),
  1,
  'approval creates exactly one supporter'
);

select is(
  (select supporter_identity_key from public.voiceup_scan_supporters
   where review_item_id = 'fc01-regression-review'),
  public.voiceup_identity_key(
    'voiceup-supporter-phone-v1',
    array['fc01-regression-workspace', 'fc01-regression-campaign', '9876543210']
  ),
  'supporter identity is inserted into the supporter_identity_key column'
);

select is(
  (select normalized_name from public.voiceup_scan_supporters
   where review_item_id = 'fc01-regression-review'),
  'fc one',
  'normalized name is inserted into normalized_name'
);

select is(
  (select normalized_email from public.voiceup_scan_supporters
   where review_item_id = 'fc01-regression-review'),
  'fc01@example.test',
  'normalized email is inserted into normalized_email'
);

select is(
  (select normalized_phone from public.voiceup_scan_supporters
   where review_item_id = 'fc01-regression-review'),
  '9876543210',
  'normalized phone is inserted into normalized_phone'
);

select is(
  (select status from public.voiceup_scan_review_items
   where review_item_id = 'fc01-regression-review'),
  'approved',
  'review becomes approved after supporter insertion'
);

select is(
  (select count(*)::integer from public.voiceup_scan_approval_ledger
   where review_item_id = 'fc01-regression-review'),
  1,
  'approval writes exactly one ledger row'
);

select is(
  (select count(*)::integer from public.voiceup_field_collection_audit
   where review_item_id = 'fc01-regression-review'
     and result_code = 'approval_completed'),
  1,
  'approval writes one completion audit row'
);

create temporary table fc01_retry_result as
select public.approve_voiceup_scan_review_item(
  inputs.workspace_id,
  inputs.campaign_id,
  inputs.review_item_id,
  1,
  inputs.upload_fingerprint,
  inputs.source_reference,
  inputs.source_row_fingerprint,
  inputs.approval_key,
  jsonb_build_object(
    'id', inputs.review_item_id,
    'campaignId', inputs.campaign_id,
    'status', 'Needs review',
    'reviewVersion', 1
  ),
  jsonb_build_object(
    'name', '  FC One  ',
    'email', ' FC01@Example.Test ',
    'phone', '+91 98765-43210'
  ),
  jsonb_build_object('paperConsentRecorded', true)
) as result
from fc01_inputs inputs;

select is(
  (select result ->> 'code' from fc01_retry_result),
  'approval_already_completed',
  'identical retry returns the idempotent result'
);

select is(
  (select result ->> 'supporterId' from fc01_retry_result),
  (select result ->> 'supporterId' from fc01_first_result),
  'identical retry returns the original supporter'
);

select is(
  (select count(*)::integer from public.voiceup_scan_supporters
   where review_item_id = 'fc01-regression-review'),
  1,
  'identical retry does not create another supporter'
);

select is(
  (select count(*)::integer from public.voiceup_scan_approval_ledger
   where review_item_id = 'fc01-regression-review'),
  1,
  'identical retry does not create another ledger row'
);

select * from finish();

rollback;
