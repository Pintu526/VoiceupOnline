begin;

create extension if not exists pgcrypto;

create table if not exists public.voiceup_campaign_certificate_settings (
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  campaign_slug text not null,
  certificates_enabled boolean not null default false,
  artwork_url text,
  artwork_storage_path text,
  artwork_sha256 text,
  artwork_mime_type text,
  artwork_width integer,
  artwork_height integer,
  wording jsonb not null default '{}'::jsonb,
  issuer jsonb not null default '{}'::jsonb,
  placement jsonb not null default '{}'::jsonb,
  configuration_version bigint not null default 1 check (configuration_version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, campaign_id),
  check (length(btrim(campaign_slug)) between 1 and 160),
  check (artwork_sha256 is null or artwork_sha256 ~ '^[0-9a-f]{64}$'),
  check (artwork_mime_type is null or artwork_mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  check (artwork_width is null or artwork_width between 600 and 10000),
  check (artwork_height is null or artwork_height between 400 and 10000),
  check (jsonb_typeof(wording) = 'object'),
  check (jsonb_typeof(issuer) = 'object'),
  check (jsonb_typeof(placement) = 'object')
);

create table if not exists public.voiceup_campaign_certificate_templates (
  workspace_id text not null,
  campaign_id text not null,
  configuration_version bigint not null,
  campaign_slug text not null,
  certificates_enabled boolean not null,
  artwork_url text,
  artwork_storage_path text,
  artwork_sha256 text,
  artwork_mime_type text,
  artwork_width integer,
  artwork_height integer,
  wording jsonb not null,
  issuer jsonb not null,
  placement jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, campaign_id, configuration_version),
  foreign key (workspace_id, campaign_id)
    references public.voiceup_campaign_certificate_settings(workspace_id, campaign_id)
    on delete cascade
);

