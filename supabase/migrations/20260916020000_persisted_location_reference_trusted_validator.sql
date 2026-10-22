-- Step 11C trusted canonical validator. This is additive and read-only: it
-- verifies a canonical claim against the exact active canonical dataset and
-- returns a bounded reference rebuilt from trusted canonical rows.
create function public.voiceup_validate_persisted_location_reference_v1(candidate jsonb)
returns jsonb
language plpgsql
stable
strict
security invoker
set search_path = pg_catalog
as $function$
declare
  trusted_dataset_id uuid;
  trusted_node_id text;
  trusted_official_code text;
  trusted_label text;
  trusted_level text;
  trusted_entity_kind text;
  trusted_parents jsonb;
  claimed_parents jsonb;
  trusted_lineage jsonb;
begin
  if not public.voiceup_is_persisted_location_reference_v1_shape(candidate)
     or candidate ->> 'verificationState' <> 'canonical_verified' then
    raise exception using errcode = '22023', message = 'INVALID_PERSISTED_LOCATION_REFERENCE';
  end if;

  -- Exact tuple plus node ID is the lookup key. Labels are never lookup keys.
  select d.id
    into trusted_dataset_id
    from location.datasets d
    where d.authority = candidate ->> 'authority'
      and d.source_dataset = candidate ->> 'sourceDataset'
      and d.dataset_version = candidate ->> 'datasetVersion'
      and d.status = 'active'
      and exists (
        select 1
          from location.dataset_releases r
          where r.dataset_id = d.id
            and r.authority = d.authority
            and r.source_dataset = d.source_dataset
            and r.is_active
      )
    limit 1;

  if trusted_dataset_id is null then
    raise exception using errcode = '22023', message = 'ACTIVE_DATASET_MISMATCH';
  end if;

  select n.node_id, n.official_code, n.display_name, n.level, n.entity_kind
    into trusted_node_id, trusted_official_code, trusted_label, trusted_level, trusted_entity_kind
    from location.nodes n
    where n.dataset_id = trusted_dataset_id
      and n.node_id = candidate ->> 'canonicalNodeId'
      and n.active;

  if trusted_node_id is null then
    raise exception using errcode = '22023', message = 'CANONICAL_NODE_NOT_FOUND';
  end if;
  if trusted_official_code is distinct from candidate ->> 'officialCode' then
    raise exception using errcode = '22023', message = 'OFFICIAL_CODE_MISMATCH';
  end if;
  if trusted_label is distinct from candidate ->> 'labelSnapshot' then
    raise exception using errcode = '22023', message = 'LABEL_MISMATCH';
  end if;
  if trusted_level is distinct from candidate ->> 'level' then
    raise exception using errcode = '22023', message = 'LEVEL_MISMATCH';
  end if;
  if trusted_entity_kind is distinct from candidate ->> 'entityKind' then
    raise exception using errcode = '22023', message = 'ENTITY_KIND_MISMATCH';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'canonicalNodeId', parent_node_id,
        'officialCode', official_code,
        'labelSnapshot', display_name,
        'level', level,
        'entityKind', entity_kind
      ) order by parent_node_id
    ),
    '[]'::jsonb
  )
    into trusted_parents
    from (
      select distinct p.node_id as parent_node_id, p.official_code, p.display_name, p.level, p.entity_kind
        from location.relationships rel
        join location.nodes p
          on p.dataset_id = rel.dataset_id
         and p.node_id = rel.parent_node_id
         and p.active
        where rel.dataset_id = trusted_dataset_id
          and rel.child_node_id = trusted_node_id
    ) immediate_parents;

  select coalesce(jsonb_agg(parent_claim order by parent_claim ->> 'canonicalNodeId'), '[]'::jsonb)
    into claimed_parents
    from jsonb_array_elements(candidate -> 'parents') parent_claim;

  if claimed_parents is distinct from trusted_parents then
    raise exception using errcode = '22023', message = 'PARENTS_MISMATCH';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'canonicalNodeId', ancestor_node_id,
        'officialCode', official_code,
        'labelSnapshot', display_name,
        'level', level,
        'entityKind', entity_kind
      ) order by depth desc, ancestor_node_id
    ),
    '[]'::jsonb
  )
    into trusted_lineage
    from (
      select l.ancestor_node_id, l.depth, a.official_code, a.display_name, a.level, a.entity_kind
        from location.lineage l
        join location.nodes a
          on a.dataset_id = l.dataset_id
         and a.node_id = l.ancestor_node_id
         and a.active
        where l.dataset_id = trusted_dataset_id
          and l.descendant_node_id = trusted_node_id
    ) ordered_ancestors;

  if candidate -> 'lineageSnapshot' is distinct from trusted_lineage then
    raise exception using errcode = '22023', message = 'LINEAGE_MISMATCH';
  end if;

  return jsonb_build_object(
    'schemaVersion', 'voiceup.location-reference/v1',
    'verificationState', 'canonical_verified',
    'canonicalNodeId', trusted_node_id,
    'officialCode', trusted_official_code,
    'labelSnapshot', trusted_label,
    'level', trusted_level,
    'entityKind', trusted_entity_kind,
    'authority', candidate ->> 'authority',
    'sourceDataset', candidate ->> 'sourceDataset',
    'datasetVersion', candidate ->> 'datasetVersion',
    'parents', trusted_parents,
    'lineageSnapshot', trusted_lineage,
    'validation', jsonb_build_object(
      'validatedAt', to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'validatorVersion', 'location-db-v1'
    )
  );
end;
$function$;

comment on function public.voiceup_validate_persisted_location_reference_v1(jsonb) is
  'Step 11C server-only validator: exact active dataset/node validation with trusted snapshot rebuild; never resolves by label.';

revoke all on function public.voiceup_validate_persisted_location_reference_v1(jsonb) from public;
revoke all on function public.voiceup_validate_persisted_location_reference_v1(jsonb) from anon;
revoke all on function public.voiceup_validate_persisted_location_reference_v1(jsonb) from authenticated;
grant execute on function public.voiceup_validate_persisted_location_reference_v1(jsonb) to service_role;
