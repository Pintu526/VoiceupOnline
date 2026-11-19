-- Development only: apply in Development Supabase SQL Editor after code review.
create or replace function public.voiceup_create_supporter_routing_precheck(
  p_workspace_id text,
  p_campaign_id text,
  p_phone text,
  p_client_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_now timestamptz := now();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone_hash text;
  v_workspace_data jsonb;
  v_match_count integer := 0;
  v_supporter_id text;
  v_internal_route text;
  v_token text;
  v_token_hash text;
  v_precheck_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if v_phone ~ '^0[6-9][0-9]{9}$' then v_phone := substr(v_phone, 2); end if;
  if v_phone ~ '^91[6-9][0-9]{9}$' then v_phone := substr(v_phone, 3); end if;
  if v_phone !~ '^[0-9]{8,15}$'
    or coalesce(p_client_hash, '') !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_routing_precheck';
  end if;

  select workspace.data into v_workspace_data
  from public.voiceup_workspaces workspace
  where workspace.id = p_workspace_id;
  if not found then
    raise exception using errcode = '22023', message = 'voiceup:invalid_routing_precheck';
  end if;

  v_phone_hash := encode(digest(v_phone, 'sha256'), 'hex');
  if (select count(*) from public.voiceup_supporter_routing_prechecks item
      where item.client_hash = p_client_hash and item.created_at > v_now - interval '10 minutes') >= 20
    or (select count(*) from public.voiceup_supporter_routing_prechecks item
      where item.phone_hash = v_phone_hash and item.created_at > v_now - interval '10 minutes') >= 5
  then
    raise exception using errcode = 'P0001', message = 'voiceup:routing_rate_limited';
  end if;

  select count(*)::integer, min(signer ->> 'id')
    into v_match_count, v_supporter_id
  from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
  where signer ->> 'campaignId' = p_campaign_id
    and encode(digest(
      case
        when regexp_replace(coalesce(signer ->> 'phone', ''), '[^0-9]', '', 'g') ~ '^0[6-9][0-9]{9}$'
          then substr(regexp_replace(signer ->> 'phone', '[^0-9]', '', 'g'), 2)
        when regexp_replace(coalesce(signer ->> 'phone', ''), '[^0-9]', '', 'g') ~ '^91[6-9][0-9]{9}$'
          then substr(regexp_replace(signer ->> 'phone', '[^0-9]', '', 'g'), 3)
        else regexp_replace(coalesce(signer ->> 'phone', ''), '[^0-9]', '', 'g')
      end,
      'sha256'
    ), 'hex') = v_phone_hash;

  if v_match_count = 0 then
    v_internal_route := 'new_number';
    v_supporter_id := null;
  elsif v_match_count > 1 then
    v_internal_route := 'ambiguous';
    v_supporter_id := null;
  elsif exists (
    select 1 from public.voiceup_supporter_accounts account
    where account.workspace_id = p_workspace_id
      and account.campaign_id = p_campaign_id
      and account.supporter_id = v_supporter_id
  ) then
    v_internal_route := 'existing_account';
  else
    v_internal_route := 'historical_signature';
  end if;

  v_token := 'vusr_' || encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  insert into public.voiceup_supporter_routing_prechecks (
    workspace_id, campaign_id, token_hash, phone_hash, client_hash,
    matched_supporter_id, matched_count, internal_route, expires_at
  ) values (
    p_workspace_id, p_campaign_id, v_token_hash, v_phone_hash, p_client_hash,
    v_supporter_id, v_match_count, v_internal_route, v_now + interval '15 minutes'
  ) returning id into v_precheck_id;

  insert into public.voiceup_supporter_routing_audit (
    workspace_id, campaign_id, precheck_id, event_type, outcome
  ) values (p_workspace_id, p_campaign_id, v_precheck_id, 'precheck_created', 'neutral_response');

  -- Deliberately identical for every internal route.
  return jsonb_build_object(
    'ok', true,
    'routingToken', v_token,
    'expiresAt', v_now + interval '15 minutes'
  );
end;
$function$;