create table if not exists public.voiceup_participation_certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_id text not null unique check (certificate_id ~ '^VUC-[A-F0-9]{20}$'),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  campaign_slug text not null,
  campaign_name text not null,
  supporter_account_id uuid not null references public.voiceup_supporter_accounts(id) on delete restrict,
  supporter_id text not null,
  supporter_display_name text not null,
  participation_date date not null,
  language text not null check (language in ('en', 'hi', 'or')),
  configuration_version bigint not null,
  verification_reference text not null unique check (verification_reference ~ '^[0-9a-f]{64}$'),
  status text not null default 'valid' check (status in ('valid', 'revoked')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text,
  unique (workspace_id, campaign_id, supporter_id),
  foreign key (workspace_id, campaign_id, configuration_version)
    references public.voiceup_campaign_certificate_templates(workspace_id, campaign_id, configuration_version)
    on delete restrict,
  check (
    (status = 'valid' and revoked_at is null and revoked_by is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create index if not exists voiceup_participation_certificates_account_idx
  on public.voiceup_participation_certificates (supporter_account_id, issued_at desc);
create index if not exists voiceup_participation_certificates_scope_idx
  on public.voiceup_participation_certificates (workspace_id, campaign_id, issued_at desc);

create table if not exists public.voiceup_certificate_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.voiceup_workspaces(id) on delete cascade,
  campaign_id text not null,
  certificate_record_id uuid references public.voiceup_participation_certificates(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'settings_saved', 'artwork_upload_prepared', 'certificate_issued',
    'certificate_issue_replayed', 'certificate_revoked'
  )),
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists voiceup_certificate_audit_scope_idx
  on public.voiceup_certificate_audit (workspace_id, campaign_id, created_at desc);

alter table public.voiceup_campaign_certificate_settings enable row level security;
alter table public.voiceup_campaign_certificate_templates enable row level security;
alter table public.voiceup_participation_certificates enable row level security;
alter table public.voiceup_certificate_audit enable row level security;

revoke all on table public.voiceup_campaign_certificate_settings from public, anon, authenticated;
revoke all on table public.voiceup_campaign_certificate_templates from public, anon, authenticated;
revoke all on table public.voiceup_participation_certificates from public, anon, authenticated;
revoke all on table public.voiceup_certificate_audit from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-certificates',
  'campaign-certificates',
  true,
  12582912,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.voiceup_is_exact_campaign_admin(
  target_workspace_id text,
  target_campaign_id text,
  target_campaign_slug text,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public, auth, pg_temp
stable
as $$
  select target_user_id is not null and exists (
    select 1
    from public.workspace_resource_members assignment
    join public.voiceup_workspace_members member
      on member.workspace_id = assignment.workspace_id
     and member.user_id = assignment.user_id
    where assignment.workspace_id = target_workspace_id
      and assignment.user_id = target_user_id
      and assignment.application_key = 'voiceup'
      and assignment.role = 'campaign_admin'
      and assignment.resource_type = 'campaign'
      and assignment.resource_id = target_campaign_id
      and lower(btrim(coalesce(assignment.resource_slug, ''))) = lower(btrim(target_campaign_slug))
      and assignment.active
      and assignment.revoked_at is null
      and member.active
      and member.role = 'campaign_admin'
  );
$$;

revoke all on function public.voiceup_is_exact_campaign_admin(text, text, text, uuid) from public, anon;
grant execute on function public.voiceup_is_exact_campaign_admin(text, text, text, uuid)
  to authenticated, service_role;

create or replace function public.voiceup_certificate_settings_payload(
  setting public.voiceup_campaign_certificate_settings
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select jsonb_build_object(
    'workspaceId', setting.workspace_id,
    'campaignId', setting.campaign_id,
    'campaignSlug', setting.campaign_slug,
    'certificatesEnabled', setting.certificates_enabled,
    'artwork', case when setting.artwork_url is null then null else jsonb_build_object(
      'url', setting.artwork_url,
      'storagePath', setting.artwork_storage_path,
      'sha256', setting.artwork_sha256,
      'mimeType', setting.artwork_mime_type,
      'width', setting.artwork_width,
      'height', setting.artwork_height
    ) end,
    'wording', setting.wording,
    'issuer', setting.issuer,
    'placement', setting.placement,
    'configurationVersion', setting.configuration_version,
    'updatedAt', setting.updated_at
  );
$$;

revoke all on function public.voiceup_certificate_settings_payload(public.voiceup_campaign_certificate_settings)
  from public, anon, authenticated;

create or replace function public.voiceup_read_campaign_certificate_settings(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_setting public.voiceup_campaign_certificate_settings%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;
  if not public.voiceup_is_exact_campaign_admin(
    p_workspace_id, p_campaign_id, p_campaign_slug, auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'voiceup:campaign_admin_required';
  end if;

  select setting.* into v_setting
  from public.voiceup_campaign_certificate_settings setting
  where setting.workspace_id = p_workspace_id
    and setting.campaign_id = p_campaign_id;

  if not found then
    return jsonb_build_object(
      'workspaceId', p_workspace_id,
      'campaignId', p_campaign_id,
      'campaignSlug', p_campaign_slug,
      'certificatesEnabled', false,
      'artwork', null,
      'wording', '{}'::jsonb,
      'issuer', '{}'::jsonb,
      'placement', '{}'::jsonb,
      'configurationVersion', 0,
      'updatedAt', null
    );
  end if;
  return public.voiceup_certificate_settings_payload(v_setting);
end;
$$;

create or replace function public.voiceup_save_campaign_certificate_settings(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text,
  p_certificates_enabled boolean,
  p_artwork jsonb,
  p_wording jsonb,
  p_issuer jsonb,
  p_placement jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.voiceup_campaign_certificate_settings%rowtype;
  v_saved public.voiceup_campaign_certificate_settings%rowtype;
  v_next_version bigint;
  v_artwork_url text := nullif(btrim(coalesce(p_artwork ->> 'url', '')), '');
  v_artwork_path text := nullif(btrim(coalesce(p_artwork ->> 'storagePath', '')), '');
  v_artwork_sha text := nullif(lower(btrim(coalesce(p_artwork ->> 'sha256', ''))), '');
  v_artwork_mime text := nullif(btrim(coalesce(p_artwork ->> 'mimeType', '')), '');
  v_artwork_width integer;
  v_artwork_height integer;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;
  if not public.voiceup_is_exact_campaign_admin(
    p_workspace_id, p_campaign_id, p_campaign_slug, v_actor
  ) then
    raise exception using errcode = '42501', message = 'voiceup:campaign_admin_required';
  end if;
  if nullif(btrim(p_campaign_slug), '') is null
    or coalesce(jsonb_typeof(p_wording), '') <> 'object'
    or coalesce(jsonb_typeof(p_issuer), '') <> 'object'
    or coalesce(jsonb_typeof(p_placement), '') <> 'object'
    or (p_artwork is not null and jsonb_typeof(p_artwork) <> 'object')
  then
    raise exception using errcode = '22023', message = 'voiceup:invalid_certificate_settings';
  end if;

  if v_artwork_url is not null then
    if v_artwork_url !~ '^https://[^[:space:]]+$'
      and v_artwork_url !~ '^/brands/[A-Za-z0-9_./-]+$'
    then
      raise exception using errcode = '22023', message = 'voiceup:invalid_certificate_artwork';
    end if;
    if v_artwork_sha is null or v_artwork_sha !~ '^[0-9a-f]{64}$'
      or v_artwork_mime not in ('image/png', 'image/jpeg', 'image/webp')
    then
      raise exception using errcode = '22023', message = 'voiceup:invalid_certificate_artwork';
    end if;
    begin
      v_artwork_width := (p_artwork ->> 'width')::integer;
      v_artwork_height := (p_artwork ->> 'height')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'voiceup:invalid_certificate_artwork';
    end;
    if v_artwork_width is null or v_artwork_height is null
      or v_artwork_width not between 600 and 10000
      or v_artwork_height not between 400 and 10000
    then
      raise exception using errcode = '22023', message = 'voiceup:invalid_certificate_artwork';
    end if;
    if v_artwork_url like '/brands/%' and not (
      lower(btrim(p_campaign_slug)) = 'gau-samman-ahvaan-abhiyan'
      and v_artwork_url = '/brands/gau-samman/gau-samman-participation-certificate-dynamic-background.png'
      and v_artwork_path = 'bundled/gau-samman/gau-samman-participation-certificate-dynamic-background.png'
      and v_artwork_sha = '1f6280d98519a2d2f000d78867c54159e04746e0773c317a6bee4b9fb53e1d83'
      and v_artwork_mime = 'image/png'
      and v_artwork_width = 1536
      and v_artwork_height = 1024
    ) then
      raise exception using errcode = '22023', message = 'voiceup:invalid_certificate_artwork';
    end if;
    if v_artwork_url like 'https://%' and (
      v_artwork_path is null
      or left(v_artwork_path, length(p_workspace_id || '/' || p_campaign_id || '/'))
        <> p_workspace_id || '/' || p_campaign_id || '/'
    ) then
      raise exception using errcode = '22023', message = 'voiceup:invalid_certificate_artwork';
    end if;
  else
    v_artwork_path := null;
    v_artwork_sha := null;
    v_artwork_mime := null;
    v_artwork_width := null;
    v_artwork_height := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_workspace_id || '|certificate-settings|' || p_campaign_id, 0
  ));
  select setting.* into v_existing
  from public.voiceup_campaign_certificate_settings setting
  where setting.workspace_id = p_workspace_id and setting.campaign_id = p_campaign_id
  for update;
  v_next_version := case when found then v_existing.configuration_version + 1 else 1 end;

  insert into public.voiceup_campaign_certificate_settings (
    workspace_id, campaign_id, campaign_slug, certificates_enabled,
    artwork_url, artwork_storage_path, artwork_sha256, artwork_mime_type,
    artwork_width, artwork_height, wording, issuer, placement,
    configuration_version, created_by, updated_by, created_at, updated_at
  ) values (
    p_workspace_id, p_campaign_id, lower(btrim(p_campaign_slug)), coalesce(p_certificates_enabled, false),
    v_artwork_url, v_artwork_path, v_artwork_sha, v_artwork_mime,
    v_artwork_width, v_artwork_height, p_wording, p_issuer, p_placement,
    v_next_version, v_actor, v_actor, now(), now()
  )
  on conflict (workspace_id, campaign_id) do update set
    campaign_slug = excluded.campaign_slug,
    certificates_enabled = excluded.certificates_enabled,
    artwork_url = excluded.artwork_url,
    artwork_storage_path = excluded.artwork_storage_path,
    artwork_sha256 = excluded.artwork_sha256,
    artwork_mime_type = excluded.artwork_mime_type,
    artwork_width = excluded.artwork_width,
    artwork_height = excluded.artwork_height,
    wording = excluded.wording,
    issuer = excluded.issuer,
    placement = excluded.placement,
    configuration_version = excluded.configuration_version,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_saved;

  insert into public.voiceup_campaign_certificate_templates (
    workspace_id, campaign_id, configuration_version, campaign_slug,
    certificates_enabled, artwork_url, artwork_storage_path, artwork_sha256,
    artwork_mime_type, artwork_width, artwork_height, wording, issuer, placement,
    created_by, created_at
  ) values (
    v_saved.workspace_id, v_saved.campaign_id, v_saved.configuration_version, v_saved.campaign_slug,
    v_saved.certificates_enabled, v_saved.artwork_url, v_saved.artwork_storage_path,
    v_saved.artwork_sha256, v_saved.artwork_mime_type, v_saved.artwork_width,
    v_saved.artwork_height, v_saved.wording, v_saved.issuer, v_saved.placement,
    v_actor, now()
  );

  insert into public.voiceup_certificate_audit (
    workspace_id, campaign_id, actor_id, event_type, outcome, metadata
  ) values (
    p_workspace_id, p_campaign_id, v_actor, 'settings_saved', 'saved',
    jsonb_build_object(
      'configurationVersion', v_next_version,
      'certificatesEnabled', v_saved.certificates_enabled,
      'hasArtwork', v_saved.artwork_url is not null
    )
  );
  return public.voiceup_certificate_settings_payload(v_saved);
end;
$$;

create or replace function public.voiceup_record_certificate_artwork_upload(
  p_workspace_id text,
  p_campaign_id text,
  p_campaign_slug text,
  p_storage_path text
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.voiceup_is_exact_campaign_admin(
    p_workspace_id, p_campaign_id, p_campaign_slug, auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'voiceup:campaign_admin_required';
  end if;
  if p_storage_path !~ ('^' || regexp_replace(p_workspace_id, '([^A-Za-z0-9])', '\\\1', 'g') || '/' || regexp_replace(p_campaign_id, '([^A-Za-z0-9])', '\\\1', 'g') || '/') then
    raise exception using errcode = '22023', message = 'voiceup:invalid_certificate_artwork';
  end if;
  insert into public.voiceup_certificate_audit (
    workspace_id, campaign_id, actor_id, event_type, outcome, metadata
  ) values (
    p_workspace_id, p_campaign_id, auth.uid(), 'artwork_upload_prepared', 'prepared',
    jsonb_build_object('storagePath', p_storage_path)
  );
end;
$$;

create or replace function public.voiceup_issue_owned_participation_certificate(
  p_account_id uuid,
  p_language text default 'en'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_account public.voiceup_supporter_accounts%rowtype;
  v_setting public.voiceup_campaign_certificate_settings%rowtype;
  v_workspace_data jsonb;
  v_signer jsonb;
  v_signer_count bigint;
  v_campaign jsonb;
  v_campaign_count bigint;
  v_participation_date date;
  v_certificate public.voiceup_participation_certificates%rowtype;
  v_created boolean := false;
  v_language text := case when p_language in ('en', 'hi', 'or') then p_language else 'en' end;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;
  select account.* into v_account
  from public.voiceup_supporter_accounts account
  where account.id = p_account_id and account.auth_user_id = v_actor;
  if not found then
    raise exception using errcode = '42501', message = 'voiceup:certificate_not_authorized';
  end if;

  select setting.* into v_setting
  from public.voiceup_campaign_certificate_settings setting
  where setting.workspace_id = v_account.workspace_id
    and setting.campaign_id = v_account.campaign_id;
  if not found or not v_setting.certificates_enabled or v_setting.artwork_url is null then
    raise exception using errcode = '55000', message = 'voiceup:certificate_not_available';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_account.workspace_id || '|certificate|' || v_account.campaign_id || '|' || v_account.supporter_id, 0
  ));
  select certificate.* into v_certificate
  from public.voiceup_participation_certificates certificate
  where certificate.workspace_id = v_account.workspace_id
    and certificate.campaign_id = v_account.campaign_id
    and certificate.supporter_id = v_account.supporter_id;

  if not found then
    select workspace.data into v_workspace_data
    from public.voiceup_workspaces workspace
    where workspace.id = v_account.workspace_id;
    if not found then
      raise exception using errcode = '55000', message = 'voiceup:certificate_not_available';
    end if;

    select count(*), (jsonb_agg(signer) -> 0)
      into v_signer_count, v_signer
    from jsonb_array_elements(coalesce(v_workspace_data -> 'signers', '[]'::jsonb)) signer
    where signer ->> 'campaignId' = v_account.campaign_id
      and signer ->> 'id' = v_account.supporter_id;
    select count(*), (jsonb_agg(campaign) -> 0)
      into v_campaign_count, v_campaign
    from jsonb_array_elements(coalesce(v_workspace_data -> 'campaigns', '[]'::jsonb)) campaign
    where campaign ->> 'id' = v_account.campaign_id;

    if v_signer_count <> 1 or v_campaign_count <> 1
      or coalesce(v_signer ->> 'status', '') <> 'verified'
      or not (
        coalesce(v_signer ->> 'supportSubmittedAt', '') <> ''
        or coalesce(v_signer ->> 'signedAt', '') <> ''
      )
    then
      raise exception using errcode = '55000', message = 'voiceup:certificate_participation_ineligible';
    end if;
    begin
      v_participation_date := coalesce(
        nullif(v_signer ->> 'supportSubmittedAt', '')::timestamptz,
        nullif(v_signer ->> 'signedAt', '')::timestamptz
      )::date;
    exception when others then
      raise exception using errcode = '55000', message = 'voiceup:certificate_participation_ineligible';
    end;

    insert into public.voiceup_participation_certificates (
      certificate_id, workspace_id, campaign_id, campaign_slug, campaign_name,
      supporter_account_id, supporter_id, supporter_display_name, participation_date,
      language, configuration_version, verification_reference
    ) values (
      'VUC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
      v_account.workspace_id, v_account.campaign_id, v_setting.campaign_slug,
      coalesce(nullif(btrim(v_campaign ->> 'title'), ''), 'VoiceUp Campaign'),
      v_account.id, v_account.supporter_id,
      coalesce(nullif(btrim(v_signer ->> 'name'), ''), 'VoiceUp Supporter'),
      v_participation_date, v_language, v_setting.configuration_version,
      encode(gen_random_bytes(32), 'hex')
    ) returning * into v_certificate;
    v_created := true;
  end if;

  insert into public.voiceup_certificate_audit (
    workspace_id, campaign_id, certificate_record_id, actor_id, event_type, outcome, metadata
  ) values (
    v_certificate.workspace_id, v_certificate.campaign_id, v_certificate.id, v_actor,
    case when v_created then 'certificate_issued' else 'certificate_issue_replayed' end,
    case when v_created then 'issued' else 'existing_returned' end,
    jsonb_build_object('configurationVersion', v_certificate.configuration_version)
  );

  return (
    select jsonb_build_object(
      'id', certificate.id,
      'certificateId', certificate.certificate_id,
      'campaignId', certificate.campaign_id,
      'campaignSlug', certificate.campaign_slug,
      'campaignName', certificate.campaign_name,
      'supporterDisplayName', certificate.supporter_display_name,
      'participationDate', certificate.participation_date,
      'issuedAt', certificate.issued_at,
      'status', certificate.status,
      'language', certificate.language,
      'configurationVersion', certificate.configuration_version,
      'verificationReference', certificate.verification_reference,
      'verificationPath', '/certificates/verify/' || certificate.certificate_id || '?ref=' || certificate.verification_reference,
      'artwork', jsonb_build_object(
        'url', template.artwork_url,
        'storagePath', template.artwork_storage_path,
        'sha256', template.artwork_sha256,
        'mimeType', template.artwork_mime_type,
        'width', template.artwork_width,
        'height', template.artwork_height
      ),
      'wording', template.wording,
      'issuer', template.issuer,
      'placement', template.placement,
      'revokedAt', certificate.revoked_at,
      'revocationReason', certificate.revocation_reason
    )
    from public.voiceup_participation_certificates certificate
    join public.voiceup_campaign_certificate_templates template
      on template.workspace_id = certificate.workspace_id
     and template.campaign_id = certificate.campaign_id
     and template.configuration_version = certificate.configuration_version
    where certificate.id = v_certificate.id
  );
end;
$$;

create or replace function public.voiceup_list_owned_participation_certificates()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', certificate.id,
      'certificateId', certificate.certificate_id,
      'campaignId', certificate.campaign_id,
      'campaignSlug', certificate.campaign_slug,
      'campaignName', certificate.campaign_name,
      'supporterDisplayName', certificate.supporter_display_name,
      'participationDate', certificate.participation_date,
      'issuedAt', certificate.issued_at,
      'status', certificate.status,
      'language', certificate.language,
      'configurationVersion', certificate.configuration_version,
      'verificationReference', certificate.verification_reference,
      'verificationPath', '/certificates/verify/' || certificate.certificate_id || '?ref=' || certificate.verification_reference,
      'artwork', jsonb_build_object(
        'url', template.artwork_url, 'storagePath', template.artwork_storage_path,
        'sha256', template.artwork_sha256, 'mimeType', template.artwork_mime_type,
        'width', template.artwork_width, 'height', template.artwork_height
      ),
      'wording', template.wording,
      'issuer', template.issuer,
      'placement', template.placement,
      'revokedAt', certificate.revoked_at,
      'revocationReason', certificate.revocation_reason
    ) order by certificate.issued_at desc)
    from public.voiceup_participation_certificates certificate
    join public.voiceup_supporter_accounts account
      on account.id = certificate.supporter_account_id
    join public.voiceup_campaign_certificate_templates template
      on template.workspace_id = certificate.workspace_id
     and template.campaign_id = certificate.campaign_id
     and template.configuration_version = certificate.configuration_version
    where account.auth_user_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.voiceup_revoke_participation_certificate(
  p_certificate_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_certificate public.voiceup_participation_certificates%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'voiceup:authentication_required';
  end if;
  select certificate.* into v_certificate
  from public.voiceup_participation_certificates certificate
  where certificate.certificate_id = upper(btrim(p_certificate_id))
  for update;
  if not found then
    raise exception using errcode = '02000', message = 'voiceup:certificate_not_found';
  end if;
  if not public.voiceup_is_exact_campaign_admin(
    v_certificate.workspace_id, v_certificate.campaign_id, v_certificate.campaign_slug, v_actor
  ) then
    raise exception using errcode = '42501', message = 'voiceup:campaign_admin_required';
  end if;
  if v_certificate.status = 'revoked' then
    return jsonb_build_object('ok', true, 'status', 'revoked', 'certificateId', v_certificate.certificate_id);
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 4 and 500 then
    raise exception using errcode = '22023', message = 'voiceup:invalid_revocation_reason';
  end if;

  update public.voiceup_participation_certificates
  set status = 'revoked', revoked_at = now(), revoked_by = v_actor,
      revocation_reason = btrim(p_reason)
  where id = v_certificate.id;
  insert into public.voiceup_certificate_audit (
    workspace_id, campaign_id, certificate_record_id, actor_id, event_type, outcome, metadata
  ) values (
    v_certificate.workspace_id, v_certificate.campaign_id, v_certificate.id,
    v_actor, 'certificate_revoked', 'revoked', jsonb_build_object('reason', btrim(p_reason))
  );
  return jsonb_build_object('ok', true, 'status', 'revoked', 'certificateId', v_certificate.certificate_id);
end;
$$;

create or replace function public.voiceup_verify_public_certificate(
  p_certificate_id text,
  p_verification_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_certificate public.voiceup_participation_certificates%rowtype;
begin
  if coalesce(p_certificate_id, '') !~ '^VUC-[A-F0-9]{20}$'
    or coalesce(p_verification_reference, '') !~ '^[0-9a-f]{64}$'
  then
    return jsonb_build_object('status', 'not_found');
  end if;
  select certificate.* into v_certificate
  from public.voiceup_participation_certificates certificate
  where certificate.certificate_id = p_certificate_id
    and certificate.verification_reference = p_verification_reference;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', v_certificate.status,
    'certificateId', v_certificate.certificate_id,
    'campaignName', v_certificate.campaign_name,
    'campaignSlug', v_certificate.campaign_slug,
    'participationDate', v_certificate.participation_date,
    'issuedAt', v_certificate.issued_at,
    'revokedAt', v_certificate.revoked_at
  );
end;
$$;

revoke all on function public.voiceup_read_campaign_certificate_settings(text, text, text)
  from public, anon, service_role;
grant execute on function public.voiceup_read_campaign_certificate_settings(text, text, text)
  to authenticated;
revoke all on function public.voiceup_save_campaign_certificate_settings(text, text, text, boolean, jsonb, jsonb, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.voiceup_save_campaign_certificate_settings(text, text, text, boolean, jsonb, jsonb, jsonb, jsonb)
  to authenticated;
revoke all on function public.voiceup_record_certificate_artwork_upload(text, text, text, text)
  from public, anon, service_role;
grant execute on function public.voiceup_record_certificate_artwork_upload(text, text, text, text)
  to authenticated;
revoke all on function public.voiceup_issue_owned_participation_certificate(uuid, text)
  from public, anon, service_role;
grant execute on function public.voiceup_issue_owned_participation_certificate(uuid, text)
  to authenticated;
revoke all on function public.voiceup_list_owned_participation_certificates()
  from public, anon, service_role;
grant execute on function public.voiceup_list_owned_participation_certificates()
  to authenticated;
revoke all on function public.voiceup_revoke_participation_certificate(text, text)
  from public, anon, service_role;
grant execute on function public.voiceup_revoke_participation_certificate(text, text)
  to authenticated;
revoke all on function public.voiceup_verify_public_certificate(text, text) from public;
grant execute on function public.voiceup_verify_public_certificate(text, text) to anon, authenticated, service_role;

-- GSAA is the first campaign-specific artwork assignment. It remains disabled
-- until that campaign's exact Campaign Admin enables issuance.
with gsaa as (
  select workspace.id as workspace_id, campaign ->> 'id' as campaign_id,
    lower(campaign ->> 'slug') as campaign_slug
  from public.voiceup_workspaces workspace,
    jsonb_array_elements(coalesce(workspace.data -> 'campaigns', '[]'::jsonb)) campaign
  where lower(coalesce(campaign ->> 'slug', '')) = 'gau-samman-ahvaan-abhiyan'
)
insert into public.voiceup_campaign_certificate_settings (
  workspace_id, campaign_id, campaign_slug, certificates_enabled,
  artwork_url, artwork_storage_path, artwork_sha256, artwork_mime_type,
  artwork_width, artwork_height, wording, issuer, placement, configuration_version
)
select workspace_id, campaign_id, campaign_slug, false,
  '/brands/gau-samman/gau-samman-participation-certificate-dynamic-background.png',
  'bundled/gau-samman/gau-samman-participation-certificate-dynamic-background.png',
  '1f6280d98519a2d2f000d78867c54159e04746e0773c317a6bee4b9fb53e1d83',
  'image/png', 1536, 1024,
  jsonb_build_object(
    'en', jsonb_build_object(
      'heading', 'Certificate of Participation', 'intro', 'This is to certify that',
      'acknowledgement', 'has actively participated in and supported this campaign', 'campaignLabel', 'Campaign',
      'participationDateLabel', 'Participation Date', 'certificateIdLabel', 'Certificate ID', 'issuerLabel', 'Issued by',
      'qrHeading', 'Verify & Share', 'qrInstructions', 'Scan this QR code to verify the certificate',
      'slogan', 'Together, every voice creates change', 'footer', 'Powered by VoiceUp Campaign Management'
    ),
    'hi', jsonb_build_object(
      'heading', 'सहभागिता प्रमाणपत्र', 'intro', 'यह प्रमाणित किया जाता है कि',
      'acknowledgement', 'ने इस अभियान में सक्रिय रूप से भाग लिया और समर्थन किया', 'campaignLabel', 'अभियान',
      'participationDateLabel', 'सहभागिता दिनांक', 'certificateIdLabel', 'प्रमाणपत्र आईडी', 'issuerLabel', 'जारीकर्ता',
      'qrHeading', 'सत्यापित करें और साझा करें', 'qrInstructions', 'प्रमाणपत्र सत्यापित करने के लिए QR कोड स्कैन करें',
      'slogan', 'मिलकर, हर आवाज़ बदलाव लाती है', 'footer', 'VoiceUp Campaign Management द्वारा संचालित'
    ),
    'or', jsonb_build_object(
      'heading', 'ଅଂଶଗ୍ରହଣ ପ୍ରମାଣପତ୍ର', 'intro', 'ଏହା ଦ୍ୱାରା ପ୍ରମାଣିତ କରାଯାଉଛି ଯେ',
      'acknowledgement', 'ଏହି ଅଭିଯାନରେ ସକ୍ରିୟ ଭାବେ ଅଂଶଗ୍ରହଣ ଏବଂ ସମର୍ଥନ କରିଛନ୍ତି', 'campaignLabel', 'ଅଭିଯାନ',
      'participationDateLabel', 'ଅଂଶଗ୍ରହଣ ତାରିଖ', 'certificateIdLabel', 'ପ୍ରମାଣପତ୍ର ଆଇଡି', 'issuerLabel', 'ଜାରିକର୍ତ୍ତା',
      'qrHeading', 'ଯାଞ୍ଚ ଓ ସେୟାର କରନ୍ତୁ', 'qrInstructions', 'ପ୍ରମାଣପତ୍ର ଯାଞ୍ଚ ପାଇଁ QR କୋଡ୍ ସ୍କାନ୍ କରନ୍ତୁ',
      'slogan', 'ମିଳିତ ଭାବେ, ପ୍ରତ୍ୟେକ ସ୍ୱର ପରିବର୍ତ୍ତନ ଆଣେ', 'footer', 'VoiceUp Campaign Management ଦ୍ୱାରା ପରିଚାଳିତ'
    )
  ),
  jsonb_build_object('name', 'Gau Samman Ahvaan Abhiyan', 'title', 'Campaign Issuer'),
  jsonb_build_object(
    'heading', jsonb_build_object('x', 50, 'y', 31.5, 'width', 44, 'fontSize', 23, 'align', 'center'),
    'intro', jsonb_build_object('x', 50, 'y', 35.6, 'width', 42, 'fontSize', 10, 'align', 'center'),
    'name', jsonb_build_object('x', 50, 'y', 40.5, 'width', 43, 'fontSize', 27, 'align', 'center'),
    'acknowledgement', jsonb_build_object('x', 50, 'y', 48.3, 'width', 46, 'fontSize', 11, 'align', 'center'),
    'campaignLabel', jsonb_build_object('x', 50, 'y', 52.1, 'width', 34, 'fontSize', 9.5, 'align', 'center'),
    'campaign', jsonb_build_object('x', 50, 'y', 56.5, 'width', 44, 'fontSize', 18, 'align', 'center'),
    'date', jsonb_build_object('x', 21.5, 'y', 76.4, 'width', 25, 'fontSize', 12, 'align', 'left'),
    'certificateId', jsonb_build_object('x', 21.5, 'y', 81.3, 'width', 25, 'fontSize', 12, 'align', 'left'),
    'issuer', jsonb_build_object('x', 21.5, 'y', 86.6, 'width', 25, 'fontSize', 11, 'align', 'left'),
    'qrHeading', jsonb_build_object('x', 87, 'y', 76.3, 'width', 16, 'fontSize', 11, 'align', 'center'),
    'qrInstructions', jsonb_build_object('x', 87, 'y', 82, 'width', 16.5, 'fontSize', 9, 'align', 'center'),
    'slogan', jsonb_build_object('x', 50, 'y', 64.2, 'width', 48, 'fontSize', 11, 'align', 'center'),
    'footer', jsonb_build_object('x', 50, 'y', 95.1, 'width', 25, 'fontSize', 10, 'align', 'center'),
    'qr', jsonb_build_object('x', 68.2, 'y', 74.7, 'width', 10)
  ), 1
from gsaa
on conflict (workspace_id, campaign_id) do nothing;

insert into public.voiceup_campaign_certificate_templates (
  workspace_id, campaign_id, configuration_version, campaign_slug,
  certificates_enabled, artwork_url, artwork_storage_path, artwork_sha256,
  artwork_mime_type, artwork_width, artwork_height, wording, issuer, placement
)
select setting.workspace_id, setting.campaign_id, setting.configuration_version, setting.campaign_slug,
  setting.certificates_enabled, setting.artwork_url, setting.artwork_storage_path,
  setting.artwork_sha256, setting.artwork_mime_type, setting.artwork_width,
  setting.artwork_height, setting.wording, setting.issuer, setting.placement
from public.voiceup_campaign_certificate_settings setting
where setting.campaign_slug = 'gau-samman-ahvaan-abhiyan'
  and setting.artwork_storage_path = 'bundled/gau-samman/gau-samman-participation-certificate-dynamic-background.png'
on conflict (workspace_id, campaign_id, configuration_version) do nothing;

comment on table public.voiceup_campaign_certificate_settings is
  'Campaign-scoped certificate settings. Direct writes are forbidden; only the exact active Campaign Admin may use the secured functions.';
comment on table public.voiceup_campaign_certificate_templates is
  'Immutable configuration snapshots retained so issued certificates survive later artwork and wording changes.';
comment on table public.voiceup_participation_certificates is
  'Idempotent certificate issuance records bound to canonical supporter ownership mappings and verified campaign participation.';
comment on function public.voiceup_verify_public_certificate(text, text) is
  'Returns a minimal public validity response and never exposes supporter contact data or internal account identifiers.';

notify pgrst, 'reload schema';
commit;
