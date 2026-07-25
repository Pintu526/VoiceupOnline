import { isValidCoordinates } from "./AddressLookupAdapter.ts";
import { GeographyCache } from "./GeographyCache.ts";
import { GeographySearchService, normalizeSearchText } from "./GeographySearchService.ts";
import type {
  AddressLookupAdapter,
  AddressLookupOptions,
  AdministrativeHierarchyConfig,
  GeographyConfirmationCandidate,
  GeographyDataset,
  GeographyDatasetLoader,
  GeographyLevel,
  GeographyNode,
  GeographySearchQuery,
  GeographySearchResult,
  GeographyTreeNode,
  GPSAdapter,
  GPSRequestOptions,
  SuggestedGeography
} from "./types.ts";

export interface GeographyServiceOptions {
  hierarchies?: AdministrativeHierarchyConfig[];
  datasets?: GeographyDataset[];
  cache?: GeographyCache<GeographyDataset | GeographySearchResult[]>;
}

export class GeographyService {
  private readonly hierarchies = new Map<string, AdministrativeHierarchyConfig>();
  private readonly datasets = new Map<string, GeographyDataset>();
  private readonly nodesById = new Map<string, GeographyNode>();
  private readonly childrenByParent = new Map<string, GeographyNode[]>();
  private readonly searchService = new GeographySearchService();
  private readonly cache: GeographyCache<GeographyDataset | GeographySearchResult[]>;

  constructor(options: GeographyServiceOptions = {}) {
    this.cache = options.cache ?? new GeographyCache({
      defaultTtlMs: 15 * 60_000,
      maxEntries: 300
    });
    for (const hierarchy of options.hierarchies ?? []) this.registerHierarchy(hierarchy);
    for (const dataset of options.datasets ?? []) this.registerDataset(dataset);
  }

  registerHierarchy(hierarchy: AdministrativeHierarchyConfig) {
    this.hierarchies.set(hierarchy.countryCode, hierarchy);
    return hierarchy;
  }

  registerDataset(dataset: GeographyDataset) {
    validateDataset(dataset, this.hierarchies.get(dataset.countryCode));
    for (const [id, node] of this.nodesById) {
      if (node.countryCode === dataset.countryCode) this.nodesById.delete(id);
    }
    this.datasets.set(dataset.countryCode, dataset);
    for (const node of dataset.nodes) this.nodesById.set(node.id, node);
    this.rebuildIndexes();
    this.cache.deleteByPrefix(`search:${dataset.countryCode}:`);
    return dataset;
  }

  async loadDataset(
    loader: GeographyDatasetLoader,
    countryCode: string,
    options: { force?: boolean; signal?: AbortSignal; ttlMs?: number } = {}
  ) {
    const cacheKey = `dataset:${loader.id}:${countryCode}`;
    const load = () => loader.load(countryCode, options.signal);
    const dataset = options.force
      ? await load()
      : await this.cache.getOrLoad(cacheKey, load, {
          version: loader.id,
          ttlMs: options.ttlMs ?? 24 * 60 * 60_000
        }) as GeographyDataset;
    if (dataset.countryCode !== countryCode) {
      throw new Error(`Geography loader returned ${dataset.countryCode} for ${countryCode}.`);
    }
    return this.registerDataset(dataset);
  }

  getHierarchy(countryCode: string) {
    return this.hierarchies.get(countryCode);
  }

  getDataset(countryCode: string) {
    return this.datasets.get(countryCode);
  }

  getCoverage(countryCode: string) {
    return [...(this.datasets.get(countryCode)?.coverage ?? [])];
  }

  getNode(id: string) {
    return this.nodesById.get(id);
  }

  findNode(input: {
    countryCode: string;
    name: string;
    level?: GeographyLevel;
    parentId?: string;
  }) {
    const normalizedName = normalizeSearchText(input.name);
    return this.search({
      countryCode: input.countryCode,
      text: input.name,
      levels: input.level ? [input.level] : undefined,
      parentId: input.parentId,
      limit: 20
    }).find((result) =>
      normalizeSearchText(result.node.name) === normalizedName
      || result.node.aliases?.some((alias) => normalizeSearchText(alias) === normalizedName)
      || Object.values(result.node.localNames ?? {}).some(
        (name) => normalizeSearchText(name) === normalizedName
      )
    )?.node;
  }

  getChildren(
    parentId: string,
    options: {
      levels?: GeographyLevel[];
      includeInactive?: boolean;
    } = {}
  ) {
    return [...(this.childrenByParent.get(parentId) ?? [])]
      .filter((node) => options.includeInactive || node.active)
      .filter((node) => !options.levels?.length || options.levels.includes(node.level))
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  getAncestors(nodeId: string) {
    const node = this.nodesById.get(nodeId);
    if (!node) return [];
    return node.ancestorIds
      .map((id) => this.nodesById.get(id))
      .filter((item): item is GeographyNode => Boolean(item));
  }

  getDescendants(nodeId: string, levels?: GeographyLevel[]) {
    const descendants: GeographyNode[] = [];
    const queue = [...this.getChildren(nodeId)];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;
      if (!levels?.length || levels.includes(node.level)) descendants.push(node);
      queue.push(...this.getChildren(node.id));
    }
    return descendants;
  }

