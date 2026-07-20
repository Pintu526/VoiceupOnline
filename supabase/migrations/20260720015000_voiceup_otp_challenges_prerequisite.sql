BEGIN;

create extension if not exists pgcrypto;

-- Fail before creating anything when the repository's authoritative workspace
-- and shared normalization prerequisites have not been provisioned.
do $prerequisites$
declare
  required_column record;
begin
  if to_regclass('public.voiceup_workspaces') is null then
    raise exception 'OTP prerequisite failed: public.voiceup_workspaces is missing.';
  end if;
  if to_regclass('public.voiceup_workspace_members') is null then
    raise exception 'OTP prerequisite failed: public.voiceup_workspace_members is missing.';
  end if;
  if to_regprocedure('public.voiceup_is_platform_admin()') is null then
    raise exception 'OTP prerequisite failed: public.voiceup_is_platform_admin() is missing.';
  end if;
  if to_regprocedure('public.voiceup_normalize_indian_phone(text)') is null then
    raise exception 'OTP prerequisite failed: public.voiceup_normalize_indian_phone(text) is missing.';
  end if;
  if to_regprocedure('public.voiceup_normalize_email(text)') is null then
    raise exception 'OTP prerequisite failed: public.voiceup_normalize_email(text) is missing.';
  end if;
  if to_regprocedure('public.voiceup_normalize_person_name(text)') is null then
    raise exception 'OTP prerequisite failed: public.voiceup_normalize_person_name(text) is missing.';
  end if;

  for required_column in
    select *
    from (values
      ('voiceup_workspaces', 'id'),
      ('voiceup_workspaces', 'data'),
      ('voiceup_workspace_members', 'workspace_id'),
      ('voiceup_workspace_members', 'user_id'),
      ('voiceup_workspace_members', 'role'),
      ('voiceup_workspace_members', 'active')
    ) as expected(table_name, column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns column_info
      where column_info.table_schema = 'public'
        and column_info.table_name = required_column.table_name
        and column_info.column_name = required_column.column_name
    ) then
      raise exception 'OTP prerequisite failed: required column public.%.% is missing.',
        required_column.table_name,
        required_column.column_name;
    end if;
  end loop;
end
$prerequisites$;

-- An existing table is accepted only when it already satisfies the contract.
-- Incompatible schemas fail closed; this migration never rewrites or removes
-- existing OTP rows or columns.
do $compatibility$
declare
  required_column record;
  actual_type text;
  actual_nullable text;
  actual_default text;
begin
  if to_regclass('public.voiceup_otp_challenges') is null then
    return;
  end if;

  for required_column in
    select *
    from (values
      ('id', 'uuid', 'NO'),
      ('workspace_id', 'text', 'NO'),
      ('phone_hash', 'text', 'NO'),
      ('code_hash', 'text', 'NO'),
      ('purpose', 'text', 'NO'),
      ('metadata', 'jsonb', 'NO'),
      ('sent_count', 'int4', 'NO'),
      ('attempt_count', 'int4', 'NO'),
      ('expires_at', 'timestamptz', 'NO'),
      ('verified_at', 'timestamptz', 'YES'),
      ('created_at', 'timestamptz', 'NO')
    ) as expected(column_name, udt_name, is_nullable)
  loop
    select column_info.udt_name, column_info.is_nullable
      into actual_type, actual_nullable
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'voiceup_otp_challenges'
      and column_info.column_name = required_column.column_name;

    if not found then
      raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges is missing required column %.',
        required_column.column_name;
    end if;
    if actual_type <> required_column.udt_name or actual_nullable <> required_column.is_nullable then
      raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges.% has incompatible type or nullability.',
        required_column.column_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_constraint constraint_info
    join pg_attribute attribute_info
      on attribute_info.attrelid = constraint_info.conrelid
      and attribute_info.attnum = constraint_info.conkey[1]
    where constraint_info.conrelid = 'public.voiceup_otp_challenges'::regclass
      and constraint_info.contype = 'p'
      and cardinality(constraint_info.conkey) = 1
      and attribute_info.attname = 'id'
  ) then
    raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges must have id as its primary key.';
  end if;

  select column_info.column_default into actual_default
  from information_schema.columns column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'voiceup_otp_challenges'
    and column_info.column_name = 'id';
  if actual_default is null or actual_default not ilike '%gen_random_uuid()%' then
    raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges.id has an incompatible default.';
  end if;

  select column_info.column_default into actual_default
  from information_schema.columns column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'voiceup_otp_challenges'
    and column_info.column_name = 'metadata';
  if actual_default is null or replace(actual_default, ' ', '') <> '''{}''::jsonb' then
    raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges.metadata has an incompatible default.';
  end if;

  select column_info.column_default into actual_default
  from information_schema.columns column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'voiceup_otp_challenges'
    and column_info.column_name = 'sent_count';
  if actual_default is null or actual_default::text <> '1' then
    raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges.sent_count has an incompatible default.';
  end if;

  select column_info.column_default into actual_default
  from information_schema.columns column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'voiceup_otp_challenges'
    and column_info.column_name = 'attempt_count';
  if actual_default is null or actual_default::text <> '0' then
    raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges.attempt_count has an incompatible default.';
  end if;

  select column_info.column_default into actual_default
  from information_schema.columns column_info
  where column_info.table_schema = 'public'
    and column_info.table_name = 'voiceup_otp_challenges'
    and column_info.column_name = 'created_at';
  if actual_default is null or actual_default not ilike '%now()%' then
    raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges.created_at has an incompatible default.';
  end if;

  if exists (
    select 1
    from public.voiceup_otp_challenges challenge
    where challenge.purpose not in ('public-signing', 'onboarding', 'coordinator-mobile')
  ) then
    raise exception 'OTP prerequisite failed: existing public.voiceup_otp_challenges contains unsupported purpose values.';
  end if;
end
$compatibility$;

-- There is intentionally no workspace foreign key here: this matches the
-- existing repository contract used by public signing and onboarding OTPs.
create table if not exists public.voiceup_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  phone_hash text not null,
  code_hash text not null,
  purpose text not null,
  metadata jsonb not null default '{}'::jsonb,
  sent_count integer not null default 1,
  attempt_count integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint voiceup_otp_challenges_purpose_check
    check (purpose in ('public-signing', 'onboarding', 'coordinator-mobile'))
);

create index if not exists voiceup_otp_challenges_lookup_idx
  on public.voiceup_otp_challenges (workspace_id, phone_hash, purpose, created_at desc);

do $index_compatibility$
declare
  index_definition text;
begin
  select pg_get_indexdef(index_info.indexrelid)
    into index_definition
  from pg_index index_info
  join pg_class index_class on index_class.oid = index_info.indexrelid
  join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
  where index_namespace.nspname = 'public'
    and index_class.relname = 'voiceup_otp_challenges_lookup_idx';

  if index_definition is null
    or replace(lower(index_definition), ' ', '') not like '%(workspace_id,phone_hash,purpose,created_atdesc)%'
  then
    raise exception 'OTP prerequisite failed: voiceup_otp_challenges_lookup_idx has an incompatible definition.';
  end if;
end
$index_compatibility$;

alter table public.voiceup_otp_challenges enable row level security;

revoke all on table public.voiceup_otp_challenges from anon, authenticated;
grant all on table public.voiceup_otp_challenges to service_role;

COMMIT;
