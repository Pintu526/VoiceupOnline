begin;

create or replace function public.read_resource_locations(
  p_actor_user_id uuid,
  p_workspace_id text,
  p_application_key text,
  p_resource_type text,
  p_resource_id text,
  p_resource_slug text,
  p_active boolean default true,
  p_parent_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  authorization_code text;
  resolved_configuration_version bigint;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code', 'forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(
    p_actor_user_id, p_workspace_id, p_application_key, p_resource_type, p_resource_id, p_resource_slug
  );
  if authorization_code <> 'authorized' then return jsonb_build_object('code', authorization_code); end if;
  select configuration_row.configuration_version into resolved_configuration_version
  from public.vboss_resource_location_configurations configuration_row
  where configuration_row.workspace_id = p_workspace_id
    and configuration_row.application_key = p_application_key
    and configuration_row.resource_type = p_resource_type
    and configuration_row.resource_id = p_resource_id;
  return jsonb_build_object(
    'code', 'ok',
    'configurationVersion', coalesce(resolved_configuration_version, 0),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', path.id, 'country', path.country, 'state', path.state, 'district', path.district,
        'block', path.block, 'panchayat', path.panchayat, 'village', path.village,
        'postalCode', path.postal_code, 'leafLevel', path.leaf_level, 'source', path.source,
        'active', path.active, 'version', path.version, 'createdAt', path.created_at, 'updatedAt', path.updated_at
      ) order by path.normalized_path)
      from public.vboss_resource_location_paths path
      where path.workspace_id = p_workspace_id and path.application_key = p_application_key
        and path.resource_type = p_resource_type and path.resource_id = p_resource_id
        and (p_active is null or path.active = p_active)
        and (p_parent_path is null or path.normalized_path like p_parent_path || '|%')
    ), '[]'::jsonb)
  );
end;
$$;

commit;
