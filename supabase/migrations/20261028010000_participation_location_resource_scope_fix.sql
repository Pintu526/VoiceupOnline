begin;

-- Repair the campaign scope used when attaching a validated location reference
-- to the normalized participation request returned by the existing RPC.
-- voiceup_participation_requests identifies campaigns through the generic
-- (resource_type, resource_id) contract; it has no campaign_id column.
create or replace function public.voiceup_submit_participation_request_with_location(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text,
  p_phone text,
  p_verification_token text,
  p_idempotency_key text,
  p_request jsonb,
  p_server_metadata jsonb,
  p_has_location_reference boolean,
  p_location_reference jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  sanitized_request jsonb := coalesce(p_request, '{}'::jsonb);
  trusted_reference jsonb;
  result jsonb;
  request_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if p_has_location_reference then
    trusted_reference := public.voiceup_prepare_location_reference_v1(
      p_location_reference, true
    );
    sanitized_request := sanitized_request #- '{geographicScope,locationReference}';
    if trusted_reference ->> 'verificationState' = 'canonical_verified' then
      sanitized_request := jsonb_set(
        sanitized_request,
        '{geographicScope}',
        coalesce(sanitized_request -> 'geographicScope', '{}'::jsonb)
          || public.voiceup_project_location_reference_labels_v1(trusted_reference),
        true
      );
    end if;
  end if;
  result := public.voiceup_submit_participation_request(
    p_workspace_id,
    p_campaign_id,
    p_campaign_slug,
    p_phone,
    p_verification_token,
    p_idempotency_key,
    sanitized_request,
    p_server_metadata
  );
  if not p_has_location_reference then return result; end if;
  request_id := (result #>> '{request,id}')::uuid;
  if request_id is null then return result; end if;
  update public.voiceup_participation_requests
  set geographic_scope = jsonb_set(
        geographic_scope,
        '{locationReference}',
        coalesce(trusted_reference, 'null'::jsonb),
        true
      ),
      updated_at = clock_timestamp()
  where id = request_id
    and workspace_id = p_workspace_id
    and resource_type = 'campaign'
    and resource_id = p_campaign_id;
  result := jsonb_set(
    result,
    '{request,geographicScope}',
    coalesce(result #> '{request,geographicScope}', '{}'::jsonb)
      || jsonb_build_object('locationReference', trusted_reference),
    true
  );
  return result;
end;
$function$;

revoke all on function public.voiceup_submit_participation_request_with_location(
  text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.voiceup_submit_participation_request_with_location(
  text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb
) to service_role;

comment on function public.voiceup_submit_participation_request_with_location(
  text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb
) is
  'Submits an OTP-verified participation request and persists a validated location reference within its campaign resource scope.';

notify pgrst, 'reload schema';

commit;
