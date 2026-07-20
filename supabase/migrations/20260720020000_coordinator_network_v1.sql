begin;

create extension if not exists pgcrypto;

alter table public.voiceup_otp_challenges
  drop constraint if exists voiceup_otp_challenges_purpose_check;
alter table public.voiceup_otp_challenges
  add constraint voiceup_otp_challenges_purpose_check
  check (purpose in ('public-signing', 'onboarding', 'coordinator-mobile'));

create table if not exists public.voiceup_coordinator_geographies (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  parent_id uuid references public.voiceup_coordinator_geographies(id) on delete restrict,
  level text not null check (level in ('country', 'state', 'district', 'block', 'panchayat', 'ward')),
  name text not null check (length(btrim(name)) between 1 and 120),
  normalized_name text not null,
  path text[] not null default array[]::text[],
  depth integer not null check (depth between 0 and 5),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists voiceup_coordinator_geographies_unique_idx
  on public.voiceup_coordinator_geographies (
    workspace_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    level,
    normalized_name
  )
  where active;
create index if not exists voiceup_coordinator_geographies_parent_idx
  on public.voiceup_coordinator_geographies (workspace_id, parent_id, level) where active;
create index if not exists voiceup_coordinator_geographies_path_idx
  on public.voiceup_coordinator_geographies using gin (path);

create table if not exists public.voiceup_coordinators (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  phone text not null,
  normalized_phone text not null,
  email text,
  normalized_email text,
  photo_path text,
  role text not null check (role in (
    'national_coordinator', 'state_coordinator', 'district_coordinator',
    'block_coordinator', 'panchayat_coordinator', 'ward_coordinator', 'field_coordinator'
  )),
  status text not null check (status in ('invited', 'active', 'inactive', 'suspended')),
  geography_id uuid references public.voiceup_coordinator_geographies(id) on delete restrict,
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{6}$'),
  reports_to_coordinator_id uuid references public.voiceup_coordinators(id) on delete restrict,
  referral_code text not null,
  referred_by_coordinator_id uuid references public.voiceup_coordinators(id) on delete set null,
  mobile_verified_at timestamptz,
  notes text not null default '' check (length(notes) <= 2000),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint voiceup_coordinators_no_self_report check (reports_to_coordinator_id is distinct from id)
);

create unique index if not exists voiceup_coordinators_phone_unique_idx
  on public.voiceup_coordinators (workspace_id, normalized_phone) where deleted_at is null;
create unique index if not exists voiceup_coordinators_referral_unique_idx
  on public.voiceup_coordinators (workspace_id, referral_code) where deleted_at is null;
create index if not exists voiceup_coordinators_workspace_status_idx
  on public.voiceup_coordinators (workspace_id, status, role) where deleted_at is null;
create index if not exists voiceup_coordinators_geography_idx
  on public.voiceup_coordinators (workspace_id, geography_id) where deleted_at is null;
create index if not exists voiceup_coordinators_reporting_idx
  on public.voiceup_coordinators (workspace_id, reports_to_coordinator_id) where deleted_at is null;
create index if not exists voiceup_coordinators_name_idx
  on public.voiceup_coordinators (workspace_id, lower(full_name)) where deleted_at is null;
create index if not exists voiceup_coordinators_search_idx
  on public.voiceup_coordinators using gin (
    to_tsvector('simple', coalesce(full_name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '') || ' ' || coalesce(referral_code, ''))
  );

create table if not exists public.voiceup_coordinator_campaigns (
  coordinator_id uuid not null references public.voiceup_coordinators(id) on delete cascade,
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  active boolean not null default true,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (coordinator_id, campaign_id)
);

create index if not exists voiceup_coordinator_campaigns_campaign_idx
  on public.voiceup_coordinator_campaigns (workspace_id, campaign_id) where active;

create table if not exists public.voiceup_coordinator_referrals (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  inviter_coordinator_id uuid not null references public.voiceup_coordinators(id) on delete restrict,
  referred_coordinator_id uuid not null references public.voiceup_coordinators(id) on delete cascade,
  referral_code text not null,
  status text not null check (status in ('accepted', 'revoked')),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voiceup_coordinator_referrals_no_self check (inviter_coordinator_id <> referred_coordinator_id),
  unique (workspace_id, referred_coordinator_id)
);

create index if not exists voiceup_coordinator_referrals_inviter_idx
  on public.voiceup_coordinator_referrals (workspace_id, inviter_coordinator_id, status);
create index if not exists voiceup_coordinator_referrals_code_idx
  on public.voiceup_coordinator_referrals (workspace_id, referral_code);

create table if not exists public.voiceup_coordinator_audit (
  id bigint generated always as identity primary key,
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  coordinator_id uuid references public.voiceup_coordinators(id) on delete set null,
  actor_user_id uuid not null references auth.users(id),
  action text not null check (action in (
    'coordinator.created', 'coordinator.updated', 'coordinator.status_changed',
    'coordinator.deleted', 'coordinator.mobile_verified', 'coordinator.photo_updated',
    'coordinator.campaigns_changed', 'coordinator.referral_linked',
    'coordinator.geography_created', 'coordinator.geography_archived'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists voiceup_coordinator_audit_workspace_time_idx
  on public.voiceup_coordinator_audit (workspace_id, created_at desc);
create index if not exists voiceup_coordinator_audit_coordinator_time_idx
  on public.voiceup_coordinator_audit (coordinator_id, created_at desc);

create or replace function public.voiceup_can_read_coordinator_network(target_workspace_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select auth.uid() is not null and (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.voiceup_workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.active
        and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin', 'field_officer', 'viewer')
    )
  );
$$;

create or replace function public.voiceup_can_manage_coordinator_network(target_workspace_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select auth.uid() is not null and (
    public.voiceup_is_platform_admin()
    or exists (
      select 1
      from public.voiceup_workspace_members member
      where member.workspace_id = target_workspace_id
        and member.user_id = auth.uid()
        and member.active
        and member.role in ('platform_owner', 'workspace_admin', 'campaign_admin')
    )
  );
$$;

alter table public.voiceup_coordinator_geographies enable row level security;
alter table public.voiceup_coordinators enable row level security;
alter table public.voiceup_coordinator_campaigns enable row level security;
alter table public.voiceup_coordinator_referrals enable row level security;
alter table public.voiceup_coordinator_audit enable row level security;

create policy "Coordinator network members read geographies"
  on public.voiceup_coordinator_geographies for select to authenticated
  using (public.voiceup_can_read_coordinator_network(workspace_id));
create policy "Coordinator network members read coordinators"
  on public.voiceup_coordinators for select to authenticated
  using (public.voiceup_can_read_coordinator_network(workspace_id));
create policy "Coordinator network members read campaign links"
  on public.voiceup_coordinator_campaigns for select to authenticated
  using (public.voiceup_can_read_coordinator_network(workspace_id));
create policy "Coordinator network members read referrals"
  on public.voiceup_coordinator_referrals for select to authenticated
  using (public.voiceup_can_read_coordinator_network(workspace_id));
create policy "Coordinator network members read audit"
  on public.voiceup_coordinator_audit for select to authenticated
  using (public.voiceup_can_read_coordinator_network(workspace_id));

revoke all on table public.voiceup_coordinator_geographies from anon, authenticated;
revoke all on table public.voiceup_coordinators from anon, authenticated;
revoke all on table public.voiceup_coordinator_campaigns from anon, authenticated;
revoke all on table public.voiceup_coordinator_referrals from anon, authenticated;
revoke all on table public.voiceup_coordinator_audit from anon, authenticated;
grant select on table public.voiceup_coordinator_geographies to authenticated;
grant select on table public.voiceup_coordinators to authenticated;
grant select on table public.voiceup_coordinator_campaigns to authenticated;
grant select on table public.voiceup_coordinator_referrals to authenticated;
grant select on table public.voiceup_coordinator_audit to authenticated;

create or replace function public.voiceup_coordinator_role_rank(target_role text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case target_role
    when 'national_coordinator' then 7
    when 'state_coordinator' then 6
    when 'district_coordinator' then 5
    when 'block_coordinator' then 4
    when 'panchayat_coordinator' then 3
    when 'ward_coordinator' then 2
    when 'field_coordinator' then 1
    else 0
  end;
$$;

create or replace function public.voiceup_coordinator_role_level(target_role text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case target_role
    when 'national_coordinator' then 'country'
    when 'state_coordinator' then 'state'
    when 'district_coordinator' then 'district'
    when 'block_coordinator' then 'block'
    when 'panchayat_coordinator' then 'panchayat'
    when 'ward_coordinator' then 'ward'
    when 'field_coordinator' then 'ward'
    else null
  end;
$$;

create or replace function public.voiceup_ensure_coordinator_geography(
  target_workspace_id text,
  geography jsonb,
  actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  level_names text[] := array['country', 'state', 'district', 'block', 'panchayat', 'ward'];
  current_level text;
  current_name text;
  current_normalized text;
  current_id uuid;
  parent_geography_id uuid := null;
  parent_path text[] := array[]::text[];
  level_index integer;
  previous_level_index integer := 0;
begin
  for level_index in 1..array_length(level_names, 1) loop
    current_level := level_names[level_index];
    current_name := btrim(coalesce(geography ->> current_level, ''));
    if current_name = '' then
      continue;
    end if;
    if level_index > 1 and previous_level_index <> level_index - 1 then
      raise exception 'Coordinator geography is missing a parent for %.', current_level;
    end if;
    current_normalized := public.voiceup_normalize_person_name(current_name);
    select item.id, item.path
      into current_id, parent_path
    from public.voiceup_coordinator_geographies item
    where item.workspace_id = target_workspace_id
      and item.parent_id is not distinct from parent_geography_id
      and item.level = current_level
      and item.normalized_name = current_normalized
      and item.active
    limit 1;
    if current_id is null then
      insert into public.voiceup_coordinator_geographies (
        workspace_id, parent_id, level, name, normalized_name, path, depth, created_by
      ) values (
        target_workspace_id,
        parent_geography_id,
        current_level,
        current_name,
        current_normalized,
        coalesce(parent_path, array[]::text[]) || current_name,
        level_index - 1,
        actor_id
      ) returning id, path into current_id, parent_path;
      insert into public.voiceup_coordinator_audit (
        workspace_id, actor_user_id, action, metadata
      ) values (
        target_workspace_id,
        actor_id,
        'coordinator.geography_created',
        jsonb_build_object('geographyId', current_id, 'level', current_level, 'name', current_name)
      );
    end if;
    parent_geography_id := current_id;
    previous_level_index := level_index;
    current_id := null;
  end loop;
  return parent_geography_id;
end;
$$;

create or replace function public.voiceup_consume_coordinator_mobile_verification(
  target_workspace_id text,
  normalized_phone text,
  verification_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_id uuid;
  phone_hash text := encode(digest(target_workspace_id || ':' || normalized_phone, 'sha256'), 'hex');
  token_hash text := encode(digest(coalesce(verification_token, ''), 'sha256'), 'hex');
begin
  if coalesce(verification_token, '') = '' then return false; end if;
  select challenge.id into challenge_id
  from public.voiceup_otp_challenges challenge
  where challenge.workspace_id = target_workspace_id
    and challenge.phone_hash = phone_hash
    and challenge.purpose = 'coordinator-mobile'
    and challenge.verified_at is not null
    and challenge.expires_at > now()
    and challenge.metadata ->> 'verificationTokenHash' = token_hash
    and challenge.metadata ->> 'coordinatorConsumedAt' is null
  order by challenge.verified_at desc
  limit 1
  for update;
  if challenge_id is null then return false; end if;
  update public.voiceup_otp_challenges
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('coordinatorConsumedAt', now())
  where id = challenge_id;
  return true;
end;
$$;

create or replace function public.upsert_voiceup_coordinator(
  p_workspace_id text,
  p_coordinator jsonb,
  p_geography jsonb,
  p_campaign_ids text[] default array[]::text[],
  p_verification_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
<<upsert_coordinator>>
declare
  actor_id uuid := auth.uid();
  workspace_record public.voiceup_workspaces%rowtype;
  coordinator_id uuid := coalesce(nullif(p_coordinator ->> 'id', '')::uuid, gen_random_uuid());
  existing_record public.voiceup_coordinators%rowtype;
  manager_record public.voiceup_coordinators%rowtype;
  full_name_value text := btrim(coalesce(p_coordinator ->> 'fullName', ''));
  phone_value text := btrim(coalesce(p_coordinator ->> 'phone', ''));
  normalized_phone_value text;
  email_value text := nullif(btrim(coalesce(p_coordinator ->> 'email', '')), '');
  normalized_email_value text;
  role_value text := coalesce(p_coordinator ->> 'role', 'field_coordinator');
  status_value text := coalesce(p_coordinator ->> 'status', 'invited');
  reports_to_id uuid := nullif(p_coordinator ->> 'reportsToCoordinatorId', '')::uuid;
  referred_by_code text := upper(btrim(coalesce(p_coordinator ->> 'referredByCode', '')));
  referred_by_id uuid;
  geography_id_value uuid;
  geography_level text;
  expected_level text;
  referral_code_value text;
  photo_path_value text := nullif(btrim(coalesce(p_coordinator ->> 'photoPath', '')), '');
  postal_code_value text := nullif(btrim(coalesce(p_geography ->> 'postalCode', '')), '');
  expected_version integer := coalesce(nullif(p_coordinator ->> 'version', '')::integer, 0);
  mobile_verified_at_value timestamptz;
  is_new boolean := false;
  phone_changed boolean := false;
  campaign_id_value text;
begin
  if actor_id is null or not public.voiceup_can_manage_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network management is not authorized.';
  end if;
  select * into workspace_record from public.voiceup_workspaces
  where id = p_workspace_id for update;
  if not found then raise exception 'Workspace not found.'; end if;

  normalized_phone_value := public.voiceup_normalize_indian_phone(phone_value);
  normalized_email_value := public.voiceup_normalize_email(email_value);
  if length(full_name_value) < 2 then raise exception 'Coordinator name is required.'; end if;
  if normalized_phone_value is null then raise exception 'Enter a valid Indian mobile number.'; end if;
  if email_value is not null and normalized_email_value is null then raise exception 'Enter a valid email address.'; end if;
  if role_value not in (
    'national_coordinator', 'state_coordinator', 'district_coordinator', 'block_coordinator',
    'panchayat_coordinator', 'ward_coordinator', 'field_coordinator'
  ) then raise exception 'Coordinator role is invalid.'; end if;
  if status_value not in ('invited', 'active', 'inactive', 'suspended') then
    raise exception 'Coordinator status is invalid.';
  end if;
  if postal_code_value is not null and postal_code_value !~ '^[0-9]{6}$' then
    raise exception 'Coordinator PIN code must contain six digits.';
  end if;

  select * into existing_record
  from public.voiceup_coordinators
  where id = coordinator_id and workspace_id = p_workspace_id and deleted_at is null
  for update;
  is_new := not found;
  if is_new and exists (
    select 1 from public.voiceup_coordinators other where other.id = coordinator_id
  ) then raise exception 'Coordinator identifier belongs to another workspace.'; end if;
  if not is_new and expected_version <> existing_record.version then
    raise exception 'Coordinator changed since it was opened. Refresh and retry.';
  end if;
  phone_changed := is_new or existing_record.normalized_phone <> normalized_phone_value;
  mobile_verified_at_value := case when is_new then null else existing_record.mobile_verified_at end;
  if phone_changed then
    if not public.voiceup_consume_coordinator_mobile_verification(
      p_workspace_id, normalized_phone_value, p_verification_token
    ) then
      raise exception 'Verified mobile proof is required for this coordinator.';
    end if;
    mobile_verified_at_value := now();
  end if;

  if photo_path_value is not null and photo_path_value not like p_workspace_id || '/coordinators/' || coordinator_id::text || '/%' then
    raise exception 'Coordinator photo path is outside the coordinator profile.';
  end if;

  geography_id_value := public.voiceup_ensure_coordinator_geography(
    p_workspace_id,
    coalesce(p_geography, '{}'::jsonb),
    actor_id
  );
  expected_level := public.voiceup_coordinator_role_level(role_value);
  if geography_id_value is null then raise exception 'Coordinator geography is required.'; end if;
  select level into geography_level
  from public.voiceup_coordinator_geographies
  where id = geography_id_value and workspace_id = p_workspace_id and active;
  if expected_level is not null and geography_level <> expected_level then
    raise exception 'Coordinator role must match the assigned geography level.';
  end if;

  if reports_to_id is not null then
    select * into manager_record from public.voiceup_coordinators
    where id = reports_to_id and workspace_id = p_workspace_id and deleted_at is null;
    if not found then raise exception 'Reporting coordinator was not found.'; end if;
    if public.voiceup_coordinator_role_rank(manager_record.role) <= public.voiceup_coordinator_role_rank(role_value) then
      raise exception 'Reporting coordinator must have a broader role.';
    end if;
    if not is_new and exists (
      with recursive descendants as (
        select id from public.voiceup_coordinators
        where reports_to_coordinator_id = coordinator_id and workspace_id = p_workspace_id and deleted_at is null
        union all
        select child.id from public.voiceup_coordinators child
        join descendants parent on child.reports_to_coordinator_id = parent.id
        where child.workspace_id = p_workspace_id and child.deleted_at is null
      ) select 1 from descendants where id = reports_to_id
    ) then raise exception 'Reporting hierarchy cannot contain a cycle.'; end if;
  end if;

  foreach campaign_id_value in array coalesce(p_campaign_ids, array[]::text[]) loop
    if not exists (
      select 1 from jsonb_array_elements(coalesce(workspace_record.data -> 'campaigns', '[]'::jsonb)) campaign
      where campaign ->> 'id' = campaign_id_value
    ) then raise exception 'Linked campaign does not belong to this workspace.'; end if;
  end loop;

  if referred_by_code <> '' then
    select id into referred_by_id from public.voiceup_coordinators
    where workspace_id = p_workspace_id and referral_code = referred_by_code and deleted_at is null;
    if referred_by_id is null then raise exception 'Referral code was not found.'; end if;
    if referred_by_id = coordinator_id then raise exception 'A coordinator cannot refer themselves.'; end if;
  end if;

  referral_code_value := case
    when is_new then 'VC-' || upper(substr(encode(digest(p_workspace_id || ':' || coordinator_id::text, 'sha256'), 'hex'), 1, 8))
    else existing_record.referral_code
  end;

  insert into public.voiceup_coordinators (
    id, workspace_id, full_name, phone, normalized_phone, email, normalized_email,
    photo_path, role, status, geography_id, postal_code, reports_to_coordinator_id, referral_code,
    referred_by_coordinator_id, mobile_verified_at, notes, created_by, updated_by
  ) values (
    coordinator_id, p_workspace_id, full_name_value, phone_value, normalized_phone_value,
    email_value, normalized_email_value, photo_path_value, role_value, status_value,
    geography_id_value, postal_code_value, reports_to_id, referral_code_value, referred_by_id,
    mobile_verified_at_value, coalesce(p_coordinator ->> 'notes', ''), actor_id, actor_id
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    normalized_phone = excluded.normalized_phone,
    email = excluded.email,
    normalized_email = excluded.normalized_email,
    photo_path = excluded.photo_path,
    role = excluded.role,
    status = excluded.status,
    geography_id = excluded.geography_id,
    postal_code = excluded.postal_code,
    reports_to_coordinator_id = excluded.reports_to_coordinator_id,
    referred_by_coordinator_id = excluded.referred_by_coordinator_id,
    mobile_verified_at = excluded.mobile_verified_at,
    notes = excluded.notes,
    version = public.voiceup_coordinators.version + 1,
    updated_by = actor_id,
    updated_at = now();

  update public.voiceup_coordinator_campaigns link
  set active = false, revoked_at = now()
  where link.coordinator_id = upsert_coordinator.coordinator_id
    and link.workspace_id = p_workspace_id
    and link.active;
  foreach campaign_id_value in array coalesce(p_campaign_ids, array[]::text[]) loop
    insert into public.voiceup_coordinator_campaigns (
      coordinator_id, workspace_id, campaign_id, active, assigned_by, assigned_at, revoked_at
    ) values (
      coordinator_id, p_workspace_id, campaign_id_value, true, actor_id, now(), null
    ) on conflict (coordinator_id, campaign_id) do update set
      active = true, assigned_by = actor_id, assigned_at = now(), revoked_at = null;
  end loop;

  update public.voiceup_coordinator_referrals
  set status = 'revoked', updated_at = now()
  where workspace_id = p_workspace_id
    and referred_coordinator_id = coordinator_id
    and status = 'accepted';
  if referred_by_id is not null then
    insert into public.voiceup_coordinator_referrals (
      workspace_id, inviter_coordinator_id, referred_coordinator_id, referral_code, status, accepted_at
    ) values (
      p_workspace_id, referred_by_id, coordinator_id, referred_by_code, 'accepted', now()
    ) on conflict (workspace_id, referred_coordinator_id) do update set
      inviter_coordinator_id = excluded.inviter_coordinator_id,
      referral_code = excluded.referral_code,
      status = 'accepted', accepted_at = now(), updated_at = now();
  end if;

  insert into public.voiceup_coordinator_audit (
    workspace_id, coordinator_id, actor_user_id, action, metadata
  ) values (
    p_workspace_id,
    coordinator_id,
    actor_id,
    case when is_new then 'coordinator.created' else 'coordinator.updated' end,
    jsonb_build_object(
      'role', role_value,
      'status', status_value,
      'geographyId', geography_id_value,
      'reportsToCoordinatorId', reports_to_id,
      'campaignCount', coalesce(array_length(p_campaign_ids, 1), 0),
      'mobileVerified', mobile_verified_at_value is not null
    )
  );
  if phone_changed then
    insert into public.voiceup_coordinator_audit (
      workspace_id, coordinator_id, actor_user_id, action, metadata
    ) values (p_workspace_id, coordinator_id, actor_id, 'coordinator.mobile_verified', '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'id', coordinator_id,
    'referralCode', referral_code_value,
    'version', case when is_new then 1 else existing_record.version + 1 end
  );
end;
$$;

create or replace function public.set_voiceup_coordinator_status(
  p_workspace_id text,
  p_coordinator_id uuid,
  p_status text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  coordinator_record public.voiceup_coordinators%rowtype;
begin
  if actor_id is null or not public.voiceup_can_manage_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network management is not authorized.';
  end if;
  if p_status not in ('invited', 'active', 'inactive', 'suspended') then
    raise exception 'Coordinator status is invalid.';
  end if;
  select * into coordinator_record from public.voiceup_coordinators
  where id = p_coordinator_id and workspace_id = p_workspace_id and deleted_at is null for update;
  if not found then raise exception 'Coordinator not found.'; end if;
  if coordinator_record.version <> p_expected_version then
    raise exception 'Coordinator changed since it was opened. Refresh and retry.';
  end if;
  if p_status = 'active' and coordinator_record.mobile_verified_at is null then
    raise exception 'Mobile verification is required before activation.';
  end if;
  update public.voiceup_coordinators
  set status = p_status, version = version + 1, updated_by = actor_id, updated_at = now()
  where id = p_coordinator_id;
  insert into public.voiceup_coordinator_audit (
    workspace_id, coordinator_id, actor_user_id, action, metadata
  ) values (
    p_workspace_id, p_coordinator_id, actor_id, 'coordinator.status_changed',
    jsonb_build_object('from', coordinator_record.status, 'to', p_status)
  );
  return jsonb_build_object('id', p_coordinator_id, 'version', coordinator_record.version + 1, 'status', p_status);
end;
$$;

create or replace function public.delete_voiceup_coordinator(
  p_workspace_id text,
  p_coordinator_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  coordinator_record public.voiceup_coordinators%rowtype;
begin
  if actor_id is null or not public.voiceup_can_manage_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network management is not authorized.';
  end if;
  select * into coordinator_record from public.voiceup_coordinators
  where id = p_coordinator_id and workspace_id = p_workspace_id and deleted_at is null for update;
  if not found then raise exception 'Coordinator not found.'; end if;
  if coordinator_record.version <> p_expected_version then
    raise exception 'Coordinator changed since it was opened. Refresh and retry.';
  end if;
  if exists (
    select 1 from public.voiceup_coordinators child
    where child.reports_to_coordinator_id = p_coordinator_id and child.deleted_at is null
  ) then raise exception 'Reassign direct reports before deleting this coordinator.'; end if;
  update public.voiceup_coordinators
  set status = 'inactive', deleted_at = now(), version = version + 1, updated_by = actor_id, updated_at = now()
  where id = p_coordinator_id;
  update public.voiceup_coordinator_campaigns
  set active = false, revoked_at = now()
  where coordinator_id = p_coordinator_id and active;
  insert into public.voiceup_coordinator_audit (
    workspace_id, coordinator_id, actor_user_id, action, metadata
  ) values (p_workspace_id, p_coordinator_id, actor_id, 'coordinator.deleted', jsonb_build_object('role', coordinator_record.role));
  return jsonb_build_object('id', p_coordinator_id, 'deleted', true);
end;
$$;

create or replace function public.archive_voiceup_coordinator_geography(
  p_workspace_id text,
  p_geography_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or not public.voiceup_can_manage_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network management is not authorized.';
  end if;
  if exists (select 1 from public.voiceup_coordinators where geography_id = p_geography_id and deleted_at is null)
    or exists (select 1 from public.voiceup_coordinator_geographies where parent_id = p_geography_id and active) then
    raise exception 'Geography is in use and cannot be archived.';
  end if;
  update public.voiceup_coordinator_geographies
  set active = false, updated_at = now()
  where id = p_geography_id and workspace_id = p_workspace_id and active;
  if not found then raise exception 'Geography not found.'; end if;
  insert into public.voiceup_coordinator_audit (workspace_id, actor_user_id, action, metadata)
  values (p_workspace_id, actor_id, 'coordinator.geography_archived', jsonb_build_object('geographyId', p_geography_id));
  return jsonb_build_object('id', p_geography_id, 'archived', true);
end;
$$;

create or replace function public.get_voiceup_coordinator_network(p_workspace_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if not public.voiceup_can_read_coordinator_network(p_workspace_id) then
    raise exception 'Coordinator network access is not authorized.';
  end if;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'canManage', public.voiceup_can_manage_coordinator_network(p_workspace_id),
    'coordinators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', coordinator.id,
        'workspaceId', coordinator.workspace_id,
        'authUserId', coordinator.auth_user_id,
        'fullName', coordinator.full_name,
        'phone', coordinator.phone,
        'email', coordinator.email,
        'photoPath', coordinator.photo_path,
        'role', coordinator.role,
        'status', coordinator.status,
        'geographyId', coordinator.geography_id,
        'postalCode', coordinator.postal_code,
        'reportsToCoordinatorId', coordinator.reports_to_coordinator_id,
        'referralCode', coordinator.referral_code,
        'referredByCoordinatorId', coordinator.referred_by_coordinator_id,
        'mobileVerifiedAt', coordinator.mobile_verified_at,
        'notes', coordinator.notes,
        'version', coordinator.version,
        'createdAt', coordinator.created_at,
        'updatedAt', coordinator.updated_at
      ) order by coordinator.full_name)
      from public.voiceup_coordinators coordinator
      where coordinator.workspace_id = p_workspace_id and coordinator.deleted_at is null
    ), '[]'::jsonb),
    'geographies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', geography.id,
        'workspaceId', geography.workspace_id,
        'parentId', geography.parent_id,
        'level', geography.level,
        'name', geography.name,
        'path', geography.path,
        'depth', geography.depth
      ) order by geography.path)
      from public.voiceup_coordinator_geographies geography
      where geography.workspace_id = p_workspace_id and geography.active
    ), '[]'::jsonb),
    'campaignLinks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'coordinatorId', link.coordinator_id,
        'campaignId', link.campaign_id,
        'assignedAt', link.assigned_at
      )) from public.voiceup_coordinator_campaigns link
      where link.workspace_id = p_workspace_id and link.active
    ), '[]'::jsonb),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', referral.id,
        'inviterCoordinatorId', referral.inviter_coordinator_id,
        'referredCoordinatorId', referral.referred_coordinator_id,
        'referralCode', referral.referral_code,
        'status', referral.status,
        'acceptedAt', referral.accepted_at
      ) order by referral.created_at desc)
      from public.voiceup_coordinator_referrals referral
      where referral.workspace_id = p_workspace_id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(activity_row.payload order by activity_row.created_at desc)
      from (
        select audit.created_at, jsonb_build_object(
          'id', audit.id,
          'coordinatorId', audit.coordinator_id,
          'action', audit.action,
          'metadata', audit.metadata,
          'createdAt', audit.created_at
        ) as payload
        from public.voiceup_coordinator_audit audit
        where audit.workspace_id = p_workspace_id
        order by audit.created_at desc
        limit 200
      ) activity_row
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.voiceup_can_read_coordinator_network(text) from public;
revoke all on function public.voiceup_can_manage_coordinator_network(text) from public;
revoke all on function public.voiceup_coordinator_role_rank(text) from public;
revoke all on function public.voiceup_coordinator_role_level(text) from public;
revoke all on function public.voiceup_ensure_coordinator_geography(text, jsonb, uuid) from public;
revoke all on function public.voiceup_consume_coordinator_mobile_verification(text, text, text) from public;
revoke all on function public.upsert_voiceup_coordinator(text, jsonb, jsonb, text[], text) from public;
revoke all on function public.set_voiceup_coordinator_status(text, uuid, text, integer) from public;
revoke all on function public.delete_voiceup_coordinator(text, uuid, integer) from public;
revoke all on function public.archive_voiceup_coordinator_geography(text, uuid) from public;
revoke all on function public.get_voiceup_coordinator_network(text) from public;

grant execute on function public.voiceup_can_read_coordinator_network(text) to authenticated;
grant execute on function public.voiceup_can_manage_coordinator_network(text) to authenticated;
grant execute on function public.upsert_voiceup_coordinator(text, jsonb, jsonb, text[], text) to authenticated;
grant execute on function public.set_voiceup_coordinator_status(text, uuid, text, integer) to authenticated;
grant execute on function public.delete_voiceup_coordinator(text, uuid, integer) to authenticated;
grant execute on function public.archive_voiceup_coordinator_geography(text, uuid) to authenticated;
grant execute on function public.get_voiceup_coordinator_network(text) to authenticated;

commit;