  getTree(rootId: string, maxDepth = Number.POSITIVE_INFINITY): GeographyTreeNode | undefined {
    const root = this.nodesById.get(rootId);
    if (!root) return undefined;
    const build = (node: GeographyNode, depth: number): GeographyTreeNode => ({
      node,
      children: depth >= maxDepth
        ? []
        : this.getChildren(node.id).map((child) => build(child, depth + 1))
    });
    return build(root, 0);
  }

  search(query: GeographySearchQuery) {
    const countryCode = query.countryCode ?? "*";
    const version = query.countryCode
      ? this.datasets.get(query.countryCode)?.datasetVersion ?? "unversioned"
      : [...this.datasets.values()].map((dataset) => dataset.datasetVersion).sort().join("|");
    const cacheKey = `search:${countryCode}:${stableQueryKey(query)}`;
    const cached = this.cache.get(cacheKey, version);
    if (cached) return cached as GeographySearchResult[];
    const results = this.searchService.search(query);
    this.cache.set(cacheKey, results, { version });
    return results;
  }

  autocomplete(text: string, query: Omit<GeographySearchQuery, "text"> = {}) {
    return this.search({ ...query, text });
  }

  resolveSuggestedHierarchy(countryCode: string, suggestion: SuggestedGeography) {
    const hierarchy = this.hierarchies.get(countryCode);
    if (!hierarchy) return [];
    const path: GeographyNode[] = [];
    let parentId: string | undefined;
    const names: Array<[GeographyLevel, string | undefined]> = [
      ["country", suggestion.country || hierarchy.countryName],
      ["state", suggestion.state],
      ["district", suggestion.district],
      ["block", suggestion.block],
      ["local_body", suggestion.localBody || suggestion.panchayat || suggestion.municipality],
      ["village", suggestion.village],
      ["ward", suggestion.ward]
    ];
    for (const [level, name] of names) {
      if (!name) continue;
      const node = this.findNode({ countryCode, name, level, parentId });
      if (!node) break;
      path.push(node);
      parentId = node.id;
    }
    return path;
  }

  async suggestFromGps(
    gpsAdapter: GPSAdapter,
    addressLookupAdapter: AddressLookupAdapter,
    options: {
      gps?: GPSRequestOptions;
      lookup?: AddressLookupOptions;
    } = {}
  ): Promise<GeographyConfirmationCandidate[]> {
    if (!gpsAdapter.isAvailable()) throw new Error("GPS is not available.");
    const reading = await gpsAdapter.requestPosition(options.gps);
    if (!isValidCoordinates(reading)) throw new Error("GPS returned invalid coordinates.");
    const suggestions = await addressLookupAdapter.reverseLookup(
      { latitude: reading.latitude, longitude: reading.longitude },
      options.lookup
    );
    const countryCode = options.lookup?.countryCode ?? "IN";
    return suggestions.map((suggestion) => ({
      accuracyMeters: reading.accuracyMeters,
      capturedAt: reading.capturedAt,
      suggestion,
      matchedPath: this.resolveSuggestedHierarchy(countryCode, suggestion.hierarchy),
      requiresUserConfirmation: true
    }));
  }

  private rebuildIndexes() {
    this.childrenByParent.clear();
    for (const node of this.nodesById.values()) {
      if (!node.parentId) continue;
      const children = this.childrenByParent.get(node.parentId) ?? [];
      children.push(node);
      this.childrenByParent.set(node.parentId, children);
    }
    this.searchService.replace([...this.nodesById.values()]);
  }
}

function validateDataset(
  dataset: GeographyDataset,
  hierarchy: AdministrativeHierarchyConfig | undefined
) {
  if (dataset.schemaVersion !== 1) throw new Error("Unsupported geography dataset schema.");
  if (!dataset.datasetVersion.trim()) throw new Error("Geography dataset version is required.");
  if (hierarchy && hierarchy.countryCode !== dataset.countryCode) {
    throw new Error("Geography dataset does not match its administrative hierarchy.");
  }
  const nodesById = new Map<string, GeographyNode>();
  for (const node of dataset.nodes) {
    if (nodesById.has(node.id)) throw new Error(`Duplicate geography node id: ${node.id}`);
    if (node.countryCode !== dataset.countryCode) {
      throw new Error(`Geography node ${node.id} has the wrong country code.`);
    }
    nodesById.set(node.id, node);
  }
  for (const node of dataset.nodes) {
    if (node.parentId && !nodesById.has(node.parentId)) {
      throw new Error(`Geography node ${node.id} has a missing parent.`);
    }
    if (hierarchy) {
      const level = hierarchy.levels.find((item) => item.level === node.level);
      if (!level || !level.acceptedKinds.includes(node.kind)) {
        throw new Error(`Geography node ${node.id} is incompatible with the hierarchy.`);
      }
      const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
      if (parent && !level.parentLevels.includes(parent.level)) {
        throw new Error(`Geography node ${node.id} has an invalid parent level.`);
      }
    }
  }
}

function stableQueryKey(query: GeographySearchQuery) {
  return JSON.stringify({
    ...query,
    levels: query.levels ? [...query.levels].sort() : undefined,
    kinds: query.kinds ? [...query.kinds].sort() : undefined
  });
}
