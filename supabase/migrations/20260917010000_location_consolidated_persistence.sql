begin;

-- One private preparation function is shared by the additive persistence
-- boundaries below. Canonical claims are rebuilt from the active Location
-- Platform dataset; unverified values can never carry canonical identity.
create function public.voiceup_prepare_location_reference_v1(
  candidate jsonb,
  allow_observation boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
begin
  if candidate is null or candidate = 'null'::jsonb then return null; end if;
  if not public.voiceup_is_persisted_location_reference_v1_shape(candidate) then
    raise exception using errcode = '22023', message = 'INVALID_PERSISTED_LOCATION_REFERENCE';
  end if;
  if candidate ->> 'verificationState' = 'canonical_verified' then
    return public.voiceup_validate_persisted_location_reference_v1(candidate);
  end if;
  if candidate ->> 'verificationState' = 'unverified_observation' and not allow_observation then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_LOCATION_OBSERVATION';
  end if;
  if candidate -> 'canonicalNodeId' <> 'null'::jsonb
    or candidate -> 'officialCode' <> 'null'::jsonb
    or candidate ?| array['authority', 'sourceDataset', 'datasetVersion']
  then
    raise exception using errcode = '22023', message = 'UNVERIFIED_CANONICAL_IDENTITY_FORBIDDEN';
  end if;
  return candidate;
end;
$function$;

revoke all on function public.voiceup_prepare_location_reference_v1(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.voiceup_prepare_location_reference_v1(jsonb, boolean) to service_role;

create function public.voiceup_project_location_reference_labels_v1(reference jsonb)
returns jsonb
language plpgsql
immutable
strict
security definer
set search_path = pg_catalog
as $function$
declare
  node jsonb;
  labels jsonb := jsonb_build_object(
    'country', '', 'state', '', 'district', '', 'block', '', 'panchayat', ''
  );
begin
  if reference ->> 'verificationState' <> 'canonical_verified' then return labels; end if;
  for node in
    select value from jsonb_array_elements(
      coalesce(reference -> 'lineageSnapshot', '[]'::jsonb) || jsonb_build_array(reference)
    )
  loop
    if node ->> 'level' = 'country' then labels := jsonb_set(labels, '{country}', node -> 'labelSnapshot'); end if;
    if node ->> 'level' = 'state' then labels := jsonb_set(labels, '{state}', node -> 'labelSnapshot'); end if;
    if node ->> 'level' = 'district' then labels := jsonb_set(labels, '{district}', node -> 'labelSnapshot'); end if;
    if node ->> 'level' = 'block'
      or node ->> 'entityKind' in (
        'municipality', 'municipal_corporation', 'nagar_panchayat',
        'notified_area_council', 'town_panchayat', 'other_local_body'
      )
    then labels := jsonb_set(labels, '{block}', node -> 'labelSnapshot'); end if;
    if node ->> 'entityKind' = 'gram_panchayat' or node ->> 'level' = 'ward' then
      labels := jsonb_set(labels, '{panchayat}', node -> 'labelSnapshot');
    end if;
  end loop;
  return labels;
end;
$function$;

revoke all on function public.voiceup_project_location_reference_labels_v1(jsonb) from public, anon, authenticated;
grant execute on function public.voiceup_project_location_reference_labels_v1(jsonb) to service_role;

-- Public signing remains behind the published campaign + OTP + idempotency
-- boundary in mutate_voiceup_public_participation. This wrapper adds location
-- persistence in the same transaction and never trusts the browser snapshot.
create function public.mutate_voiceup_public_participation_with_location(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text,
  p_action text,
  p_phone text,
  p_verification_token text,
  p_idempotency_key text,
  p_payload jsonb,
  p_server_metadata jsonb,
  p_has_location_reference boolean,
  p_location_reference jsonb,
  p_has_requested_location_reference boolean,
  p_requested_location_reference jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  sanitized_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  trusted_location jsonb;
  trusted_requested_location jsonb;
  mutation_result jsonb;
  supporter_id text;
  workspace_data jsonb;
  updated_signers jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'voiceup:service_role_required';
  end if;
  if p_has_location_reference then
    trusted_location := public.voiceup_prepare_location_reference_v1(p_location_reference, true);
    sanitized_payload := sanitized_payload #- '{profile,locationReference}';
    if trusted_location ->> 'verificationState' = 'canonical_verified' then
      sanitized_payload := jsonb_set(
        sanitized_payload,
        '{profile}',
        coalesce(sanitized_payload -> 'profile', '{}'::jsonb)
          || public.voiceup_project_location_reference_labels_v1(trusted_location),
        true
      );
    end if;
  end if;
  if p_has_requested_location_reference then
    trusted_requested_location := public.voiceup_prepare_location_reference_v1(
      p_requested_location_reference, true
    );
    sanitized_payload := sanitized_payload #- '{application,requestedLocationReference}';
    if trusted_requested_location ->> 'verificationState' = 'canonical_verified' then
      sanitized_payload := jsonb_set(
        sanitized_payload,
        '{application,requestedGeography}',
        coalesce(sanitized_payload #> '{application,requestedGeography}', '{}'::jsonb)
          || public.voiceup_project_location_reference_labels_v1(trusted_requested_location),
        true
      );
    end if;
  end if;

  mutation_result := public.mutate_voiceup_public_participation(
    p_workspace_id,
    p_campaign_id,
    p_campaign_slug,
    p_action,
    p_phone,
    p_verification_token,
    p_idempotency_key,
    sanitized_payload,
    p_server_metadata
  );
  supporter_id := mutation_result #>> '{signer,id}';
  if supporter_id is null or (not p_has_location_reference and not p_has_requested_location_reference) then
    return mutation_result;
  end if;

  select data into workspace_data
  from public.voiceup_workspaces
  where id = p_workspace_id
  for update;

  select coalesce(jsonb_agg(
    case when signer ->> 'id' = supporter_id then
      signer
      || case when p_has_location_reference
        then jsonb_build_object('locationReference', trusted_location)
        else '{}'::jsonb end
      || case when p_has_requested_location_reference then jsonb_build_object(
        'coordinatorApplication',
        coalesce(signer -> 'coordinatorApplication', '{}'::jsonb)
          || jsonb_build_object('requestedLocationReference', trusted_requested_location)
      ) else '{}'::jsonb end
    else signer end
  ), '[]'::jsonb)
  into updated_signers
  from jsonb_array_elements(coalesce(workspace_data -> 'signers', '[]'::jsonb)) signer;

  update public.voiceup_workspaces
  set data = jsonb_set(workspace_data, '{signers}', updated_signers, true),
      updated_at = clock_timestamp()
  where id = p_workspace_id;

  if p_has_location_reference then
    mutation_result := jsonb_set(
      mutation_result,
      '{signer}',
      coalesce(mutation_result -> 'signer', '{}'::jsonb)
        || jsonb_build_object('locationReference', trusted_location),
      true
    );
    mutation_result := jsonb_set(
      mutation_result,
      '{profile}',
      coalesce(mutation_result -> 'profile', '{}'::jsonb)
        || jsonb_build_object('locationReference', trusted_location),
      true
    );
  end if;
  if p_has_requested_location_reference then
    mutation_result := jsonb_set(
      mutation_result,
      '{signer,coordinatorApplication}',
      coalesce(mutation_result #> '{signer,coordinatorApplication}', '{}'::jsonb)
        || jsonb_build_object('requestedLocationReference', trusted_requested_location),
      true
    );
  end if;
  return mutation_result;
end;
$function$;

revoke all on function public.mutate_voiceup_public_participation_with_location(
  text, text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.mutate_voiceup_public_participation_with_location(
  text, text, text, text, text, text, text, jsonb, jsonb, boolean, jsonb, boolean, jsonb
) to service_role;

-- Participation/coordinator request scopes are still authorized and persisted
-- by the existing request RPC. This trigger only validates the additive field.
create function public.voiceup_validate_participation_location_reference_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
begin
  if new.geographic_scope ? 'locationReference' then
    new.geographic_scope := jsonb_set(
      new.geographic_scope,
      '{locationReference}',
      coalesce(public.voiceup_prepare_location_reference_v1(
        new.geographic_scope -> 'locationReference', true
      ), 'null'::jsonb),
      true
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.voiceup_validate_participation_location_reference_v1()
  from public, anon, authenticated;

create trigger voiceup_participation_location_reference_v1
before insert or update of geographic_scope on public.voiceup_participation_requests
for each row execute function public.voiceup_validate_participation_location_reference_v1();

create function public.voiceup_submit_participation_request_with_location(
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
    and campaign_id = p_campaign_id;
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

-- OCR/PIN/GPS evidence remains an unverified observation. If a reviewer sends
-- a canonical claim, it must pass the same trusted validator before approval.
create function public.voiceup_validate_scan_location_reference_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
begin
  if new.supporter_payload ? 'locationReference' then
    new.supporter_payload := jsonb_set(
      new.supporter_payload,
      '{locationReference}',
      coalesce(public.voiceup_prepare_location_reference_v1(
        new.supporter_payload -> 'locationReference', true
      ), 'null'::jsonb),
      true
    );
  end if;
  if new.raw_fields ? 'locationReference' then
    new.raw_fields := jsonb_set(
      new.raw_fields,
      '{locationReference}',
      coalesce(public.voiceup_prepare_location_reference_v1(
        new.raw_fields -> 'locationReference', true
      ), 'null'::jsonb),
      true
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.voiceup_validate_scan_location_reference_v1()
  from public, anon, authenticated;

create trigger voiceup_scan_location_reference_v1
before insert or update of supporter_payload, raw_fields on public.voiceup_scan_supporters
for each row execute function public.voiceup_validate_scan_location_reference_v1();

-- Coordinator geography identity is additive to the existing normalized tree.
alter table public.voiceup_coordinator_geographies
  add column location_reference jsonb;

create function public.upsert_voiceup_coordinator_with_location(
  p_workspace_id text,
  p_coordinator jsonb,
  p_geography jsonb,
  p_campaign_ids text[] default array[]::text[],
  p_verification_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  result jsonb;
  coordinator_id uuid;
  geography_id uuid;
  trusted_reference jsonb;
begin
  if p_geography ? 'locationReference' then
    trusted_reference := public.voiceup_prepare_location_reference_v1(
      p_geography -> 'locationReference', true
    );
    if trusted_reference ->> 'verificationState' = 'canonical_verified' then
      p_geography := p_geography
        || public.voiceup_project_location_reference_labels_v1(trusted_reference);
    end if;
  end if;
  result := public.upsert_voiceup_coordinator(
    p_workspace_id,
    p_coordinator,
    p_geography - 'locationReference',
    p_campaign_ids,
    p_verification_token
  );
  coordinator_id := (result ->> 'id')::uuid;
  select coordinator.geography_id into geography_id
  from public.voiceup_coordinators coordinator
  where coordinator.id = coordinator_id
    and coordinator.workspace_id = p_workspace_id
    and coordinator.deleted_at is null;
  if p_geography ? 'locationReference' then
    update public.voiceup_coordinator_geographies
    set location_reference = trusted_reference,
        updated_at = clock_timestamp()
    where id = geography_id and workspace_id = p_workspace_id;
  end if;
  return result;
end;
$function$;

revoke all on function public.upsert_voiceup_coordinator_with_location(text, jsonb, jsonb, text[], text)
  from public, anon;
grant execute on function public.upsert_voiceup_coordinator_with_location(text, jsonb, jsonb, text[], text)
  to authenticated;

create function public.get_voiceup_coordinator_network_with_location(p_workspace_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  result jsonb;
  prepared_geographies jsonb;
begin
  result := public.get_voiceup_coordinator_network(p_workspace_id);
  select coalesce(jsonb_agg(
    geography_payload
      || case when geography.location_reference is not null
        then jsonb_build_object('locationReference', geography.location_reference)
        else '{}'::jsonb end
    order by geography.path
  ), '[]'::jsonb)
  into prepared_geographies
  from jsonb_array_elements(coalesce(result -> 'geographies', '[]'::jsonb)) geography_payload
  join public.voiceup_coordinator_geographies geography
    on geography.id = (geography_payload ->> 'id')::uuid
   and geography.workspace_id = p_workspace_id;
  return jsonb_set(result, '{geographies}', prepared_geographies, true);
end;
$function$;

revoke all on function public.get_voiceup_coordinator_network_with_location(text) from public, anon;
grant execute on function public.get_voiceup_coordinator_network_with_location(text) to authenticated;

-- Resource Location Manager rows are governed custom locations. Existing rows
-- remain null/legacy; no label-based canonical identity is invented.
alter table public.vboss_resource_location_paths
  add column location_reference jsonb;

create function public.vboss_prepare_resource_location_reference_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  selected_label text;
  context jsonb;
begin
  if new.location_reference is not null then
    new.location_reference := public.voiceup_prepare_location_reference_v1(
      new.location_reference, false
    );
    return new;
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  selected_label := case new.leaf_level
    when 'country' then new.country
    when 'state' then new.state
    when 'district' then new.district
    when 'block' then new.block
    when 'panchayat' then new.panchayat
    when 'village' then new.village
  end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'labelSnapshot', label_value,
    'level', level_value
  ) order by ordinal), '[]'::jsonb)
  into context
  from (values
    (1, 'country', new.country),
    (2, 'state', new.state),
    (3, 'district', new.district),
    (4, 'block', new.block),
    (5, 'panchayat', new.panchayat)
  ) levels(ordinal, level_value, label_value)
  where label_value is not null
    and ordinal < case new.leaf_level
      when 'country' then 1 when 'state' then 2 when 'district' then 3
      when 'block' then 4 when 'panchayat' then 5 else 6 end;
  new.location_reference := jsonb_build_object(
    'schemaVersion', 'voiceup.location-reference/v1',
    'verificationState', 'unverified_custom',
    'canonicalNodeId', null,
    'officialCode', null,
    'labelSnapshot', selected_label,
    'level', new.leaf_level,
    'parentContext', context,
    'provenance', jsonb_build_object(
      'source', new.source,
      'recordedAt', to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
  return new;
end;
$function$;

revoke all on function public.vboss_prepare_resource_location_reference_v1()
  from public, anon, authenticated;

create trigger vboss_resource_location_reference_v1
before insert or update of location_reference on public.vboss_resource_location_paths
for each row execute function public.vboss_prepare_resource_location_reference_v1();

commit;
