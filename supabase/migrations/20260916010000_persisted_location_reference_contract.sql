-- Step 11B foundation only. This helper checks the persisted envelope shape;
-- it does not authenticate canonical identity, resolve labels, or mutate data.
create function public.voiceup_is_persisted_location_reference_v1_shape(candidate jsonb)
returns boolean
language sql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
  select
    pg_catalog.jsonb_typeof(candidate) = 'object'
    and candidate ->> 'schemaVersion' = 'voiceup.location-reference/v1'
    and candidate ->> 'verificationState' in (
      'canonical_verified',
      'unverified_custom',
      'legacy_unresolved',
      'unverified_observation'
    )
    and pg_catalog.octet_length(candidate::text) <= 16384
    and (
      (
        candidate ->> 'verificationState' = 'canonical_verified'
        and pg_catalog.jsonb_typeof(candidate -> 'canonicalNodeId') = 'string'
        and pg_catalog.jsonb_typeof(candidate -> 'labelSnapshot') = 'string'
        and pg_catalog.jsonb_typeof(candidate -> 'level') = 'string'
        and pg_catalog.jsonb_typeof(candidate -> 'entityKind') = 'string'
        and pg_catalog.jsonb_typeof(candidate -> 'authority') = 'string'
        and pg_catalog.jsonb_typeof(candidate -> 'sourceDataset') = 'string'
        and pg_catalog.jsonb_typeof(candidate -> 'datasetVersion') = 'string'
        and candidate ? 'officialCode'
        and (candidate -> 'officialCode' = 'null'::jsonb or pg_catalog.jsonb_typeof(candidate -> 'officialCode') = 'string')
        and pg_catalog.jsonb_typeof(candidate -> 'parents') = 'array'
        and pg_catalog.jsonb_array_length(candidate -> 'parents') <= 8
        and pg_catalog.jsonb_typeof(candidate -> 'lineageSnapshot') = 'array'
        and pg_catalog.jsonb_array_length(candidate -> 'lineageSnapshot') <= 16
        and pg_catalog.jsonb_typeof(candidate -> 'validation') = 'object'
      )
      or
      (
        candidate ->> 'verificationState' in ('unverified_custom', 'legacy_unresolved', 'unverified_observation')
        and candidate ? 'canonicalNodeId'
        and candidate -> 'canonicalNodeId' = 'null'::jsonb
        and candidate ? 'officialCode'
        and candidate -> 'officialCode' = 'null'::jsonb
        and not candidate ?| array['authority', 'sourceDataset', 'datasetVersion']
      )
    );
$function$;

comment on function public.voiceup_is_persisted_location_reference_v1_shape(jsonb) is
  'Step 11B structural precheck only; canonical trust validation belongs to Step 11C.';

revoke all on function public.voiceup_is_persisted_location_reference_v1_shape(jsonb) from public;
revoke all on function public.voiceup_is_persisted_location_reference_v1_shape(jsonb) from anon;
revoke all on function public.voiceup_is_persisted_location_reference_v1_shape(jsonb) from authenticated;
grant execute on function public.voiceup_is_persisted_location_reference_v1_shape(jsonb) to service_role;

