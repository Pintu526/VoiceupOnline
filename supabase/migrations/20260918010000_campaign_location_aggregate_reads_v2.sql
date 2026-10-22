begin;

-- Direct-child campaign policy reads must use every populated ancestry field.
-- Historical imports legitimately store district/panchayat ancestry on deeper
-- block/village rows, so leaf_level is intentionally not part of this query.
create or replace function public.read_campaign_location_hierarchy_v2(
  p_actor_user_id uuid,
  p_workspace_id text,
  p_application_key text,
  p_resource_type text,
  p_resource_id text,
  p_resource_slug text,
  p_parent_path text,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  authorization_code text;
  configuration_version bigint;
  parent_parts text[];
  parent_depth integer;
  child_depth integer;
  child_level text;
  locations jsonb;
  location_count bigint;
begin
  if auth.role() <> 'service_role' then
    return jsonb_build_object('code', 'forbidden');
  end if;

  authorization_code := public.vboss_resource_location_authorization(
    p_actor_user_id,
    p_workspace_id,
    p_application_key,
    p_resource_type,
    p_resource_id,
    p_resource_slug
  );
  if authorization_code <> 'authorized' then
    return jsonb_build_object('code', authorization_code);
  end if;

  parent_parts := string_to_array(coalesce(p_parent_path, ''), '|');
  parent_depth := coalesce(array_length(parent_parts, 1), 0);
  if parent_depth < 1
    or parent_depth > 5
    or p_limit < 1
    or p_limit > 1000
    or exists (select 1 from unnest(parent_parts) part where part = '') then
    return jsonb_build_object('code', 'validation_failed');
  end if;

  child_depth := parent_depth + 1;
  child_level := (array['country', 'state', 'district', 'block', 'panchayat', 'village'])[child_depth];

  select configuration.configuration_version
  into configuration_version
  from public.vboss_resource_location_configurations configuration
  where configuration.workspace_id = p_workspace_id
    and configuration.application_key = p_application_key
    and configuration.resource_type = p_resource_type
    and configuration.resource_id = p_resource_id;

  with distinct_children as (
    select distinct on (split_part(path.normalized_path, '|', child_depth))
      split_part(path.normalized_path, '|', child_depth) as normalized_child,
      path.country,
      path.state,
      path.district,
      path.block,
      path.panchayat,
      path.village
    from public.vboss_resource_location_paths path
    where path.workspace_id = p_workspace_id
      and path.application_key = p_application_key
      and path.resource_type = p_resource_type
      and path.resource_id = p_resource_id
      and path.active
      and left(path.normalized_path, char_length(p_parent_path) + 1) = p_parent_path || '|'
      and array_length(string_to_array(path.normalized_path, '|'), 1) >= child_depth
      and split_part(path.normalized_path, '|', child_depth) <> ''
    order by split_part(path.normalized_path, '|', child_depth), path.normalized_path, path.id
  ), bounded_children as (
    select *
    from distinct_children
    order by normalized_child
    limit p_limit
  )
  select
    coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'country', child.country,
        'state', case when child_depth >= 2 then child.state end,
        'district', case when child_depth >= 3 then child.district end,
        'block', case when child_depth >= 4 then child.block end,
        'panchayat', case when child_depth >= 5 then child.panchayat end,
        'village', case when child_depth >= 6 then child.village end,
        'leafLevel', child_level,
        'verificationStatus', 'unverified_custom'
      )) || jsonb_build_object(
        'canonicalNodeId', null,
        'officialCode', null
      ) order by child.normalized_child
    ), '[]'::jsonb)
  into locations
  from bounded_children child;

  select count(distinct split_part(path.normalized_path, '|', child_depth))
  into location_count
  from public.vboss_resource_location_paths path
  where path.workspace_id = p_workspace_id
    and path.application_key = p_application_key
    and path.resource_type = p_resource_type
    and path.resource_id = p_resource_id
    and path.active
    and left(path.normalized_path, char_length(p_parent_path) + 1) = p_parent_path || '|'
    and array_length(string_to_array(path.normalized_path, '|'), 1) >= child_depth
    and split_part(path.normalized_path, '|', child_depth) <> '';

  return jsonb_build_object(
    'code', 'ok',
    'childLevel', child_level,
    'locations', locations,
    'total', location_count,
    'configurationVersion', coalesce(configuration_version, 0)
  );
end;
$$;

