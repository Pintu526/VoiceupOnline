begin;

-- Global, versioned canonical geography. This schema is intentionally separate
-- from tenant, campaign, workspace, and public browser-facing application data.
create schema location;

comment on schema location is
  'Read-only canonical Location Platform data; not tenant or campaign data and not browser exposed.';

revoke all on schema location from public;
revoke all on schema location from anon, authenticated;
grant usage on schema location to service_role;

create table location.datasets (
  id uuid primary key default gen_random_uuid(),
  authority text not null check (length(btrim(authority)) > 0),
  source_dataset text not null check (length(btrim(source_dataset)) > 0),
  dataset_version text not null check (length(btrim(dataset_version)) > 0),
  effective_date date not null,
  checksum_algorithm text not null default 'sha256' check (length(btrim(checksum_algorithm)) > 0),
  checksum text not null check (length(btrim(checksum)) > 0),
  status text not null default 'staged'
    check (status in ('staged', 'validated', 'active', 'superseded', 'retired', 'failed')),
  activated_at timestamptz,
  activated_by text,
  activation_metadata jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (authority, source_dataset, dataset_version)
);

create table location.source_artifacts (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references location.datasets(id) on delete restrict,
  source_uri text not null check (length(btrim(source_uri)) > 0),
  filename text not null check (length(btrim(filename)) > 0),
  checksum_algorithm text not null default 'sha256' check (length(btrim(checksum_algorithm)) > 0),
  checksum text not null check (length(btrim(checksum)) > 0),
  retrieved_at timestamptz,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (dataset_id, checksum)
);

create table location.nodes (
  dataset_id uuid not null references location.datasets(id) on delete restrict,
  node_id text not null check (length(btrim(node_id)) > 0),
  official_code text,
  level text not null
    check (level in ('country', 'state', 'district', 'block', 'local_body', 'village', 'ward')),
  entity_kind text not null check (length(btrim(entity_kind)) > 0),
  display_name text not null check (length(btrim(display_name)) > 0),
  display_name_normalized text not null check (length(btrim(display_name_normalized)) > 0),
  source_metadata jsonb not null default '{}'::jsonb,
  parentage_status text not null default 'not_applicable'
    check (parentage_status in ('supported', 'ambiguous', 'unresolved', 'not_applicable')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (dataset_id, node_id)
);

create table location.relationships (
  dataset_id uuid not null,
  child_node_id text not null,
  parent_node_id text not null,
  relationship_type text not null check (length(btrim(relationship_type)) > 0),
  source_artifact_id uuid not null references location.source_artifacts(id) on delete restrict,
  source_evidence jsonb not null,
  created_at timestamptz not null default now(),
  primary key (dataset_id, child_node_id, parent_node_id, relationship_type),
  foreign key (dataset_id, child_node_id)
    references location.nodes(dataset_id, node_id) on delete restrict,
  foreign key (dataset_id, parent_node_id)
    references location.nodes(dataset_id, node_id) on delete restrict,
  check (child_node_id <> parent_node_id),
  check (jsonb_typeof(source_evidence) = 'object')
);

-- Closure rows are derived only from explicit, source-evidenced relationships.
create table location.lineage (
  dataset_id uuid not null,
  descendant_node_id text not null,
  ancestor_node_id text not null,
  depth smallint not null check (depth > 0),
  derivation text not null default 'derived_from_explicit_relationships'
    check (derivation = 'derived_from_explicit_relationships'),
  created_at timestamptz not null default now(),
  primary key (dataset_id, descendant_node_id, ancestor_node_id),
  foreign key (dataset_id, descendant_node_id)
    references location.nodes(dataset_id, node_id) on delete restrict,
  foreign key (dataset_id, ancestor_node_id)
    references location.nodes(dataset_id, node_id) on delete restrict,
  check (descendant_node_id <> ancestor_node_id)
);

-- Releases select an approved immutable dataset without replacing historical versions.
create table location.dataset_releases (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null check (length(btrim(scope_key)) > 0),
  geographic_scope text not null check (length(btrim(geographic_scope)) > 0),
  authority text not null check (length(btrim(authority)) > 0),
  source_dataset text not null check (length(btrim(source_dataset)) > 0),
  dataset_id uuid not null references location.datasets(id) on delete restrict,
  is_active boolean not null default true,
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  activation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (scope_key, dataset_id),
  check ((is_active and deactivated_at is null) or (not is_active))
);

create index location_source_artifacts_dataset_idx
  on location.source_artifacts (dataset_id);
create index location_datasets_active_lookup_idx
  on location.datasets (authority, source_dataset, status)
  where status = 'active';
create index location_nodes_official_code_idx
  on location.nodes (dataset_id, official_code)
  where official_code is not null;
create index location_nodes_level_entity_kind_idx
  on location.nodes (dataset_id, level, entity_kind)
  where active;
create index location_nodes_normalized_name_idx
  on location.nodes (dataset_id, display_name_normalized, level)
  where active;
create index location_relationships_child_idx
  on location.relationships (dataset_id, child_node_id);
create index location_relationships_parent_idx
  on location.relationships (dataset_id, parent_node_id);
create index location_lineage_descendant_idx
  on location.lineage (dataset_id, descendant_node_id, depth);
create index location_lineage_ancestor_idx
  on location.lineage (dataset_id, ancestor_node_id, descendant_node_id);
create unique index location_dataset_releases_one_active_scope_idx
  on location.dataset_releases (scope_key)
  where is_active;

alter table location.datasets enable row level security;
alter table location.source_artifacts enable row level security;
alter table location.nodes enable row level security;
alter table location.relationships enable row level security;
alter table location.lineage enable row level security;
alter table location.dataset_releases enable row level security;

revoke all on all tables in schema location from public;
revoke all on all tables in schema location from anon, authenticated;
grant select on all tables in schema location to service_role;

comment on table location.nodes is
  'Global canonical administrative nodes; identity is dataset_id plus node_id, never display_name.';
comment on table location.relationships is
  'Only explicit, source-evidenced official relationships; absent evidence must remain absent.';
comment on table location.lineage is
  'Derived closure from explicit canonical relationships; no inferred lineage is permitted.';
comment on table location.dataset_releases is
  'Active dataset pointer by source/geographic scope; historical datasets are preserved.';

commit;
