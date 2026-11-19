begin;

-- Additive owner-only completion of optional supporter profile fields. The
-- canonical account mapping is the authority; signing OTPs are intentionally
-- not accepted by this contract.
create or replace function public.voiceup_update_owned_supporter_profile(
  p_account_id uuid,
  p_profile_patch jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_account public.voiceup_supporter_accounts%rowtype;
  v_workspace_data jsonb;
  v_signer jsonb;
  v_signer_count integer;
  v_signers jsonb;
  v_patch jsonb := coalesce(p_profile_patch, '{}'::jsonb);
  v_invalid_fields text[];
  v_audit jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;
  if p_account_id is null or p_request_id is null or jsonb_typeof(v_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'voiceup:invalid_profile_update';
  end if;

  select array_agg(key order by key) into v_invalid_fields
  from jsonb_object_keys(v_patch) key
  where key <> all (array[
    'address', 'whatsappNumber', 'telegramHandle',
    'countryId', 'country', 'stateId', 'state', 'districtId', 'district',
    'blockId', 'block', 'panchayatId', 'panchayat', 'villageId', 'village',
    'ward', 'postalCode', 'locationReference'
  ]::text[]);
  if coalesce(cardinality(v_invalid_fields), 0) > 0 then
    raise exception using errcode = '22023', message = 'voiceup:unsupported_profile_field';
  end if;

  -- Consent, phone/email identity, verification state, campaign, status,
  -- signature timestamps and participation identifiers are not patchable.
  select account.* into v_account
  from public.voiceup_supporter_accounts account
  where account.id = p_account_id and account.auth_user_id = v_actor;
  if not found then
    raise exception using errcode = '42501', message = 'voiceup:supporter_profile_not_authorized';
  end if;

  select workspace.data into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = v_account.workspace_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'voiceup:supporter_profile_not_authorized';
  end if;

  select count(*), (jsonb_agg(signer) -> 0) into v_signer_count, v_signer
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'id' = v_account.supporter_id
    and signer ->> 'campaignId' = v_account.campaign_id;
  if v_signer_count <> 1 then
    raise exception using errcode = '42501', message = 'voiceup:supporter_profile_not_authorized';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_workspace_data -> 'auditLogs', '[]'::jsonb)) item
    where item ->> 'requestId' = p_request_id::text
      and item ->> 'supporterId' = v_account.supporter_id
      and item ->> 'action' = 'supporter.profile.completed'
  ) then
    return jsonb_build_object('updated', true, 'replayed', true, 'accountId', v_account.id);
  end if;

  v_signer := v_signer || v_patch || jsonb_build_object('profileUpdatedAt', v_now);
  select jsonb_agg(case
    when signer ->> 'id' = v_account.supporter_id
      and signer ->> 'campaignId' = v_account.campaign_id then v_signer
    else signer end order by ordinality)
  into v_signers
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb))
    with ordinality as rows(signer, ordinality);

  v_audit := jsonb_build_object(
    'id', 'audit-' || replace(gen_random_uuid()::text, '-', ''),
    'action', 'supporter.profile.completed',
    'actorId', v_actor,
    'workspaceId', v_account.workspace_id,
    'campaignId', v_account.campaign_id,
    'supporterId', v_account.supporter_id,
    'requestId', p_request_id,
    'changedFields', (select jsonb_agg(key order by key) from jsonb_object_keys(v_patch) key),
    'createdAt', v_now
  );

  update public.voiceup_workspaces
  set data = v_workspace_data || jsonb_build_object(
      'signers', coalesce(v_signers, '[]'::jsonb),
      'auditLogs', (
        select coalesce(jsonb_agg(value order by ordering), '[]'::jsonb)
        from (
          select v_audit as value, 0 as ordering
          union all
          select prior, ordinality::integer
          from jsonb_array_elements(coalesce(v_workspace_data -> 'auditLogs', '[]'::jsonb))
            with ordinality as existing(prior, ordinality)
          limit 500
        ) bounded
      )
    ),
    updated_at = v_now
  where id = v_account.workspace_id;

  return jsonb_build_object(
    'updated', true,
    'replayed', false,
    'accountId', v_account.id,
    'workspaceId', v_account.workspace_id,
    'campaignId', v_account.campaign_id,
    'supporterId', v_account.supporter_id,
    'updatedAt', v_now
  );
end;
$function$;

revoke all on function public.voiceup_update_owned_supporter_profile(uuid, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.voiceup_update_owned_supporter_profile(uuid, jsonb, uuid)
  to authenticated;

comment on function public.voiceup_update_owned_supporter_profile(uuid, jsonb, uuid) is
  'Owner-scoped optional supporter profile completion; never changes identity, consent or participation evidence.';

commit;
