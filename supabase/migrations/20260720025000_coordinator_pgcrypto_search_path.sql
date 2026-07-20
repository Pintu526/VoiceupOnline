BEGIN;

-- Supabase installs pgcrypto in its managed extensions schema. The frozen
-- Coordinator functions intentionally pin their search_path, so make that
-- extension schema visible without replacing either function body.
do $coordinator_pgcrypto_search_path$
declare
  pgcrypto_schema name;
  digest_function_oid oid;
  digest_return_type regtype;
  required_function record;
  required_function_oid oid;
  actual_return_type regtype;
begin
  select extension_schema.nspname
    into pgcrypto_schema
  from pg_extension extension_info
  join pg_namespace extension_schema on extension_schema.oid = extension_info.extnamespace
  where extension_info.extname = 'pgcrypto';

  if pgcrypto_schema is null then
    raise exception 'Coordinator pgcrypto prerequisite failed: extension pgcrypto is not installed.';
  end if;

  digest_function_oid := to_regprocedure(format('%I.digest(text,text)', pgcrypto_schema));
  if digest_function_oid is null then
    raise exception 'Coordinator pgcrypto prerequisite failed: %.digest(text,text) is missing.',
      pgcrypto_schema;
  end if;

  select function_info.prorettype::regtype
    into digest_return_type
  from pg_proc function_info
  where function_info.oid = digest_function_oid;

  if digest_return_type <> 'bytea'::regtype then
    raise exception 'Coordinator pgcrypto prerequisite failed: %.digest(text,text) must return bytea, found %.',
      pgcrypto_schema,
      digest_return_type;
  end if;

  for required_function in
    select *
    from (values
      (
        'public.voiceup_consume_coordinator_mobile_verification(text,text,text)',
        'boolean'
      ),
      (
        'public.upsert_voiceup_coordinator(text,jsonb,jsonb,text[],text)',
        'jsonb'
      )
    ) as expected(signature, return_type)
  loop
    required_function_oid := to_regprocedure(required_function.signature);
    if required_function_oid is null then
      raise exception 'Coordinator pgcrypto prerequisite failed: required function % is missing.',
        required_function.signature;
    end if;

    select function_info.prorettype::regtype
      into actual_return_type
    from pg_proc function_info
    where function_info.oid = required_function_oid;

    if actual_return_type <> required_function.return_type::regtype then
      raise exception 'Coordinator pgcrypto prerequisite failed: function % must return %, found %.',
        required_function.signature,
        required_function.return_type,
        actual_return_type;
    end if;
  end loop;

  execute format(
    'alter function public.voiceup_consume_coordinator_mobile_verification(text,text,text) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
  execute format(
    'alter function public.upsert_voiceup_coordinator(text,jsonb,jsonb,text[],text) set search_path = public, %I, pg_temp',
    pgcrypto_schema
  );
end
$coordinator_pgcrypto_search_path$;

COMMIT;
