begin;

create table public.vboss_resource_location_configurations (
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  application_key text not null check (application_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  resource_type text not null check (resource_type ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  resource_id text not null check (char_length(resource_id) between 1 and 120),
  resource_slug text not null check (char_length(resource_slug) between 1 and 120),
  configuration_version bigint not null default 0 check (configuration_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, application_key, resource_type, resource_id)
);

create table public.vboss_resource_location_paths (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  application_key text not null,
  resource_type text not null,
  resource_id text not null,
  resource_slug text not null check (char_length(resource_slug) between 1 and 120),
  country text not null check (char_length(country) between 1 and 120),
  state text check (state is null or char_length(state) between 1 and 120),
  district text check (district is null or char_length(district) between 1 and 120),
  block text check (block is null or char_length(block) between 1 and 120),
  panchayat text check (panchayat is null or char_length(panchayat) between 1 and 120),
  village text check (village is null or char_length(village) between 1 and 120),
  postal_code text check (postal_code is null or postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$'),
  normalized_path text not null check (char_length(normalized_path) between 1 and 720),
  leaf_level text not null check (leaf_level in ('country', 'state', 'district', 'block', 'panchayat', 'village')),
  source text not null check (source in ('campaign_manual', 'campaign_import')),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_by uuid references auth.users(id),
  deactivated_at timestamptz,
  foreign key (workspace_id, application_key, resource_type, resource_id)
    references public.vboss_resource_location_configurations (workspace_id, application_key, resource_type, resource_id)
    on delete cascade,
  check (
    (state is not null or district is null)
    and (district is not null or block is null)
    and (block is not null or panchayat is null)
    and (panchayat is not null or village is null)
  ),
  check (
    (leaf_level = 'country' and state is null)
    or (leaf_level = 'state' and state is not null and district is null)
    or (leaf_level = 'district' and district is not null and block is null)
    or (leaf_level = 'block' and block is not null and panchayat is null)
    or (leaf_level = 'panchayat' and panchayat is not null and village is null)
    or (leaf_level = 'village' and village is not null)
  ),
  check (
    (active and deactivated_by is null and deactivated_at is null)
    or (not active and deactivated_by is not null and deactivated_at is not null)
  ),
  unique (workspace_id, application_key, resource_type, resource_id, normalized_path)
);

create table public.vboss_resource_location_audit (
  id bigint generated always as identity primary key,
  workspace_id text not null,
  application_key text not null,
  resource_type text not null,
  resource_id text not null,
  location_path_id uuid not null references public.vboss_resource_location_paths(id),
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in ('created', 'reactivated', 'deactivated')),
  result_code text not null check (result_code in ('created', 'reactivated', 'deactivated')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048),
  created_at timestamptz not null default now()
);

create index vboss_resource_location_paths_scope_active_idx
  on public.vboss_resource_location_paths (workspace_id, application_key, resource_type, resource_id, active, normalized_path);
create index vboss_resource_location_audit_scope_idx
  on public.vboss_resource_location_audit (workspace_id, application_key, resource_type, resource_id, id desc);

alter table public.vboss_resource_location_configurations enable row level security;
alter table public.vboss_resource_location_paths enable row level security;
alter table public.vboss_resource_location_audit enable row level security;
revoke all on public.vboss_resource_location_configurations, public.vboss_resource_location_paths, public.vboss_resource_location_audit from public, anon, authenticated;

create or replace function public.vboss_resource_location_authorization(
  p_actor_user_id uuid,
  p_workspace_id text,
  p_application_key text,
  p_resource_type text,
  p_resource_id text,
  p_resource_slug text
)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  campaign jsonb;
  assignment_count integer;
begin
  select candidate into campaign
  from public.voiceup_workspaces workspace
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(workspace.data -> 'campaigns') = 'array'
      then workspace.data -> 'campaigns' else '[]'::jsonb end
  ) candidate
  where workspace.id = p_workspace_id
    and p_application_key = 'voiceup'
    and p_resource_type = 'campaign'
    and candidate ->> 'id' = p_resource_id
    and lower(regexp_replace(btrim(candidate ->> 'slug'), '[[:space:]]+', ' ', 'g'))
      = lower(regexp_replace(btrim(p_resource_slug), '[[:space:]]+', ' ', 'g'))
  limit 1;

  if campaign is null then
    return 'campaign_not_found';
  end if;
  if coalesce(campaign ->> 'archivedAt', '') <> '' or lower(coalesce(campaign ->> 'status', '')) = 'closed' then
    return 'campaign_archived';
  end if;

  if exists (
    select 1 from public.voiceup_workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_actor_user_id
      and member.active
      and member.role in ('platform_owner', 'workspace_admin')
  ) or exists (
    select 1 from public.organization_members member
    where member.user_id = p_actor_user_id and member.role = 'platform_owner'
  ) then
    return 'authorized';
  end if;

  select count(*) into assignment_count
  from public.workspace_resource_members assignment
  join public.voiceup_workspace_members member
    on member.workspace_id = assignment.workspace_id
    and member.user_id = assignment.user_id
  where assignment.workspace_id = p_workspace_id
    and assignment.user_id = p_actor_user_id
    and assignment.application_key = p_application_key
    and assignment.resource_type = p_resource_type
    and assignment.resource_id = p_resource_id
    and assignment.role = 'campaign_admin'
    and assignment.active
    and assignment.revoked_at is null
    and member.active
    and member.role = 'campaign_admin'
    and lower(regexp_replace(btrim(coalesce(assignment.resource_slug, '')), '[[:space:]]+', ' ', 'g'))
      = lower(regexp_replace(btrim(p_resource_slug), '[[:space:]]+', ' ', 'g'));

  if assignment_count = 1 then return 'authorized'; end if;
  if assignment_count > 1 then return 'assignment_mismatch'; end if;
  return 'forbidden';
end;
$$;

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
  configuration_version bigint;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code', 'forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id, p_workspace_id, p_application_key, p_resource_type, p_resource_id, p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code', authorization_code); end if;
  select configuration_version into configuration_version
  from public.vboss_resource_location_configurations
  where workspace_id = p_workspace_id and application_key = p_application_key and resource_type = p_resource_type and resource_id = p_resource_id;
  return jsonb_build_object(
    'code', 'ok',
    'configurationVersion', coalesce(configuration_version, 0),
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

create or replace function public.add_resource_location(
  p_actor_user_id uuid,
  p_workspace_id text,
  p_application_key text,
  p_resource_type text,
  p_resource_id text,
  p_resource_slug text,
  p_country text,
  p_state text,
  p_district text,
  p_block text,
  p_panchayat text,
  p_village text,
  p_postal_code text,
  p_normalized_path text,
  p_leaf_level text,
  p_source text,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  authorization_code text;
  existing_path public.vboss_resource_location_paths%rowtype;
  existing_fingerprint text;
  next_configuration_version bigint;
  audit_action text;
  path_exists boolean;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code', 'forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id, p_workspace_id, p_application_key, p_resource_type, p_resource_id, p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code', authorization_code); end if;
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,160}$' or p_request_fingerprint !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('code', 'validation_failed');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || '|' || p_application_key || '|' || p_resource_type || '|' || p_resource_id, 0));
  select audit.metadata ->> 'requestFingerprint' into existing_fingerprint
  from public.vboss_resource_location_audit audit
  where audit.workspace_id = p_workspace_id and audit.application_key = p_application_key
    and audit.resource_type = p_resource_type and audit.resource_id = p_resource_id
    and audit.metadata ->> 'idempotencyKey' = p_idempotency_key
  order by audit.id desc limit 1;
  if existing_fingerprint is not null and existing_fingerprint <> p_request_fingerprint then
    return jsonb_build_object('code', 'idempotency_conflict');
  end if;
  select * into existing_path from public.vboss_resource_location_paths
  where workspace_id = p_workspace_id and application_key = p_application_key and resource_type = p_resource_type
    and resource_id = p_resource_id and normalized_path = p_normalized_path for update;
  path_exists := found;
  if path_exists and existing_path.active then
    return jsonb_build_object('code', 'duplicate', 'location', jsonb_build_object('id', existing_path.id, 'version', existing_path.version), 'configurationVersion', (select configuration_version from public.vboss_resource_location_configurations where workspace_id = p_workspace_id and application_key = p_application_key and resource_type = p_resource_type and resource_id = p_resource_id));
  end if;
  insert into public.vboss_resource_location_configurations (workspace_id, application_key, resource_type, resource_id, resource_slug, configuration_version)
  values (p_workspace_id, p_application_key, p_resource_type, p_resource_id, p_resource_slug, 1)
  on conflict (workspace_id, application_key, resource_type, resource_id) do update
    set resource_slug = excluded.resource_slug, configuration_version = public.vboss_resource_location_configurations.configuration_version + 1, updated_at = now()
  returning configuration_version into next_configuration_version;
  if path_exists then
    update public.vboss_resource_location_paths set active = true, version = version + 1, updated_at = now(), deactivated_by = null, deactivated_at = null
    where id = existing_path.id returning * into existing_path;
    audit_action := 'reactivated';
  else
    insert into public.vboss_resource_location_paths (
      workspace_id, application_key, resource_type, resource_id, resource_slug, country, state, district, block, panchayat, village,
      postal_code, normalized_path, leaf_level, source, created_by
    ) values (
      p_workspace_id, p_application_key, p_resource_type, p_resource_id, p_resource_slug, p_country, p_state, p_district, p_block,
      p_panchayat, p_village, p_postal_code, p_normalized_path, p_leaf_level, p_source, p_actor_user_id
    ) returning * into existing_path;
    audit_action := 'created';
  end if;
  insert into public.vboss_resource_location_audit (workspace_id, application_key, resource_type, resource_id, location_path_id, actor_user_id, action, result_code, metadata)
  values (p_workspace_id, p_application_key, p_resource_type, p_resource_id, existing_path.id, p_actor_user_id, audit_action, audit_action, jsonb_build_object('idempotencyKey', p_idempotency_key, 'requestFingerprint', p_request_fingerprint));
  return jsonb_build_object('code', audit_action, 'location', jsonb_build_object('id', existing_path.id, 'version', existing_path.version), 'configurationVersion', next_configuration_version);
end;
$$;

create or replace function public.deactivate_resource_location(
  p_actor_user_id uuid,
  p_workspace_id text,
  p_application_key text,
  p_resource_type text,
  p_resource_id text,
  p_resource_slug text,
  p_location_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  authorization_code text;
  target_path public.vboss_resource_location_paths%rowtype;
  next_configuration_version bigint;
begin
  if auth.role() <> 'service_role' then return jsonb_build_object('code', 'forbidden'); end if;
  authorization_code := public.vboss_resource_location_authorization(p_actor_user_id, p_workspace_id, p_application_key, p_resource_type, p_resource_id, p_resource_slug);
  if authorization_code <> 'authorized' then return jsonb_build_object('code', authorization_code); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || '|' || p_application_key || '|' || p_resource_type || '|' || p_resource_id, 0));
  select * into target_path from public.vboss_resource_location_paths
  where id = p_location_id and workspace_id = p_workspace_id and application_key = p_application_key
    and resource_type = p_resource_type and resource_id = p_resource_id for update;
  if not found then return jsonb_build_object('code', 'validation_failed'); end if;
  if not target_path.active or target_path.version <> p_expected_version then return jsonb_build_object('code', 'conflict'); end if;
  if exists (
    select 1 from public.vboss_resource_location_paths child
    where child.workspace_id = p_workspace_id and child.application_key = p_application_key and child.resource_type = p_resource_type
      and child.resource_id = p_resource_id and child.active and child.normalized_path like target_path.normalized_path || '|%'
  ) then return jsonb_build_object('code', 'invalid_parent'); end if;
  update public.vboss_resource_location_paths
  set active = false, version = version + 1, updated_at = now(), deactivated_by = p_actor_user_id, deactivated_at = now()
  where id = target_path.id returning * into target_path;
  update public.vboss_resource_location_configurations
  set configuration_version = configuration_version + 1, updated_at = now()
  where workspace_id = p_workspace_id and application_key = p_application_key and resource_type = p_resource_type and resource_id = p_resource_id
  returning configuration_version into next_configuration_version;
  insert into public.vboss_resource_location_audit (workspace_id, application_key, resource_type, resource_id, location_path_id, actor_user_id, action, result_code)
  values (p_workspace_id, p_application_key, p_resource_type, p_resource_id, target_path.id, p_actor_user_id, 'deactivated', 'deactivated');
  return jsonb_build_object('code', 'deactivated', 'location', jsonb_build_object('id', target_path.id, 'version', target_path.version), 'configurationVersion', next_configuration_version);
end;
$$;

revoke all on function public.vboss_resource_location_authorization(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.read_resource_locations(uuid, text, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.add_resource_location(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.deactivate_resource_location(uuid, text, text, text, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.read_resource_locations(uuid, text, text, text, text, text, boolean, text) to service_role;
grant execute on function public.add_resource_location(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.deactivate_resource_location(uuid, text, text, text, text, text, uuid, integer) to service_role;

commit;
