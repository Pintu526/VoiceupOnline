import type {
  CanonicalLocationNode,
  LocationLineageEntry,
  LocationParentReference,
  LocationSource
} from "./LocationApiTypes.ts";
import type {
  CanonicalLocationDatasetMetadata,
  CanonicalLocationDatasetSelection,
  CanonicalLocationRepository,
  CanonicalLocationSearch
} from "./CanonicalLocationRepository.ts";

/** A parameterized, read-only PostgreSQL query boundary supplied by the host. */
export interface PostgresReadOnlyQueryExecutor {
  query<Row extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[]
  ): Promise<readonly Row[]>;
}

interface DatasetRow extends Record<string, unknown> {
  id: string;
  authority: string;
  source_dataset: string;
  dataset_version: string;
  effective_date: string;
  checksum: string;
  status: CanonicalLocationDatasetMetadata["status"];
}

interface NodeRow extends Record<string, unknown> {
  node_id: string;
  official_code: string | null;
  level: CanonicalLocationNode["level"];
  entity_kind: string;
  display_name: string;
  source_metadata: Record<string, unknown> | string;
}

interface ParentRow extends Record<string, unknown> {
  child_node_id: string;
  node_id: string;
  official_code: string | null;
  level: CanonicalLocationNode["level"];
  relationship_type: "administrative_parent" | "official_containment";
}

interface LineageRow extends NodeRow {
  descendant_node_id: string;
  depth: number;
}

const maxCollectionLimit = 100;

function limit(value: number | undefined): number {
  if (!Number.isInteger(value) || !value || value < 1) return maxCollectionLimit;
  return Math.min(value, maxCollectionLimit);
}

function metadataSource(row: DatasetRow): LocationSource {
  return {
    authority: row.authority,
    sourceDataset: row.source_dataset,
    sourceDatasetVersion: row.dataset_version,
    provenance: "derived_official"
  };
}

function nodeSource(row: NodeRow, dataset: CanonicalLocationDatasetMetadata): LocationSource {
  const metadata = typeof row.source_metadata === "string"
    ? JSON.parse(row.source_metadata) as Record<string, unknown>
    : row.source_metadata;
  return {
    authority: typeof metadata.authority === "string" ? metadata.authority : dataset.authority,
    sourceDataset: typeof metadata.sourceDataset === "string" ? metadata.sourceDataset : dataset.sourceDataset,
    sourceDatasetVersion: typeof metadata.sourceDatasetVersion === "string"
      ? metadata.sourceDatasetVersion
      : dataset.datasetVersion,
    provenance: "derived_official",
    sourceRecordId: typeof metadata.sourceId === "string" ? metadata.sourceId : undefined
  };
}

/**
 * PostgreSQL implementation for `location.*` only. The executor is injected so
 * this reusable module has no HTTP, browser, credential, or database-driver
 * dependency. Every statement uses PostgreSQL parameters and a selected dataset.
 */
export class PostgresCanonicalLocationRepository implements CanonicalLocationRepository {
  private metadataPromise: Promise<CanonicalLocationDatasetMetadata | null> | null = null;
  private readonly executor: PostgresReadOnlyQueryExecutor;
  private readonly selection: CanonicalLocationDatasetSelection;

  constructor(
    executor: PostgresReadOnlyQueryExecutor,
    selection: CanonicalLocationDatasetSelection
  ) {
    this.executor = executor;
    this.selection = selection;
  }

  async metadata(): Promise<CanonicalLocationDatasetMetadata | null> {
    this.metadataPromise ??= this.loadMetadata();
    return this.metadataPromise;
  }

  async getNode(nodeId: string): Promise<CanonicalLocationNode | null> {
    const dataset = await this.metadata();
    if (!dataset) return null;
    const rows = await this.executor.query<NodeRow>(
      "select node_id, official_code, level, entity_kind, display_name, source_metadata from location.nodes where dataset_id = $1::uuid and node_id = $2 and active = true limit 1",
      [dataset.datasetId, nodeId]
    );
    const nodes = await this.hydrate(rows, dataset);
    return nodes[0] ?? null;
  }

  async getByOfficialCode(officialCode: string, requestedLimit?: number): Promise<readonly CanonicalLocationNode[]> {
    return this.findResolutionCandidates({ officialCode, limit: requestedLimit });
  }

