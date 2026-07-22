BEGIN;

-- This helper's authorization contract is owned by supabase-schema.sql. Keep
-- its external dependencies fail-closed instead of manufacturing membership
-- or authentication structures in this prerequisite migration.
do $prerequisites$
declare
  required_table record;
  required_column record;
  actual_type text;
  auth_uid_return_type regtype;
begin
  if to_regnamespace('public') is null then
    raise exception 'Platform admin prerequisite failed: schema public is missing.';
  end if;
  if to_regnamespace('auth') is null then
    raise exception 'Platform admin prerequisite failed: Supabase auth schema is missing.';
  end if;

  for required_table in
    select *
    from (values
      ('organization_members'),
      ('voiceup_workspace_members')
    ) as expected(table_name)
  loop
    if not exists (
      select 1
      from pg_class table_info
      join pg_namespace table_schema on table_schema.oid = table_info.relnamespace
      where table_schema.nspname = 'public'
        and table_info.relname = required_table.table_name
        and table_info.relkind in ('r', 'p')
    ) then
      raise exception 'Platform admin prerequisite failed: required table public.% is missing or incompatible.',
        required_table.table_name;
    end if;
  end loop;

  for required_column in
    select *
    from (values
      ('organization_members', 'user_id', 'uuid'),
      ('organization_members', 'role', 'text'),
      ('voiceup_workspace_members', 'user_id', 'uuid'),
      ('voiceup_workspace_members', 'role', 'text')
    ) as expected(table_name, column_name, udt_name)
  loop
    select column_info.udt_name
      into actual_type
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = required_column.table_name
      and column_info.column_name = required_column.column_name;

    if not found then
      raise exception 'Platform admin prerequisite failed: required column public.%.% is missing.',
        required_column.table_name,
        required_column.column_name;
    end if;
    if actual_type <> required_column.udt_name then
      raise exception 'Platform admin prerequisite failed: public.%.% must use type %, found %.',
        required_column.table_name,
        required_column.column_name,
        required_column.udt_name,
        actual_type;
    end if;
  end loop;

  if to_regprocedure('auth.uid()') is null then
    raise exception 'Platform admin prerequisite failed: Supabase function auth.uid() is missing.';
  end if;

  select function_info.prorettype::regtype
    into auth_uid_return_type
  from pg_proc function_info
  where function_info.oid = to_regprocedure('auth.uid()');

  if auth_uid_return_type <> 'uuid'::regtype then
    raise exception 'Platform admin prerequisite failed: auth.uid() must return uuid, found %.',
      auth_uid_return_type;
  end if;
end
$prerequisites$;

-- Preserve an existing compatible function. Reject contract drift instead of
-- silently replacing authorization behavior.
do $existing_function_compatibility$
declare
  function_oid oid := to_regprocedure('public.voiceup_is_platform_admin()');
  function_return_type regtype;
  function_returns_set boolean;
  function_kind "char";
  function_argument_count smallint;
  function_language name;
  function_security_definer boolean;
  function_volatility "char";
  function_config text[];
  normalized_source text;
  expected_source constant text := regexp_replace(lower(btrim($contract$
  select exists (
    select 1
    from public.organization_members member
    where member.user_id = auth.uid()
      and member.role = 'platform_owner'
  ) or exists (
    select 1
    from public.voiceup_workspace_members member
    where member.user_id = auth.uid()
      and member.role = 'platform_owner'
  );
$contract$)), '\s+', ' ', 'g');
begin
  if function_oid is null then
    return;
  end if;

  select
    function_info.prorettype::regtype,
    function_info.proretset,
    function_info.prokind,
    function_info.pronargs,
    function_language_info.lanname,
    function_info.prosecdef,
    function_info.provolatile,
    function_info.proconfig,
    regexp_replace(lower(btrim(function_info.prosrc)), '\s+', ' ', 'g')
  into
    function_return_type,
    function_returns_set,
    function_kind,
    function_argument_count,
    function_language,
    function_security_definer,
    function_volatility,
    function_config,
    normalized_source
  from pg_proc function_info
  join pg_language function_language_info on function_language_info.oid = function_info.prolang
  where function_info.oid = function_oid;

  if function_return_type <> 'boolean'::regtype
    or function_returns_set
    or function_kind <> 'f'
    or function_argument_count <> 0
  then
    raise exception 'Platform admin prerequisite failed: existing public.voiceup_is_platform_admin() has an incompatible signature or return type.';
  end if;

  if function_language <> 'sql'
    or not function_security_definer
    or function_volatility <> 's'
    or function_config is null
    or not (function_config @> array['search_path=public'])
    or normalized_source <> expected_source
  then
    raise exception 'Platform admin prerequisite failed: existing public.voiceup_is_platform_admin() does not match the repository authorization contract.';
  end if;
end
$existing_function_compatibility$;

do $create_platform_admin_function$
begin
  if to_regprocedure('public.voiceup_is_platform_admin()') is null then
    execute $definition$
create function public.voiceup_is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $function$
  select exists (
    select 1
    from public.organization_members member
    where member.user_id = auth.uid()
      and member.role = 'platform_owner'
  ) or exists (
    select 1
    from public.voiceup_workspace_members member
    where member.user_id = auth.uid()
      and member.role = 'platform_owner'
  );
$function$;
$definition$;
  end if;
end
$create_platform_admin_function$;

COMMIT;
