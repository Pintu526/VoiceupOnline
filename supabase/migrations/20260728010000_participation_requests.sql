begin;

-- Generic, normalized request storage for public participation workflows.
-- This is intentionally separate from legacy signer.coordinatorApplication data:
-- existing applications remain readable and are not rewritten or reinterpreted.
create table if not exists public.voiceup_participation_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  application_key text not null check (length(btrim(application_key)) between 1 and 80),
  resource_type text not null check (length(btrim(resource_type)) between 1 and 80),
  resource_id text not null check (length(btrim(resource_id)) between 1 and 160),
  requester_supporter_id text not null check (length(btrim(requester_supporter_id)) between 1 and 160),
  request_type text not null check (request_type in ('volunteer', 'coordinator')),
  requested_role text not null check (requested_role in ('volunteer', 'coordinator')),
  preferred_level text check (
    preferred_level is null
    or preferred_level in ('national', 'state', 'district', 'block', 'panchayat', 'ward')
  ),
  minimum_acceptable_level text check (
    minimum_acceptable_level is null
    or minimum_acceptable_level in ('national', 'state', 'district', 'block', 'panchayat', 'ward')
  ),
  geographic_scope jsonb not null default '{}'::jsonb
    check (jsonb_typeof(geographic_scope) = 'object'),
  skills text[] not null default array[]::text[],
  areas_of_interest text[] not null default array[]::text[],
  motivation text,
  experience text,
  availability text,
  preferred_working_area text,
  status text not null check (
    status in ('pending', 'escalated', 'approved', 'rejected', 'assigned', 'withdrawn')
  ),
  routing_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(routing_metadata) = 'object'),
  escalation_state text not null check (escalation_state in ('none', 'required')),
  consent_evidence jsonb not null check (jsonb_typeof(consent_evidence) = 'object'),
  idempotency_key text not null check (length(idempotency_key) between 12 and 160),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  audit_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(audit_metadata) = 'object')
);

create unique index if not exists voiceup_participation_requests_idempotency_idx
  on public.voiceup_participation_requests (workspace_id, idempotency_key);

-- One active request of each type is allowed per supporter and campaign.
-- Rejected or withdrawn requests are excluded so a supporter may submit a
-- genuinely new request later without deleting history.
create unique index if not exists voiceup_participation_requests_active_unique_idx
  on public.voiceup_participation_requests (
    workspace_id,
    resource_type,
    resource_id,
    requester_supporter_id,
    request_type
  )
  where status in ('pending', 'escalated', 'approved', 'assigned');

create index if not exists voiceup_participation_requests_review_idx
  on public.voiceup_participation_requests (
    workspace_id,
    application_key,
    resource_type,
    resource_id,
    status,
    submitted_at desc
  );

create index if not exists voiceup_participation_requests_requester_idx
  on public.voiceup_participation_requests (
    workspace_id,
    requester_supporter_id,
    submitted_at desc
  );