  async getChildren(nodeId: string, requestedLimit?: number): Promise<readonly CanonicalLocationNode[]> {
    const dataset = await this.metadata();
    if (!dataset) return [];
    const rows = await this.executor.query<NodeRow>(
      "select child.node_id, child.official_code, child.level, child.entity_kind, child.display_name, child.source_metadata from location.relationships relationship join location.nodes child on child.dataset_id = relationship.dataset_id and child.node_id = relationship.child_node_id where relationship.dataset_id = $1::uuid and relationship.parent_node_id = $2 and child.active = true order by child.level, child.entity_kind, child.display_name, child.node_id limit $3",
      [dataset.datasetId, nodeId, limit(requestedLimit)]
    );
    return this.hydrate(rows, dataset);
  }

  async getParents(nodeId: string): Promise<readonly LocationParentReference[]> {
    const dataset = await this.metadata();
    if (!dataset) return [];
    return this.parentsFor([nodeId], dataset).then((parents) => parents.get(nodeId) ?? []);
  }

  async getLineage(nodeId: string): Promise<readonly CanonicalLocationNode[]> {
    const dataset = await this.metadata();
    if (!dataset) return [];
    const rows = await this.executor.query<LineageRow>(
      "select lineage.descendant_node_id, lineage.depth, ancestor.node_id, ancestor.official_code, ancestor.level, ancestor.entity_kind, ancestor.display_name, ancestor.source_metadata from location.lineage lineage join location.nodes ancestor on ancestor.dataset_id = lineage.dataset_id and ancestor.node_id = lineage.ancestor_node_id where lineage.dataset_id = $1::uuid and lineage.descendant_node_id = $2 and ancestor.active = true order by lineage.depth desc, ancestor.node_id",
      [dataset.datasetId, nodeId]
    );
    return this.hydrate(rows, dataset);
  }

  async findResolutionCandidates(search: CanonicalLocationSearch): Promise<readonly CanonicalLocationNode[]> {
    const dataset = await this.metadata();
    if (!dataset) return [];
    if (search.datasetVersion && search.datasetVersion !== dataset.datasetVersion) return [];
    if (search.sourceDataset && search.sourceDataset !== dataset.sourceDataset) return [];

    const conditions = ["node.dataset_id = $1::uuid", "node.active = true"];
    const parameters: unknown[] = [dataset.datasetId];
    const add = (condition: string, value: unknown) => {
      parameters.push(value);
      conditions.push(condition.replace("?", `$${parameters.length}`));
    };
    if (search.nodeId) add("node.node_id = ?", search.nodeId);
    if (search.officialCode) add("node.official_code = ?", search.officialCode);
    if (search.normalizedName) add("node.display_name_normalized = ?", search.normalizedName);
    if (search.expectedLevel) add("node.level = ?", search.expectedLevel);
    if (search.entityKinds?.length) add("node.entity_kind = any(?::text[])", search.entityKinds);
    if (search.parentNodeId) add("exists (select 1 from location.relationships relationship where relationship.dataset_id = node.dataset_id and relationship.child_node_id = node.node_id and relationship.parent_node_id = ?)", search.parentNodeId);
    parameters.push(limit(search.limit));
    const rows = await this.executor.query<NodeRow>(
      `select node.node_id, node.official_code, node.level, node.entity_kind, node.display_name, node.source_metadata from location.nodes node where ${conditions.join(" and ")} order by node.level, node.entity_kind, node.display_name, node.node_id limit $${parameters.length}`,
      parameters
    );
    return this.hydrate(rows, dataset);
  }

  async hasOfficialRelationship(childNodeId: string, parentNodeId: string): Promise<boolean> {
    const dataset = await this.metadata();
    if (!dataset) return false;
    const rows = await this.executor.query<Record<string, unknown>>(
      "select 1 as represented from location.relationships where dataset_id = $1::uuid and child_node_id = $2 and parent_node_id = $3 limit 1",
      [dataset.datasetId, childNodeId, parentNodeId]
    );
    return rows.length === 1;
  }

  async isDescendantOf(nodeId: string, ancestorNodeId: string): Promise<boolean> {
    const dataset = await this.metadata();
    if (!dataset) return false;
    const rows = await this.executor.query<Record<string, unknown>>(
      "select 1 as descendant from location.lineage where dataset_id = $1::uuid and descendant_node_id = $2 and ancestor_node_id = $3 limit 1",
      [dataset.datasetId, nodeId, ancestorNodeId]
    );
    return rows.length === 1;
  }

