BEGIN;

-- Preserve the pgcrypto-aware search path established by the preceding
-- Coordinator fix while replacing only the ambiguous PL/pgSQL identifier.
do $coordinator_phone_hash_ambiguity$
declare
  pgcrypto_schema name;
  digest_function_oid oid;
  digest_return_type regtype;
  verification_function_oid oid;
  verification_return_type regtype;
begin
  select extension_schema.nspname
    into pgcrypto_schema
  from pg_extension extension_info
  join pg_namespace extension_schema on extension_schema.oid = extension_info.extnamespace
  where extension_info.extname = 'pgcrypto';

  if pgcrypto_schema is null then
    raise exception 'Coordinator phone hash fix prerequisite failed: extension pgcrypto is not installed.';
  end if;

  digest_function_oid := to_regprocedure(format('%I.digest(text,text)', pgcrypto_schema));
  if digest_function_oid is null then
    raise exception 'Coordinator phone hash fix prerequisite failed: %.digest(text,text) is missing.',
      pgcrypto_schema;
  end if;

  select function_info.prorettype::regtype
    into digest_return_type
  from pg_proc function_info
  where function_info.oid = digest_function_oid;

  if digest_return_type <> 'bytea'::regtype then
    raise exception 'Coordinator phone hash fix prerequisite failed: %.digest(text,text) must return bytea, found %.',
      pgcrypto_schema,
      digest_return_type;
  end if;

  verification_function_oid := to_regprocedure(
    'public.voiceup_consume_coordinator_mobile_verification(text,text,text)'
  );
  if verification_function_oid is null then
    raise exception 'Coordinator phone hash fix prerequisite failed: required function public.voiceup_consume_coordinator_mobile_verification(text,text,text) is missing.';
  end if;

  select function_info.prorettype::regtype
    into verification_return_type
  from pg_proc function_info
  where function_info.oid = verification_function_oid;

  if verification_return_type <> 'boolean'::regtype then
    raise exception 'Coordinator phone hash fix prerequisite failed: function public.voiceup_consume_coordinator_mobile_verification(text,text,text) must return boolean, found %.',
      verification_return_type;
  end if;

  execute format($function_definition$
    create or replace function public.voiceup_consume_coordinator_mobile_verification(
      target_workspace_id text,
      normalized_phone text,
      verification_token text
    )
    returns boolean
    language plpgsql
    security definer
    set search_path = public, %I, pg_temp
    as $function_body$
    declare
      challenge_id uuid;
      expected_phone_hash text := encode(digest(target_workspace_id || ':' || normalized_phone, 'sha256'), 'hex');
      token_hash text := encode(digest(coalesce(verification_token, ''), 'sha256'), 'hex');
    begin
      if coalesce(verification_token, '') = '' then return false; end if;
      select challenge.id into challenge_id
      from public.voiceup_otp_challenges challenge
      where challenge.workspace_id = target_workspace_id
        and challenge.phone_hash = expected_phone_hash
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
    $function_body$;
  $function_definition$, pgcrypto_schema);
end
$coordinator_phone_hash_ambiguity$;

COMMIT;
