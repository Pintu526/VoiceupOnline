import type {
  GeographyNode,
  GeographySearchQuery,
  GeographySearchResult
} from "./types.ts";

interface IndexedGeographyNode {
  node: GeographyNode;
  name: string;
  aliases: string[];
  localNames: string[];
  code: string;
}

export class GeographySearchService {
  private index: IndexedGeographyNode[] = [];
  private nodesById = new Map<string, GeographyNode>();
  private byParent = new Map<string, IndexedGeographyNode[]>();
  private byLevel = new Map<string, IndexedGeographyNode[]>();
  private byPrefix = new Map<string, IndexedGeographyNode[]>();

  constructor(nodes: GeographyNode[] = []) {
    this.replace(nodes);
  }

  replace(nodes: GeographyNode[]) {
    this.nodesById = new Map(nodes.map((node) => [node.id, node]));
    this.index = nodes.map((node) => ({
      node,
      name: normalizeSearchText(node.name),
      aliases: (node.aliases ?? []).map(normalizeSearchText),
      localNames: Object.values(node.localNames ?? {}).map(normalizeSearchText),
      code: normalizeSearchText(node.code ?? "")
    }));
    this.byParent.clear();
    this.byLevel.clear();
    this.byPrefix.clear();
    for (const indexed of this.index) {
      if (indexed.node.parentId) appendIndex(this.byParent, indexed.node.parentId, indexed);
      appendIndex(this.byLevel, indexed.node.level, indexed);
      const searchableValues = [
        indexed.name,
        indexed.code,
        ...indexed.aliases,
        ...indexed.localNames
      ];
      const prefixes = new Set(
        searchableValues
          .flatMap((value) => value.split(" "))
          .flatMap(searchPrefixes)
      );
      for (const prefix of prefixes) appendIndex(this.byPrefix, prefix, indexed);
    }
  }

  search(query: GeographySearchQuery): GeographySearchResult[] {
    const text = normalizeSearchText(query.text ?? "");
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const results: GeographySearchResult[] = [];

    for (const indexed of this.getCandidates(query, text)) {
      if (!matchesFilter(indexed.node, query)) continue;
      const match = scoreNode(indexed, text);
      if (text && match.score === 0) continue;
      results.push({
        node: indexed.node,
        score: match.score,
        matchedOn: text ? match.matchedOn : "filter",
        path: this.getPath(indexed.node)
      });
    }

    return results
      .sort((first, second) =>
        second.score - first.score
        || first.path.length - second.path.length
        || first.node.name.localeCompare(second.node.name)
      )
      .slice(0, limit);
  }

  autocomplete(text: string, query: Omit<GeographySearchQuery, "text"> = {}) {
    return this.search({ ...query, text });
  }

  private getCandidates(query: GeographySearchQuery, text: string) {
    if (query.parentId) return this.byParent.get(query.parentId) ?? [];
    const prefix = lookupPrefix(text);
    if (prefix && this.byPrefix.has(prefix)) return this.byPrefix.get(prefix) ?? [];
    if (query.levels?.length === 1) return this.byLevel.get(query.levels[0]) ?? [];
    if (query.levels?.length) {
      return query.levels.flatMap((level) => this.byLevel.get(level) ?? []);
    }
    return this.index;
  }

  private getPath(node: GeographyNode) {
    return [...node.ancestorIds, node.id]
      .map((id) => this.nodesById.get(id))
      .filter((item): item is GeographyNode => Boolean(item));
  }
}

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\u0b00-\u0b7f]+/g, " ")
    .trim();
}

function matchesFilter(node: GeographyNode, query: GeographySearchQuery) {
  if (!query.includeInactive && !node.active) return false;
  if (query.countryCode && node.countryCode !== query.countryCode) return false;
  if (query.levels?.length && !query.levels.includes(node.level)) return false;
  if (query.kinds?.length && !query.kinds.includes(node.kind)) return false;
  if (query.parentId && node.parentId !== query.parentId) return false;
  if (query.ancestorId && node.id !== query.ancestorId && !node.ancestorIds.includes(query.ancestorId)) {
    return false;
  }
  return true;
}

function scoreNode(
  indexed: IndexedGeographyNode,
  text: string
): { score: number; matchedOn: GeographySearchResult["matchedOn"] } {
  if (!text) return { score: 1, matchedOn: "filter" };
  if (indexed.name === text) return { score: 100, matchedOn: "name" };
  if (indexed.code && indexed.code === text) return { score: 98, matchedOn: "code" };
  if (indexed.name.startsWith(text)) return { score: 90, matchedOn: "name" };
  if (hasTokenPrefix(indexed.name, text)) return { score: 80, matchedOn: "name" };
  const exactAlias = indexed.aliases.find((value) => value === text);
  if (exactAlias) return { score: 78, matchedOn: "alias" };
  const localName = indexed.localNames.find((value) => value === text || value.startsWith(text));
  if (localName) return { score: 76, matchedOn: "local_name" };
  const alias = indexed.aliases.find((value) => value.startsWith(text) || value.includes(text));
  if (alias) return { score: 70, matchedOn: "alias" };
  if (indexed.name.includes(text)) return { score: 60, matchedOn: "name" };
  return { score: 0, matchedOn: "name" };
}

function hasTokenPrefix(value: string, text: string) {
  return value.split(" ").some((token) => token.startsWith(text));
}

function searchPrefixes(token: string) {
  if (!token) return [];
  const prefixes: string[] = [];
  for (let length = 2; length <= Math.min(4, token.length); length += 1) {
    prefixes.push(token.slice(0, length));
  }
  return prefixes;
}

function lookupPrefix(text: string) {
  const firstToken = text.split(" ")[0] ?? "";
  if (firstToken.length < 2) return "";
  return firstToken.slice(0, Math.min(4, firstToken.length));
}

function appendIndex(
  index: Map<string, IndexedGeographyNode[]>,
  key: string,
  value: IndexedGeographyNode
) {
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
}