  private async loadMetadata(): Promise<CanonicalLocationDatasetMetadata | null> {
    const active = this.selection.mode === "active_release";
    const rows = active
      ? await this.executor.query<DatasetRow>(
        "select dataset.id, dataset.authority, dataset.source_dataset, dataset.dataset_version, dataset.effective_date::text, dataset.checksum, dataset.status from location.dataset_releases release join location.datasets dataset on dataset.id = release.dataset_id where release.is_active = true and release.scope_key = $1 order by release.activated_at desc, release.id limit 2",
        [this.selection.scopeKey]
      )
      : await this.executor.query<DatasetRow>(
        "select id, authority, source_dataset, dataset_version, effective_date::text, checksum, status from location.datasets where id = $1::uuid and dataset_version = $2 and status = 'staged' limit 2",
        [this.selection.datasetId, this.selection.datasetVersion]
      );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("Canonical dataset selection is not unique.");
    const row = rows[0];
    return {
      datasetId: row.id,
      authority: row.authority,
      sourceDataset: row.source_dataset,
      datasetVersion: row.dataset_version,
      effectiveDate: row.effective_date,
      checksum: row.checksum,
      status: row.status,
      source: metadataSource(row)
    };
  }

  private async hydrate(
    rows: readonly NodeRow[],
    dataset: CanonicalLocationDatasetMetadata
  ): Promise<readonly CanonicalLocationNode[]> {
    if (rows.length === 0) return [];
    const nodeIds = rows.map((row) => row.node_id);
    const [parents, lineage] = await Promise.all([
      this.parentsFor(nodeIds, dataset),
      this.lineageFor(nodeIds, dataset)
    ]);
    return rows.map((row) => this.toNode(
      row,
      dataset,
      parents.get(row.node_id) ?? [],
      lineage.get(row.node_id) ?? []
    ));
  }

  private async parentsFor(
    nodeIds: readonly string[],
    dataset: CanonicalLocationDatasetMetadata
  ): Promise<ReadonlyMap<string, readonly LocationParentReference[]>> {
    if (nodeIds.length === 0) return new Map();
    const rows = await this.executor.query<ParentRow>(
      "select relationship.child_node_id, parent.node_id, parent.official_code, parent.level, relationship.relationship_type from location.relationships relationship join location.nodes parent on parent.dataset_id = relationship.dataset_id and parent.node_id = relationship.parent_node_id where relationship.dataset_id = $1::uuid and relationship.child_node_id = any($2::text[]) order by relationship.child_node_id, relationship.relationship_type, parent.node_id",
      [dataset.datasetId, nodeIds]
    );
    const byChild = new Map<string, LocationParentReference[]>();
    for (const row of rows) {
      const parent: LocationParentReference = {
        nodeId: row.node_id,
        officialCode: row.official_code,
        level: row.level,
        relationship: row.relationship_type,
        source: {
          authority: dataset.authority,
          sourceDataset: dataset.sourceDataset,
          sourceDatasetVersion: dataset.datasetVersion
        }
      };
      const current = byChild.get(row.child_node_id) ?? [];
      current.push(parent);
      byChild.set(row.child_node_id, current);
    }
    return byChild;
  }

  private async lineageFor(
    nodeIds: readonly string[],
    dataset: CanonicalLocationDatasetMetadata
  ): Promise<ReadonlyMap<string, readonly LocationLineageEntry[]>> {
    if (nodeIds.length === 0) return new Map();
    const rows = await this.executor.query<LineageRow>(
      "select lineage.descendant_node_id, lineage.depth, ancestor.node_id, ancestor.official_code, ancestor.level, ancestor.entity_kind, ancestor.display_name, ancestor.source_metadata from location.lineage lineage join location.nodes ancestor on ancestor.dataset_id = lineage.dataset_id and ancestor.node_id = lineage.ancestor_node_id where lineage.dataset_id = $1::uuid and lineage.descendant_node_id = any($2::text[]) order by lineage.descendant_node_id, lineage.depth desc, ancestor.node_id",
      [dataset.datasetId, nodeIds]
    );
    const byDescendant = new Map<string, LocationLineageEntry[]>();
    for (const row of rows) {
      const current = byDescendant.get(row.descendant_node_id) ?? [];
      current.push({ nodeId: row.node_id, officialCode: row.official_code, level: row.level });
      byDescendant.set(row.descendant_node_id, current);
    }
    return byDescendant;
  }

  private toNode(
    row: NodeRow,
    dataset: CanonicalLocationDatasetMetadata,
    parents: readonly LocationParentReference[],
    lineage: readonly LocationLineageEntry[]
  ): CanonicalLocationNode {
    return {
      nodeId: row.node_id,
      officialCode: row.official_code,
      level: row.level,
      entityKind: row.entity_kind,
      displayName: row.display_name,
      datasetVersion: dataset.datasetVersion,
      source: nodeSource(row, dataset),
      parents,
      lineage
    };
  }
}
