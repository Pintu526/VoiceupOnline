begin;

-- Development-only additive foundation for one authenticated VoiceUp / Business OS
-- entry point. Both functions derive the actor exclusively from auth.uid(). No
-- caller-supplied workspace, campaign, supporter, coordinator, role, or email is
-- accepted as authorization evidence.
do $account_access_prerequisites$
declare
  required_table text;
begin
  foreach required_table in array array[
    'voiceup_workspaces',
    'voiceup_workspace_members',
    'workspace_resource_members',
    'organization_members',
    'voiceup_supporter_accounts',
    'voiceup_participation_requests',
    'voiceup_coordinators',
    'voiceup_coordinator_geographies',
    'voiceup_coordinator_campaigns'
  ]
  loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'VoiceUp account access prerequisite failed: public.% is missing.', required_table;
    end if;
  end loop;
end
$account_access_prerequisites$;

create or replace function public.voiceup_get_access_manifest()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
stable
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text;
  v_email_confirmed_at timestamptz;
  v_platform_admin boolean := false;
  v_supporters jsonb := '[]'::jsonb;
  v_volunteers jsonb := '[]'::jsonb;
  v_coordinators jsonb := '[]'::jsonb;
  v_memberships jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;

  select lower(btrim(coalesce(users.email, ''))), users.email_confirmed_at
    into v_actor_email, v_email_confirmed_at
  from auth.users users
  where users.id = v_actor_id
    and users.deleted_at is null;

  if not found or v_actor_email = '' or v_email_confirmed_at is null then
    raise exception using errcode = '28000', message = 'voiceup:verified_email_required';
  end if;

  select exists (
    select 1
    from public.organization_members member
    where member.user_id = v_actor_id
      and member.role = 'platform_owner'
  ) or exists (
    select 1
    from public.voiceup_workspace_members member
    where member.user_id = v_actor_id
      and member.active
      and member.role = 'platform_owner'
  ) into v_platform_admin;

  select coalesce(jsonb_agg(jsonb_build_object(
    'accountId', account.id,
    'workspaceId', account.workspace_id,
    'workspaceName', coalesce(
      nullif(workspace.data #>> '{organization,name}', ''),
      nullif(workspace.data #>> '{organizationName}', ''),
      account.workspace_id
    ),
    'campaignId', account.campaign_id,
    'campaignSlug', coalesce(campaign.item ->> 'slug', ''),
    'campaignTitle', coalesce(campaign.item ->> 'title', account.campaign_id),
    'supporterId', account.supporter_id,
    'supporterName', coalesce(signer.item ->> 'name', ''),
    'referralCode', coalesce(signer.item ->> 'referralCode', ''),
    'claimedAt', account.claimed_at
  ) order by account.claimed_at desc), '[]'::jsonb)
    into v_supporters
  from public.voiceup_supporter_accounts account
  join public.voiceup_workspaces workspace on workspace.id = account.workspace_id
  left join lateral (
    select signer_value as item
    from jsonb_array_elements(coalesce(workspace.data -> 'signers', '[]'::jsonb)) signer_value
    where signer_value ->> 'campaignId' = account.campaign_id
      and signer_value ->> 'id' = account.supporter_id
    limit 1
  ) signer on true
  left join lateral (
    select campaign_value as item
    from jsonb_array_elements(coalesce(workspace.data -> 'campaigns', '[]'::jsonb)) campaign_value
    where campaign_value ->> 'id' = account.campaign_id
    limit 1
  ) campaign on true
  where account.auth_user_id = v_actor_id;

  -- A pending request is never a role. Only an approved/assigned volunteer request
  -- belonging to an independently claimed supporter record is returned.
  select coalesce(jsonb_agg(jsonb_build_object(
    'requestId', request.id,
    'accountId', account.id,
    'workspaceId', request.workspace_id,
    'campaignId', request.resource_id,
    'supporterId', request.requester_supporter_id,
    'role', 'volunteer',
    'status', request.status,
    'geographicScope', request.geographic_scope,
    'approvedAt', request.updated_at
  ) order by request.updated_at desc), '[]'::jsonb)
    into v_volunteers
  from public.voiceup_participation_requests request
  join public.voiceup_supporter_accounts account
    on account.auth_user_id = v_actor_id
   and account.workspace_id = request.workspace_id
   and account.campaign_id = request.resource_id
   and account.supporter_id = request.requester_supporter_id
  where request.application_key = 'voiceup'
    and request.resource_type = 'campaign'
    and request.request_type = 'volunteer'
    and request.requested_role = 'volunteer'
    and request.status in ('approved', 'assigned');

  -- Coordinator identity binding remains deliberately separate from authorization.
  -- canOpenBusinessOs is true only when the same auth.uid() independently owns an
  -- active workspace membership already accepted by existing authorization rules.
  select coalesce(jsonb_agg(jsonb_build_object(
    'coordinatorId', coordinator.id,
    'workspaceId', coordinator.workspace_id,
    'fullName', coordinator.full_name,
    'role', coordinator.role,
    'status', coordinator.status,
    'geography', case when geography.id is null then null else jsonb_build_object(
      'id', geography.id,
      'level', geography.level,
      'name', geography.name,
      'path', geography.path
    ) end,
    'campaignIds', coalesce((
      select jsonb_agg(link.campaign_id order by link.campaign_id)
      from public.voiceup_coordinator_campaigns link
      where link.coordinator_id = coordinator.id
        and link.workspace_id = coordinator.workspace_id
        and link.active
    ), '[]'::jsonb),
    'workspaceRole', coalesce(member.role, ''),
    'canOpenBusinessOs', member.id is not null
  ) order by coordinator.updated_at desc), '[]'::jsonb)
    into v_coordinators
  from public.voiceup_coordinators coordinator
  left join public.voiceup_coordinator_geographies geography
    on geography.id = coordinator.geography_id
   and geography.workspace_id = coordinator.workspace_id
   and geography.active
  left join public.voiceup_workspace_members member
    on member.workspace_id = coordinator.workspace_id
   and member.user_id = v_actor_id
   and member.active
   and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer', 'viewer')
  where coordinator.auth_user_id = v_actor_id
    and coordinator.status = 'active'
    and coordinator.mobile_verified_at is not null
    and coordinator.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'workspaceId', member.workspace_id,
    'workspaceName', coalesce(
      nullif(workspace.data #>> '{organization,name}', ''),
      nullif(workspace.data #>> '{organizationName}', ''),
      member.workspace_id
    ),
    'role', member.role,
    'permissions', case member.role
      when 'platform_owner' then jsonb_build_array('platform_admin', 'workspace_admin')
      when 'workspace_admin' then jsonb_build_array('workspace_admin')
      when 'campaign_admin' then jsonb_build_array('campaign_admin')
      when 'field_officer' then jsonb_build_array('field_operations')
      when 'viewer' then jsonb_build_array('workspace_view')
      else '[]'::jsonb
    end,
    'campaignAssignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignmentId', assignment.id,
        'applicationKey', assignment.application_key,
        'role', assignment.role,
        'resourceType', assignment.resource_type,
        'resourceId', assignment.resource_id,
        'resourceSlug', coalesce(assignment.resource_slug, '')
      ) order by assignment.assigned_at desc)
      from public.workspace_resource_members assignment
      where assignment.user_id = v_actor_id
        and assignment.workspace_id = member.workspace_id
        and assignment.active
        and assignment.revoked_at is null
    ), '[]'::jsonb)
  ) order by member.workspace_id), '[]'::jsonb)
    into v_memberships
  from public.voiceup_workspace_members member
  join public.voiceup_workspaces workspace on workspace.id = member.workspace_id
  where member.user_id = v_actor_id
    and member.active
    and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer', 'viewer');

  return jsonb_build_object(
    'schemaVersion', 1,
    'user', jsonb_build_object('id', v_actor_id, 'email', v_actor_email),
    'platformAdmin', v_platform_admin,
    'supporterOwnerships', v_supporters,
    'volunteerAssignments', v_volunteers,
    'coordinatorBindings', v_coordinators,
    'workspaceMemberships', v_memberships,
    'hasAuthorizedAccess', v_platform_admin
      or jsonb_array_length(v_supporters) > 0
      or jsonb_array_length(v_volunteers) > 0
      or jsonb_array_length(v_coordinators) > 0
      or jsonb_array_length(v_memberships) > 0
  );
