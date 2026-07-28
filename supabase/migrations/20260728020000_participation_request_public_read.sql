begin;

-- Public supporters may read only their own movement-request status through
-- the service-role Edge boundary. No table privilege or browser-supplied
-- supporter identifier participates in this lookup.
create or replace function public.voiceup_read_own_participation_requests(
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
stable
as $$
declare
  v_workspace_data jsonb;
  v_campaign jsonb;
  v_signer jsonb;
  v_now timestamptz := clock_timestamp();
  v_phone text;
  v_requests jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;

  v_phone := public.voiceup_normalize_public_phone(p_phone);
  if v_phone is null then
    raise exception using errcode = '22023', message = 'voiceup:invalid_phone';
  end if;
  if length(coalesce(p_verification_token, '')) < 24 then
    raise exception using errcode = '28000', message = 'voiceup:otp_verification_required';
  end if;

  select workspace.data
    into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id;
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
    raise exception using errcode = '22023', message = 'voiceup:supporter_not_found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id', request_row.id,
        'requestType', request_row.request_type,
        'requestedRole', request_row.requested_role,
        'campaign', jsonb_build_object(
          'id', p_campaign_id,
          'slug', p_campaign_slug,
          'title', coalesce(v_campaign ->> 'title', '')
        ),
        'status', request_row.status,
        'preferredLevel', request_row.preferred_level,
        'minimumAcceptableLevel', request_row.minimum_acceptable_level,
        'geographicScope', jsonb_strip_nulls(jsonb_build_object(
          'country', request_row.geographic_scope ->> 'country',
          'state', request_row.geographic_scope ->> 'state',
          'district', request_row.geographic_scope ->> 'district',
          'block', request_row.geographic_scope ->> 'block',
          'panchayat', request_row.geographic_scope ->> 'panchayat',
          'ward', request_row.geographic_scope ->> 'ward'
        )),
        'currentStage', case
          when request_row.status = 'assigned' then 'assigned'
          when request_row.status = 'approved' then 'approved'
          when request_row.status = 'rejected' then 'rejected'
          when request_row.status = 'withdrawn' then 'withdrawn'
          when request_row.status = 'escalated'
            or request_row.escalation_state = 'required' then 'escalated'
          when coalesce(request_row.routing_metadata ->> 'resolution', '') = 'candidate_resolved'
            then 'pending_review'
          else 'awaiting_assignment'
        end,
        'submittedAt', request_row.submitted_at,
        'updatedAt', request_row.updated_at
      ))
      order by request_row.submitted_at desc, request_row.id desc
    ),
    '[]'::jsonb
  )
    into v_requests
  from public.voiceup_participation_requests request_row
  where request_row.workspace_id = p_workspace_id
    and request_row.application_key = 'voiceup'
    and request_row.resource_type = 'campaign'
    and request_row.resource_id = p_campaign_id
    and request_row.requester_supporter_id = v_signer ->> 'id';

  return jsonb_build_object(
    'ok', true,
    'action', 'read_participation_requests',
    'requests', v_requests
  );
end;
$$;

do $participation_request_read_pgcrypto_search_path$
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
    raise exception 'Participation request read pgcrypto prerequisite failed.';
  end if;

  execute format(
    'alter function public.voiceup_read_own_participation_requests(text,text,text,text,text) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
end
$participation_request_read_pgcrypto_search_path$;

revoke all on function public.voiceup_read_own_participation_requests(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.voiceup_read_own_participation_requests(
  text, text, text, text, text
) to service_role;

comment on function public.voiceup_read_own_participation_requests(
  text, text, text, text, text
) is
  'Returns a public-safe status projection of only the OTP-verified supporter own requests for one published campaign.';

notify pgrst, 'reload schema';

commit;