create table if not exists public.voiceup_participation_request_audit (
  id bigint generated always as identity primary key,
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  request_id uuid not null references public.voiceup_participation_requests(id) on delete cascade,
  requester_supporter_id text not null,
  action text not null check (action in ('request.submitted')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists voiceup_participation_request_audit_workspace_time_idx
  on public.voiceup_participation_request_audit (workspace_id, created_at desc);

create index if not exists voiceup_participation_request_audit_request_time_idx
  on public.voiceup_participation_request_audit (request_id, created_at desc);

alter table public.voiceup_participation_requests enable row level security;
alter table public.voiceup_participation_request_audit enable row level security;

drop policy if exists "Participation requests workspace members read"
  on public.voiceup_participation_requests;
create policy "Participation requests workspace members read"
  on public.voiceup_participation_requests
  for select
  to authenticated
  using (public.voiceup_can_read_coordinator_network(workspace_id));

drop policy if exists "Participation request audit workspace members read"
  on public.voiceup_participation_request_audit;
create policy "Participation request audit workspace members read"
  on public.voiceup_participation_request_audit
  for select
  to authenticated
  using (public.voiceup_can_read_coordinator_network(workspace_id));

revoke all on table public.voiceup_participation_requests from anon, authenticated;
revoke all on table public.voiceup_participation_request_audit from anon, authenticated;
grant select on table public.voiceup_participation_requests to authenticated;
grant select on table public.voiceup_participation_request_audit to authenticated;
grant all on table public.voiceup_participation_requests to service_role;
grant all on table public.voiceup_participation_request_audit to service_role;
grant usage, select on sequence public.voiceup_participation_request_audit_id_seq to service_role;

create or replace function public.voiceup_submit_participation_request(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text,
  p_phone text,
  p_verification_token text,
  p_idempotency_key text,
  p_request jsonb,
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
  v_signer jsonb;
  v_saved public.voiceup_participation_requests%rowtype;
  v_existing public.voiceup_participation_requests%rowtype;
  v_now timestamptz := clock_timestamp();
  v_phone text;
  v_request_type text;
  v_requested_role text;
  v_preferred_level text;
  v_minimum_level text;
  v_geography jsonb;
  v_skills text[];
  v_interests text[];
  v_motivation text;
  v_experience text;
  v_availability text;
  v_working_area text;
  v_consent_version text;
  v_normalized_request jsonb;
  v_fingerprint text;
  v_status text;
  v_escalation_state text;
  v_routing jsonb;
  v_candidate_id uuid;
  v_candidate_type text;
  v_next_role text;
  v_next_level text;
  v_match_geography_level text;
  v_match_geography_name text;
  v_routing_path jsonb;
  v_request_json jsonb;
  v_key text;
  v_value jsonb;
  v_preferred_rank integer;
  v_minimum_rank integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;

  if coalesce(jsonb_typeof(p_request), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_server_metadata), 'null') <> 'object'
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_payload';
  end if;
  if octet_length(p_request::text) > 32768 or octet_length(p_server_metadata::text) > 4096 then
    raise exception using errcode = '22023', message = 'voiceup:payload_too_large';
  end if;
  if p_request::text ~* 'data:[^;]+;base64,' then
    raise exception using errcode = '22023', message = 'voiceup:base64_not_allowed';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_request) request_key
    where request_key not in (
      'requestType', 'requestedRole', 'preferredLevel', 'minimumAcceptableLevel',
      'geographicScope', 'skills', 'areasOfInterest', 'motivation', 'experience',
      'availability', 'preferredWorkingArea', 'consent'
    )
  ) then
    raise exception using errcode = '22023', message = 'voiceup:unsupported_request_field';
  end if;
  if exists (
    select 1
    from unnest(array[
      'requestType', 'requestedRole', 'preferredLevel', 'minimumAcceptableLevel',
      'motivation', 'experience', 'availability', 'preferredWorkingArea'
    ]) scalar_key
    where p_request ? scalar_key
      and jsonb_typeof(p_request -> scalar_key) not in ('string', 'null')
  ) then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_payload';
  end if;

  v_phone := public.voiceup_normalize_public_phone(p_phone);
  if v_phone is null then
    raise exception using errcode = '22023', message = 'voiceup:invalid_phone';
  end if;
  if length(coalesce(p_verification_token, '')) < 24 then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;
  if length(btrim(coalesce(p_idempotency_key, ''))) < 12
    or length(p_idempotency_key) > 160
    or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_idempotency_key';
  end if;

  v_request_type := lower(btrim(coalesce(p_request ->> 'requestType', '')));
  if v_request_type not in ('volunteer', 'coordinator') then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_type';
  end if;
  v_requested_role := lower(btrim(coalesce(p_request ->> 'requestedRole', v_request_type)));
  if v_requested_role <> v_request_type then
    raise exception using errcode = '22023', message = 'voiceup:invalid_requested_role';
  end if;

  v_preferred_level := nullif(lower(btrim(coalesce(p_request ->> 'preferredLevel', ''))), '');
  v_minimum_level := nullif(lower(btrim(coalesce(p_request ->> 'minimumAcceptableLevel', ''))), '');
  if v_request_type = 'coordinator'
    and coalesce(v_preferred_level, '') not in ('national', 'state', 'district', 'block', 'panchayat', 'ward')
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_coordinator_level';
  end if;
  if v_request_type = 'volunteer' and (v_preferred_level is not null or v_minimum_level is not null) then
    raise exception using errcode = '22023', message = 'voiceup:invalid_coordinator_level';
  end if;
  if v_minimum_level is not null
    and v_minimum_level not in ('national', 'state', 'district', 'block', 'panchayat', 'ward')
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_minimum_level';
  end if;

  v_preferred_rank := case v_preferred_level
    when 'national' then 6 when 'state' then 5 when 'district' then 4
    when 'block' then 3 when 'panchayat' then 2 when 'ward' then 1 else null
  end;
  v_minimum_rank := case v_minimum_level
    when 'national' then 6 when 'state' then 5 when 'district' then 4
    when 'block' then 3 when 'panchayat' then 2 when 'ward' then 1 else null
  end;
  if v_minimum_rank is not null and v_minimum_rank > v_preferred_rank then
    raise exception using errcode = '22023', message = 'voiceup:invalid_minimum_level';
  end if;

  v_geography := coalesce(p_request -> 'geographicScope', '{}'::jsonb);
  if jsonb_typeof(v_geography) <> 'object' then
    raise exception using errcode = '22023', message = 'voiceup:invalid_geography';
  end if;
  for v_key, v_value in select geography_item.key, geography_item.value from jsonb_each(v_geography) geography_item
  loop
    if v_key not in (
      'countryId', 'country', 'stateId', 'state', 'districtId', 'district',
      'blockId', 'block', 'panchayatId', 'panchayat', 'wardId', 'ward'
    )
      or jsonb_typeof(v_value) not in ('string', 'null')
      or length(btrim(coalesce(v_value #>> '{}', ''))) > 160
    then
      raise exception using errcode = '22023', message = 'voiceup:invalid_geography';
    end if;
    if v_key like '%Id'
      and coalesce(v_value #>> '{}', '') <> ''
      and (v_value #>> '{}') !~ '^[A-Za-z0-9._:-]{1,160}$'
    then
      raise exception using errcode = '22023', message = 'voiceup:invalid_geography';
    end if;
  end loop;

  if v_request_type = 'coordinator' and (
    (v_preferred_rank <= 5 and btrim(coalesce(v_geography ->> 'state', '')) = '')
    or (v_preferred_rank <= 4 and btrim(coalesce(v_geography ->> 'district', '')) = '')
    or (v_preferred_rank <= 3 and btrim(coalesce(v_geography ->> 'block', '')) = '')
    or (v_preferred_rank <= 2 and btrim(coalesce(v_geography ->> 'panchayat', '')) = '')
    or (v_preferred_rank <= 1 and btrim(coalesce(v_geography ->> 'ward', '')) = '')
  ) then
    raise exception using errcode = '22023', message = 'voiceup:incomplete_request_geography';
  end if;

  if p_request ? 'skills' and jsonb_typeof(p_request -> 'skills') <> 'array' then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_payload';
  end if;
  if p_request ? 'areasOfInterest' and jsonb_typeof(p_request -> 'areasOfInterest') <> 'array' then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_payload';
  end if;
  if jsonb_array_length(coalesce(p_request -> 'skills', '[]'::jsonb)) > 20
    or jsonb_array_length(coalesce(p_request -> 'areasOfInterest', '[]'::jsonb)) > 20
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_payload';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_request -> 'skills', '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'string' or length(btrim(item #>> '{}')) not between 1 and 120
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(p_request -> 'areasOfInterest', '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'string' or length(btrim(item #>> '{}')) not between 1 and 120
  ) then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_payload';
  end if;

  select coalesce(array_agg(normalized_value order by normalized_value), array[]::text[])
    into v_skills
  from (
    select distinct regexp_replace(btrim(item #>> '{}'), '\s+', ' ', 'g') as normalized_value
    from jsonb_array_elements(coalesce(p_request -> 'skills', '[]'::jsonb)) item
  ) normalized_skills;
  select coalesce(array_agg(normalized_value order by normalized_value), array[]::text[])
    into v_interests
  from (
    select distinct regexp_replace(btrim(item #>> '{}'), '\s+', ' ', 'g') as normalized_value
    from jsonb_array_elements(coalesce(p_request -> 'areasOfInterest', '[]'::jsonb)) item
  ) normalized_interests;

  v_motivation := nullif(regexp_replace(btrim(coalesce(p_request ->> 'motivation', '')), '\s+', ' ', 'g'), '');
  v_experience := nullif(regexp_replace(btrim(coalesce(p_request ->> 'experience', '')), '\s+', ' ', 'g'), '');
  v_availability := nullif(regexp_replace(btrim(coalesce(p_request ->> 'availability', '')), '\s+', ' ', 'g'), '');
  v_working_area := nullif(regexp_replace(btrim(coalesce(p_request ->> 'preferredWorkingArea', '')), '\s+', ' ', 'g'), '');
  if length(coalesce(v_motivation, '')) > 2000
    or length(coalesce(v_experience, '')) > 2000
    or length(coalesce(v_availability, '')) > 500
    or length(coalesce(v_working_area, '')) > 500
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_payload';
  end if;

  if coalesce(jsonb_typeof(p_request -> 'consent'), 'null') <> 'object'
    or coalesce(p_request #>> '{consent,granted}', 'false') <> 'true'
  then
    raise exception using errcode = '22023', message = 'voiceup:request_consent_required';
  end if;
  v_consent_version := btrim(coalesce(p_request #>> '{consent,version}', ''));
  if length(v_consent_version) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'voiceup:request_consent_required';
  end if;
  if length(btrim(coalesce(p_request #>> '{consent,policyId}', ''))) > 160 then
    raise exception using errcode = '22023', message = 'voiceup:invalid_request_payload';
  end if;

  select workspace.data
    into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id
  for update;
  if v_workspace_data is null then
    raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
  end if;

  select campaign_item
    into v_campaign
  from jsonb_array_elements(coalesce(v_workspace_data -> 'campaigns', '[]'::jsonb)) campaign_item
  where campaign_item ->> 'id' = p_campaign_id
    and campaign_item ->> 'slug' = p_campaign_slug
    and campaign_item ->> 'status' = 'Published'
  limit 1;
  if v_campaign is null or not exists (
    select 1
    from public.voiceup_public_campaign_index campaign_index
    where campaign_index.workspace_id = p_workspace_id
      and campaign_index.campaign_id = p_campaign_id
      and campaign_index.slug = p_campaign_slug
      and campaign_index.status = 'Published'
  ) then
    raise exception using errcode = '22023', message = 'voiceup:campaign_unavailable';
  end if;

  if not exists (
    select 1
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
  ) then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;

  select signer_item
    into v_signer
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer_item
  where signer_item ->> 'campaignId' = p_campaign_id
    and coalesce(
      nullif(signer_item ->> 'canonicalPhone', ''),
      public.voiceup_normalize_public_phone(signer_item ->> 'phone')
    ) = v_phone
    and (
      coalesce(signer_item ->> 'supportSubmittedAt', '') <> ''
      or (
        signer_item ->> 'source' = 'online'
        and signer_item ->> 'status' = 'verified'
        and coalesce(signer_item ->> 'signedAt', '') <> ''
      )
    )
  order by coalesce(signer_item ->> 'supportSubmittedAt', signer_item ->> 'signedAt', '') desc
  limit 1;
  if v_signer is null or btrim(coalesce(v_signer ->> 'id', '')) = '' then
    raise exception using errcode = '22023', message = 'voiceup:support_completion_required';
  end if;

  v_normalized_request := jsonb_strip_nulls(jsonb_build_object(
    'requestType', v_request_type,
    'requestedRole', v_requested_role,
    'preferredLevel', v_preferred_level,
    'minimumAcceptableLevel', v_minimum_level,
    'geographicScope', v_geography,
    'skills', to_jsonb(v_skills),
    'areasOfInterest', to_jsonb(v_interests),
    'motivation', v_motivation,
    'experience', v_experience,
    'availability', v_availability,
    'preferredWorkingArea', v_working_area,
    'requesterSupporterId', v_signer ->> 'id',
    'campaignId', p_campaign_id
  ));
  v_fingerprint := encode(digest(v_normalized_request::text, 'sha256'), 'hex');

  select request_row.*
    into v_existing
  from public.voiceup_participation_requests request_row
  where request_row.workspace_id = p_workspace_id
    and request_row.idempotency_key = p_idempotency_key
  limit 1;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'voiceup:idempotency_conflict';
    end if;
    v_saved := v_existing;
  else
    select request_row.*
      into v_existing
    from public.voiceup_participation_requests request_row
    where request_row.workspace_id = p_workspace_id
      and request_row.resource_type = 'campaign'
      and request_row.resource_id = p_campaign_id
      and request_row.requester_supporter_id = v_signer ->> 'id'
      and request_row.request_type = v_request_type
      and request_row.status in ('pending', 'escalated', 'approved', 'assigned')
    order by request_row.submitted_at desc
    limit 1;
    if found then
      v_saved := v_existing;
    else
      v_next_role := case v_preferred_level
        when 'ward' then 'panchayat_coordinator'
        when 'panchayat' then 'block_coordinator'
        when 'block' then 'district_coordinator'
        when 'district' then 'state_coordinator'
        when 'state' then 'national_coordinator'
        else null
      end;
      v_next_level := case v_preferred_level
        when 'ward' then 'panchayat'
        when 'panchayat' then 'block'
        when 'block' then 'district'
        when 'district' then 'state'
        when 'state' then 'national'
        else 'campaign_owner'
      end;
      v_match_geography_level := case v_preferred_level
        when 'ward' then 'panchayat'
        when 'panchayat' then 'block'
        when 'block' then 'district'
        when 'district' then 'state'
        else null
      end;
      v_match_geography_name := case v_match_geography_level
        when 'panchayat' then v_geography ->> 'panchayat'
        when 'block' then v_geography ->> 'block'
        when 'district' then v_geography ->> 'district'
        when 'state' then v_geography ->> 'state'
        else null
      end;
      v_routing_path := case v_preferred_level
        when 'ward' then '["panchayat","block","district","state","national","campaign_owner"]'::jsonb
        when 'panchayat' then '["block","district","state","national","campaign_owner"]'::jsonb
        when 'block' then '["district","state","national","campaign_owner"]'::jsonb
        when 'district' then '["state","national","campaign_owner"]'::jsonb
        when 'state' then '["national","campaign_owner"]'::jsonb
        else '["campaign_owner"]'::jsonb
      end;

      if v_request_type = 'coordinator' and v_next_role is not null then
        select coordinator.id
          into v_candidate_id
        from public.voiceup_coordinators coordinator
        join public.voiceup_coordinator_campaigns campaign_link
          on campaign_link.coordinator_id = coordinator.id
          and campaign_link.workspace_id = p_workspace_id
          and campaign_link.campaign_id = p_campaign_id
          and campaign_link.active
        left join public.voiceup_coordinator_geographies geography
          on geography.id = coordinator.geography_id
          and geography.workspace_id = p_workspace_id
          and geography.active
        where coordinator.workspace_id = p_workspace_id
          and coordinator.deleted_at is null
          and coordinator.status = 'active'
          and coordinator.role = v_next_role
          and (
            v_match_geography_level is null
            or (
              geography.level = v_match_geography_level
              and lower(btrim(geography.name)) = lower(btrim(v_match_geography_name))
            )
          )
        order by coordinator.updated_at desc, coordinator.id
        limit 1;
        if found then
          v_candidate_type := 'coordinator';
        end if;
      end if;

      if v_candidate_id is null then
        select assignment.user_id
          into v_candidate_id
        from public.workspace_resource_members assignment
        where assignment.workspace_id = p_workspace_id
          and assignment.application_key = 'voiceup'
          and assignment.resource_type = 'campaign'
          and assignment.resource_id = p_campaign_id
          and assignment.role = 'campaign_admin'
          and assignment.active
        order by assignment.assigned_at desc, assignment.id
        limit 1;
        if found then
          v_candidate_type := 'workspace_resource_member';
          v_next_level := 'campaign_owner';
        end if;
      end if;

      v_status := case when v_candidate_id is null then 'escalated' else 'pending' end;
      v_escalation_state := case when v_candidate_id is null then 'required' else 'none' end;
      v_routing := jsonb_strip_nulls(jsonb_build_object(
        'candidateApproverType', v_candidate_type,
        'candidateApproverId', v_candidate_id,
        'approvalScope', v_geography,
        'nextLevel', v_next_level,
        'routingPath', v_routing_path,
        'resolvedAt', v_now,
        'resolution', case when v_candidate_id is null then 'no_authoritative_approver' else 'candidate_resolved' end
      ));

      insert into public.voiceup_participation_requests (
        workspace_id,
        application_key,
        resource_type,
        resource_id,
        requester_supporter_id,
        request_type,
        requested_role,
        preferred_level,
        minimum_acceptable_level,
        geographic_scope,
        skills,
        areas_of_interest,
        motivation,
        experience,
        availability,
        preferred_working_area,
        status,
        routing_metadata,
        escalation_state,
        consent_evidence,
        idempotency_key,
        request_fingerprint,
        submitted_at,
        updated_at,
        audit_metadata
      ) values (
        p_workspace_id,
        'voiceup',
        'campaign',
        p_campaign_id,
        v_signer ->> 'id',
        v_request_type,
        v_requested_role,
        v_preferred_level,
        v_minimum_level,
        v_geography,
        v_skills,
        v_interests,
        v_motivation,
        v_experience,
        v_availability,
        v_working_area,
        v_status,
        v_routing,
        v_escalation_state,
        jsonb_strip_nulls(jsonb_build_object(
          'granted', true,
          'recordedAt', v_now,
          'version', v_consent_version,
          'policyId', nullif(btrim(coalesce(p_request #>> '{consent,policyId}', '')), ''),
          'textSnapshot', coalesce(v_campaign ->> 'consentText', ''),
          'captureSource', left(coalesce(nullif(p_server_metadata ->> 'source', ''), 'public-edge-function'), 80),
          'campaignId', p_campaign_id,
          'supporterId', v_signer ->> 'id'
        )),
        p_idempotency_key,
        v_fingerprint,
        v_now,
        v_now,
        jsonb_strip_nulls(jsonb_build_object(
          'source', left(coalesce(nullif(p_server_metadata ->> 'source', ''), 'public-edge-function'), 80),
          'requestId', left(coalesce(p_server_metadata ->> 'requestId', ''), 160),
          'clientHash', left(coalesce(p_server_metadata ->> 'clientHash', ''), 160),
          'submittedBy', 'verified_supporter'
        ))
      )
      returning * into v_saved;

      insert into public.voiceup_participation_request_audit (
        workspace_id,
        request_id,
        requester_supporter_id,
        action,
        metadata,
        created_at
      ) values (
        p_workspace_id,
        v_saved.id,
        v_saved.requester_supporter_id,
        'request.submitted',
        jsonb_build_object(
          'requestType', v_saved.request_type,
          'resourceType', v_saved.resource_type,
          'resourceId', v_saved.resource_id,
          'initialStatus', v_saved.status,
          'routingMetadata', v_saved.routing_metadata,
          'escalationState', v_saved.escalation_state
        ),
        v_now
      );
    end if;
  end if;

  v_request_json := jsonb_strip_nulls(
    jsonb_build_object(
      'id', v_saved.id,
      'workspaceId', v_saved.workspace_id,
      'applicationKey', v_saved.application_key,
      'resourceType', v_saved.resource_type,
      'resourceId', v_saved.resource_id,
      'requesterSupporterId', v_saved.requester_supporter_id,
      'requestType', v_saved.request_type,
      'requestedRole', v_saved.requested_role,
      'preferredLevel', v_saved.preferred_level,
      'minimumAcceptableLevel', v_saved.minimum_acceptable_level,
      'geographicScope', v_saved.geographic_scope,
      'skills', to_jsonb(v_saved.skills)
    )
    ||
    jsonb_build_object(
      'areasOfInterest', to_jsonb(v_saved.areas_of_interest),
      'motivation', v_saved.motivation,
      'experience', v_saved.experience,
      'availability', v_saved.availability,
      'preferredWorkingArea', v_saved.preferred_working_area,
      'status', v_saved.status,
      'routingMetadata', v_saved.routing_metadata,
      'escalationState', v_saved.escalation_state,
      'consentEvidence', v_saved.consent_evidence,
      'submittedAt', v_saved.submitted_at,
      'updatedAt', v_saved.updated_at,
      'auditMetadata', v_saved.audit_metadata
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'submit_participation_request',
    'request', v_request_json,
    'message', case v_saved.request_type
      when 'volunteer' then 'Your volunteer application has been submitted for review.'
      else 'Your coordinator application has been submitted for review.'
    end
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'voiceup:active_participation_request_exists';
  when lock_not_available or query_canceled then
    return jsonb_build_object(
      'ok', false,
      'code', 'busy',
      'retryable', true,
      'message', 'Participation is busy. Retry safely with the same idempotency key.'
    );
end;
$$;

do $participation_request_pgcrypto_search_path$
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
  then
    raise exception 'Participation request pgcrypto prerequisite failed.';
  end if;

  execute format(
    'alter function public.voiceup_submit_participation_request(text,text,text,text,text,text,jsonb,jsonb) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
end
$participation_request_pgcrypto_search_path$;

revoke all on function public.voiceup_submit_participation_request(
  text, text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.voiceup_submit_participation_request(
  text, text, text, text, text, text, jsonb, jsonb
) to service_role;

comment on table public.voiceup_participation_requests is
  'Authoritative reusable public movement requests. Public submission never grants roles or permissions.';
comment on function public.voiceup_submit_participation_request(
  text, text, text, text, text, text, jsonb, jsonb
) is
  'Creates a pending or escalated request for an existing OTP-verified supporter without activating any role.';

notify pgrst, 'reload schema';

commit;