end
$function$;

create or replace function public.voiceup_read_owned_supporter_dashboard(
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
stable
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_email_confirmed_at timestamptz;
  v_account public.voiceup_supporter_accounts%rowtype;
  v_workspace_data jsonb;
  v_signer jsonb;
  v_campaign jsonb;
  v_signer_count bigint;
  v_campaign_count bigint;
  v_requests jsonb := '[]'::jsonb;
  v_referral_code text;
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

  select account.*
    into v_account
  from public.voiceup_supporter_accounts account
  where account.id = p_account_id
    and account.auth_user_id = v_actor_id;

  if not found then
    raise exception using errcode = '42501', message = 'voiceup:supporter_dashboard_not_authorized';
  end if;

  select workspace.data
    into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = v_account.workspace_id;

  if not found then
    raise exception using errcode = '22023', message = 'voiceup:supporter_dashboard_unavailable';
  end if;

  select count(*), (jsonb_agg(signer_value) -> 0)
    into v_signer_count, v_signer
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer_value
  where signer_value ->> 'campaignId' = v_account.campaign_id
    and signer_value ->> 'id' = v_account.supporter_id;

  select count(*), (jsonb_agg(campaign_value) -> 0)
    into v_campaign_count, v_campaign
  from jsonb_array_elements(coalesce(v_workspace_data -> 'campaigns', '[]'::jsonb)) campaign_value
  where campaign_value ->> 'id' = v_account.campaign_id;

  if v_signer_count <> 1 or v_campaign_count <> 1 then
    raise exception using errcode = '22023', message = 'voiceup:supporter_dashboard_unavailable';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'requestId', request.id,
    'type', request.request_type,
    'role', request.requested_role,
    'status', request.status,
    'preferredLevel', request.preferred_level,
    'minimumAcceptableLevel', request.minimum_acceptable_level,
    'geographicScope', request.geographic_scope,
    'submittedAt', request.submitted_at,
    'updatedAt', request.updated_at
  ) order by request.submitted_at desc), '[]'::jsonb)
    into v_requests
  from public.voiceup_participation_requests request
  where request.workspace_id = v_account.workspace_id
    and request.application_key = 'voiceup'
    and request.resource_type = 'campaign'
    and request.resource_id = v_account.campaign_id
    and request.requester_supporter_id = v_account.supporter_id;

  v_referral_code := upper(btrim(coalesce(v_signer ->> 'referralCode', '')));

  return jsonb_build_object(
    'schemaVersion', 1,
    'account', jsonb_build_object(
      'accountId', v_account.id,
      'workspaceId', v_account.workspace_id,
      'campaignId', v_account.campaign_id,
      'supporterId', v_account.supporter_id,
      'claimedAt', v_account.claimed_at
    ),
    'workspace', jsonb_build_object(
      'name', coalesce(
        nullif(v_workspace_data #>> '{organization,name}', ''),
        nullif(v_workspace_data #>> '{organizationName}', ''),
        v_account.workspace_id
      )
    ),
    'campaign', jsonb_build_object(
      'id', v_account.campaign_id,
      'slug', coalesce(v_campaign ->> 'slug', ''),
      'title', coalesce(v_campaign ->> 'title', ''),
      'status', coalesce(v_campaign ->> 'status', '')
    ),
    'supporter', jsonb_build_object(
      'id', v_account.supporter_id,
      'name', coalesce(v_signer ->> 'name', ''),
      'email', coalesce(v_signer ->> 'email', ''),
      'phone', coalesce(v_signer ->> 'phone', ''),
      'status', coalesce(v_signer ->> 'status', ''),
      'signedAt', coalesce(v_signer ->> 'signedAt', v_signer ->> 'supportSubmittedAt', ''),
      'languagePreference', coalesce(v_signer ->> 'languagePreference', ''),
      'referralCode', v_referral_code,
      'location', jsonb_build_object(
        'country', coalesce(v_signer ->> 'country', ''),
        'state', coalesce(v_signer ->> 'state', ''),
        'district', coalesce(v_signer ->> 'district', ''),
        'block', coalesce(v_signer ->> 'block', ''),
        'panchayat', coalesce(v_signer ->> 'panchayat', ''),
        'ward', coalesce(v_signer ->> 'ward', ''),
        'village', coalesce(v_signer ->> 'village', '')
      )
    ),
    'participationRequests', v_requests,
    'referralPath', case when v_referral_code = '' then '' else '/r/' || v_referral_code end,
    'campaignPath', case when coalesce(v_campaign ->> 'slug', '') = '' then ''
      else '/c/' || (v_campaign ->> 'slug') end
  );
end
$function$;

revoke all on function public.voiceup_get_access_manifest()
  from public, anon, service_role;
grant execute on function public.voiceup_get_access_manifest()
  to authenticated;

revoke all on function public.voiceup_read_owned_supporter_dashboard(uuid)
  from public, anon, service_role;
grant execute on function public.voiceup_read_owned_supporter_dashboard(uuid)
  to authenticated;

comment on function public.voiceup_get_access_manifest() is
  'Returns only auth.uid()-owned supporter records, approved volunteer assignments, active coordinator identity bindings, active memberships, and active resource assignments. Coordinator binding alone grants no Business OS permission.';
comment on function public.voiceup_read_owned_supporter_dashboard(uuid) is
  'Reads one canonical supporter profile only when the requested account mapping belongs to auth.uid(); exposes no other supporter records.';

notify pgrst, 'reload schema';

commit;