-- active/inactive are configured-row counts. coverage is the count of distinct
-- normalized ancestry paths populated on active rows. distinctValues is label
-- cardinality without ancestry and is deliberately reported separately.
create or replace function public.read_campaign_location_summary_v2(
  p_actor_user_id uuid,
  p_workspace_id text,
  p_application_key text,
  p_resource_type text,
  p_resource_id text,
  p_resource_slug text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  authorization_code text;
  configuration_version bigint;
  active_rows bigint;
  inactive_rows bigint;
  state_paths bigint;
  district_paths bigint;
  block_paths bigint;
  panchayat_paths bigint;
  village_paths bigint;
  pin_values bigint;
  state_values bigint;
  district_values bigint;
  block_values bigint;
  panchayat_values bigint;
  village_values bigint;
begin
  if auth.role() <> 'service_role' then
    return jsonb_build_object('code', 'forbidden');
  end if;

  authorization_code := public.vboss_resource_location_authorization(
    p_actor_user_id,
    p_workspace_id,
    p_application_key,
    p_resource_type,
    p_resource_id,
    p_resource_slug
  );
  if authorization_code <> 'authorized' then
    return jsonb_build_object('code', authorization_code);
  end if;

  select configuration.configuration_version
  into configuration_version
  from public.vboss_resource_location_configurations configuration
  where configuration.workspace_id = p_workspace_id
    and configuration.application_key = p_application_key
    and configuration.resource_type = p_resource_type
    and configuration.resource_id = p_resource_id;

  select
    count(*) filter (where path.active),
    count(*) filter (where not path.active),
    count(distinct array_to_string((string_to_array(path.normalized_path, '|'))[1:2], '|'))
      filter (where path.active and path.state is not null),
    count(distinct array_to_string((string_to_array(path.normalized_path, '|'))[1:3], '|'))
      filter (where path.active and path.district is not null),
    count(distinct array_to_string((string_to_array(path.normalized_path, '|'))[1:4], '|'))
      filter (where path.active and path.block is not null),
    count(distinct array_to_string((string_to_array(path.normalized_path, '|'))[1:5], '|'))
      filter (where path.active and path.panchayat is not null),
    count(distinct array_to_string((string_to_array(path.normalized_path, '|'))[1:6], '|'))
      filter (where path.active and path.village is not null),
    count(distinct lower(regexp_replace(btrim(path.postal_code), '[[:space:]]+', ' ', 'g')))
      filter (where path.active and nullif(btrim(path.postal_code), '') is not null),
    count(distinct split_part(path.normalized_path, '|', 2))
      filter (where path.active and path.state is not null),
    count(distinct split_part(path.normalized_path, '|', 3))
      filter (where path.active and path.district is not null),
    count(distinct split_part(path.normalized_path, '|', 4))
      filter (where path.active and path.block is not null),
    count(distinct split_part(path.normalized_path, '|', 5))
      filter (where path.active and path.panchayat is not null),
    count(distinct split_part(path.normalized_path, '|', 6))
      filter (where path.active and path.village is not null)
  into
    active_rows,
    inactive_rows,
    state_paths,
    district_paths,
    block_paths,
    panchayat_paths,
    village_paths,
    pin_values,
    state_values,
    district_values,
    block_values,
    panchayat_values,
    village_values
  from public.vboss_resource_location_paths path
  where path.workspace_id = p_workspace_id
    and path.application_key = p_application_key
    and path.resource_type = p_resource_type
    and path.resource_id = p_resource_id;

  return jsonb_build_object(
    'code', 'ok',
    'summary', jsonb_build_object(
      'active', active_rows,
      'inactive', inactive_rows,
      'configuredRows', jsonb_build_object('active', active_rows, 'inactive', inactive_rows),
      'levelsRepresented',
        (case when state_paths > 0 then 1 else 0 end)
        + (case when district_paths > 0 then 1 else 0 end)
        + (case when block_paths > 0 then 1 else 0 end)
        + (case when panchayat_paths > 0 then 1 else 0 end)
        + (case when village_paths > 0 then 1 else 0 end),
      'coverage', jsonb_build_object(
        'states', state_paths,
        'districts', district_paths,
        'blocks', block_paths,
        'panchayats', panchayat_paths,
        'villages', village_paths,
        'pins', pin_values
      ),
      'distinctValues', jsonb_build_object(
        'states', state_values,
        'districts', district_values,
        'blocks', block_values,
        'panchayats', panchayat_values,
        'villages', village_values,
        'pins', pin_values
      ),
      'coverageSemantics', 'distinct_normalized_ancestry_paths'
    ),
    'configurationVersion', coalesce(configuration_version, 0)
  );
end;
$$;

-- Published campaign signing uses the same bounded direct-child aggregation
-- without exposing authenticated campaign administration reads. Exact public
-- campaign scope is revalidated against the published campaign index.
create or replace function public.read_public_campaign_location_hierarchy_v2(
  p_workspace_id text,
  p_application_key text,
  p_resource_type text,
  p_resource_id text,
  p_resource_slug text,
  p_parent_path text,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  published_match_count integer;
  configuration_version bigint;
  parent_parts text[];
  parent_depth integer;
  child_depth integer;
  child_level text;
  locations jsonb;
  location_count bigint;
begin
  if auth.role() <> 'service_role' then
    return jsonb_build_object('code', 'forbidden');
  end if;
  if p_application_key <> 'voiceup' or p_resource_type <> 'campaign' then
    return jsonb_build_object('code', 'campaign_not_found');
  end if;

  select count(*)
  into published_match_count
  from public.voiceup_public_campaign_index campaign_index
  where campaign_index.workspace_id = p_workspace_id
    and campaign_index.campaign_id = p_resource_id
    and campaign_index.status = 'Published'
    and lower(regexp_replace(btrim(campaign_index.slug), '[[:space:]]+', ' ', 'g'))
      = lower(regexp_replace(btrim(p_resource_slug), '[[:space:]]+', ' ', 'g'));
  if published_match_count <> 1 then
    return jsonb_build_object('code', 'campaign_not_found');
  end if;

  parent_parts := string_to_array(coalesce(p_parent_path, ''), '|');
  parent_depth := coalesce(array_length(parent_parts, 1), 0);
  if parent_depth < 1
    or parent_depth > 5
    or p_limit < 1
    or p_limit > 1000
    or exists (select 1 from unnest(parent_parts) part where part = '') then
    return jsonb_build_object('code', 'validation_failed');
  end if;

  child_depth := parent_depth + 1;
  child_level := (array['country', 'state', 'district', 'block', 'panchayat', 'village'])[child_depth];

  select configuration.configuration_version
  into configuration_version
  from public.vboss_resource_location_configurations configuration
  where configuration.workspace_id = p_workspace_id
    and configuration.application_key = p_application_key
    and configuration.resource_type = p_resource_type
    and configuration.resource_id = p_resource_id;

  with distinct_children as (
    select distinct on (split_part(path.normalized_path, '|', child_depth))
      split_part(path.normalized_path, '|', child_depth) as normalized_child,
      path.country,
      path.state,
      path.district,
      path.block,
      path.panchayat,
      path.village
    from public.vboss_resource_location_paths path
    where path.workspace_id = p_workspace_id
      and path.application_key = p_application_key
      and path.resource_type = p_resource_type
      and path.resource_id = p_resource_id
      and path.active
      and left(path.normalized_path, char_length(p_parent_path) + 1) = p_parent_path || '|'
      and array_length(string_to_array(path.normalized_path, '|'), 1) >= child_depth
      and split_part(path.normalized_path, '|', child_depth) <> ''
    order by split_part(path.normalized_path, '|', child_depth), path.normalized_path, path.id
  ), bounded_children as (
    select *
    from distinct_children
    order by normalized_child
    limit p_limit
  )
  select
    coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'country', child.country,
        'state', case when child_depth >= 2 then child.state end,
        'district', case when child_depth >= 3 then child.district end,
        'block', case when child_depth >= 4 then child.block end,
        'panchayat', case when child_depth >= 5 then child.panchayat end,
        'village', case when child_depth >= 6 then child.village end,
        'leafLevel', child_level,
        'verificationStatus', 'unverified_custom'
      )) || jsonb_build_object('canonicalNodeId', null, 'officialCode', null)
      order by child.normalized_child
    ), '[]'::jsonb)
  into locations
  from bounded_children child;

  select count(distinct split_part(path.normalized_path, '|', child_depth))
  into location_count
  from public.vboss_resource_location_paths path
  where path.workspace_id = p_workspace_id
    and path.application_key = p_application_key
    and path.resource_type = p_resource_type
    and path.resource_id = p_resource_id
    and path.active
    and left(path.normalized_path, char_length(p_parent_path) + 1) = p_parent_path || '|'
    and array_length(string_to_array(path.normalized_path, '|'), 1) >= child_depth
    and split_part(path.normalized_path, '|', child_depth) <> '';

  return jsonb_build_object(
    'code', 'ok',
    'childLevel', child_level,
    'locations', locations,
    'total', location_count,
    'configurationVersion', coalesce(configuration_version, 0)
  );
end;
$$;

comment on function public.read_campaign_location_hierarchy_v2(uuid, text, text, text, text, text, text, integer)
  is 'Authorized bounded direct-child campaign policy aggregation from populated normalized ancestry paths; never assigns canonical identity.';
comment on function public.read_campaign_location_summary_v2(uuid, text, text, text, text, text)
  is 'Authorized campaign configured-row totals plus distinct normalized active ancestry-path coverage; does not count terminal leaf classifications.';
comment on function public.read_public_campaign_location_hierarchy_v2(text, text, text, text, text, text, integer)
  is 'Published-campaign-only bounded direct-child policy aggregation; returns unverified custom labels and never canonical identity.';

revoke all on function public.read_campaign_location_hierarchy_v2(uuid, text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.read_campaign_location_summary_v2(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.read_public_campaign_location_hierarchy_v2(text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.read_campaign_location_hierarchy_v2(uuid, text, text, text, text, text, text, integer) to service_role;
grant execute on function public.read_campaign_location_summary_v2(uuid, text, text, text, text, text) to service_role;
grant execute on function public.read_public_campaign_location_hierarchy_v2(text, text, text, text, text, text, integer) to service_role;

commit;
