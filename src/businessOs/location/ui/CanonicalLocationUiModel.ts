import {
  LocationBrowserCatalogClientError,
  type LocationBrowserCatalogClient
} from "../browser/LocationBrowserCatalogClient.ts";
import type {
  LocationBrowserCanonicalNode,
  LocationBrowserDatasetIdentity,
  LocationBrowserResolution
} from "../browser/LocationBrowserCatalogContract.ts";
import type { LocationLevel } from "../../geography/LocationApiTypes.ts";

export type CanonicalLocationUiStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface CanonicalLocationUiError {
  code: "request_failed" | "mixed_dataset" | "dataset_changed";
  message: string;
  recoverable: true;
}

export interface CanonicalLocationSelection extends LocationBrowserCanonicalNode {
  canonicalNodeId: string;
}

export interface CanonicalLocationBranch {
  parent: CanonicalLocationSelection;
  options: readonly CanonicalLocationSelection[];
  status: "ready" | "empty";
}

export type CanonicalLocationResolutionState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "resolved"; query: string; node: CanonicalLocationSelection }
  | { status: "ambiguous"; query: string; candidates: readonly CanonicalLocationSelection[]; reason: string }
  | { status: "unresolved"; query: string; suggestions: readonly CanonicalLocationSelection[]; reason: string }
  | { status: "error"; query: string; error: CanonicalLocationUiError };

export interface CanonicalLocationUiState {
  status: CanonicalLocationUiStatus;
  disabled: boolean;
  dataset: LocationBrowserDatasetIdentity | null;
  root: CanonicalLocationSelection | null;
  selection: readonly CanonicalLocationSelection[];
  branches: readonly CanonicalLocationBranch[];
  resolution: CanonicalLocationResolutionState;
  error: CanonicalLocationUiError | null;
  requiresReselection: boolean;
}

export interface UnverifiedCustomLocationSelection {
  label: string;
  verificationStatus: "unverified_custom";
  canonicalNodeId: null;
  officialCode: null;
}

export interface CanonicalLocationCatalogReader {
  metadata(): Promise<LocationBrowserDatasetIdentity>;
  node(nodeId: string): Promise<LocationBrowserCanonicalNode>;
  children(parentNodeId: string, resultLimit?: number): Promise<readonly LocationBrowserCanonicalNode[]>;
  resolve(query: {
    nodeId?: string;
    officialCode?: string;
    normalizedName?: string;
    expectedLevel?: LocationLevel;
    parentNodeId?: string;
    resultLimit?: number;
  }): Promise<LocationBrowserResolution>;
  search(query: {
    nodeId?: string;
    officialCode?: string;
    normalizedName?: string;
    expectedLevel?: LocationLevel;
    parentNodeId?: string;
    resultLimit?: number;
  }): Promise<LocationBrowserResolution>;
  clearCache(): void;
}

export interface CanonicalLocationUiControllerOptions {
  client: CanonicalLocationCatalogReader | LocationBrowserCatalogClient;
  rootNodeId: string;
  resultLimit?: number;
  disabled?: boolean;
}

type Listener = () => void;
type RetryOperation =
  | { type: "initialize" }
  | { type: "select"; branchIndex: number; nodeId: string }
  | { type: "search"; query: string; expectedLevel?: LocationLevel }
  | {
      type: "resolve";
      query: { nodeId?: string; officialCode?: string; normalizedName?: string; expectedLevel?: LocationLevel };
    };

const DEFAULT_RESULT_LIMIT = 100;

function sameDataset(
  first: LocationBrowserDatasetIdentity,
  second: LocationBrowserDatasetIdentity
): boolean {
  return first.authority === second.authority
    && first.sourceDataset === second.sourceDataset
    && first.datasetVersion === second.datasetVersion;
}

function requireText(value: string, label: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > 200) throw new Error(`${label} is invalid.`);
  return normalized;
}

function boundedResultLimit(value: number | undefined): number {
  const result = value ?? DEFAULT_RESULT_LIMIT;
  if (!Number.isInteger(result) || result < 1 || result > DEFAULT_RESULT_LIMIT) {
    throw new Error("Canonical location result limit is invalid.");
  }
  return result;
}

function requestError(error: unknown): CanonicalLocationUiError {
  const mixed = error instanceof LocationBrowserCatalogClientError && error.code === "mixed_dataset";
  return {
    code: mixed ? "mixed_dataset" : "request_failed",
    message: mixed
      ? "Canonical location versions cannot be combined. Refresh and select the location again."
      : "Canonical locations could not be loaded. Try again.",
    recoverable: true
  };
}

export function createUnverifiedCustomLocation(
  label: string
): UnverifiedCustomLocationSelection {
  return {
    label: requireText(label, "Custom location"),
    verificationStatus: "unverified_custom",
    canonicalNodeId: null,
    officialCode: null
  };
}

export function toCanonicalLocationSelection(
  node: LocationBrowserCanonicalNode
): CanonicalLocationSelection {
  return {
    canonicalNodeId: node.nodeId,
    nodeId: node.nodeId,
    officialCode: node.officialCode,
    label: node.label,
    level: node.level,
    entityKind: node.entityKind,
    authority: node.authority,
    sourceDataset: node.sourceDataset,
    datasetVersion: node.datasetVersion,
    parents: node.parents.map((parent) => ({ ...parent, source: { ...parent.source } })),
    lineage: node.lineage.map((ancestor) => ({ ...ancestor }))
  };
}

export class CanonicalLocationUiController {
  private readonly client: CanonicalLocationCatalogReader;
  private readonly rootNodeId: string;
  private readonly resultLimit: number;
  private readonly listeners = new Set<Listener>();
  private navigationEpoch = 0;
  private resolutionEpoch = 0;
  private retryOperation: RetryOperation = { type: "initialize" };
  private disposed = false;
  private state: CanonicalLocationUiState;

  constructor(options: CanonicalLocationUiControllerOptions) {
    this.client = options.client;
    this.rootNodeId = requireText(options.rootNodeId, "Root node ID");
    this.resultLimit = boundedResultLimit(options.resultLimit);
    this.state = {
      status: "idle",
      disabled: Boolean(options.disabled),
      dataset: null,
      root: null,
      selection: [],
      branches: [],
      resolution: { status: "idle" },
      error: null,
      requiresReselection: false
    };
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): CanonicalLocationUiState => this.state;

  setDisabled(disabled: boolean): void {
    if (this.state.disabled === disabled) return;
    if (disabled) {
      this.navigationEpoch += 1;
      this.resolutionEpoch += 1;
    }
    this.update({ ...this.state, disabled });
  }

  async initialize(): Promise<void> {
    if (this.state.disabled || this.disposed) return;
    this.retryOperation = { type: "initialize" };
    const epoch = ++this.navigationEpoch;
    this.update({
      ...this.state,
      status: "loading",
      root: null,
      selection: [],
      branches: [],
      resolution: { status: "idle" },
      error: null,
      requiresReselection: false
    });
    try {
      const dataset = await this.readDatasetFence();
      if (!dataset || !this.isCurrentNavigation(epoch)) return;
      const root = toCanonicalLocationSelection(await this.client.node(this.rootNodeId));
      this.assertNodeDataset(root, dataset);
      const options = await this.client.children(root.nodeId, this.resultLimit);
      if (!this.isCurrentNavigation(epoch)) return;
      const canonicalOptions = this.validateNodes(options, dataset);
      this.update({
        ...this.state,
        status: canonicalOptions.length ? "ready" : "empty",
        dataset,
        root,
        selection: [root],
        branches: [{ parent: root, options: canonicalOptions, status: canonicalOptions.length ? "ready" : "empty" }],
        error: null,
        requiresReselection: false
      });
    } catch (error) {
      this.handleNavigationError(error, epoch);
    }
  }

  async select(branchIndex: number, nodeId: string): Promise<void> {
    if (this.state.disabled || this.disposed) return;
    const branch = this.state.branches[branchIndex];
    const node = branch?.options.find((option) => option.nodeId === nodeId);
    if (!branch || !node || !this.state.dataset) return;
    this.retryOperation = { type: "select", branchIndex, nodeId };
    const epoch = ++this.navigationEpoch;
    const selection = [...this.state.selection.slice(0, branchIndex + 1), toCanonicalLocationSelection(node)];
    const branches = this.state.branches.slice(0, branchIndex + 1);
    this.update({
      ...this.state,
      status: "loading",
      selection,
      branches,
      resolution: { status: "idle" },
      error: null
    });
    try {
      const dataset = await this.readDatasetFence();
      if (!dataset || !this.isCurrentNavigation(epoch)) return;
      this.assertNodeDataset(node, dataset);
      const options = await this.client.children(node.nodeId, this.resultLimit);
      if (!this.isCurrentNavigation(epoch)) return;
      const canonicalOptions = this.validateNodes(options, dataset);
      this.update({
        ...this.state,
        status: canonicalOptions.length ? "ready" : "empty",
        branches: [
          ...branches,
          { parent: node, options: canonicalOptions, status: canonicalOptions.length ? "ready" : "empty" }
        ],
        error: null
      });
    } catch (error) {
      this.handleNavigationError(error, epoch);
    }
  }

  async search(query: string, expectedLevel?: LocationLevel): Promise<void> {
    const normalized = requireText(query, "Search query");
    this.retryOperation = { type: "search", query: normalized, ...(expectedLevel ? { expectedLevel } : {}) };
    await this.runResolution("search", normalized, {
      normalizedName: normalized,
      ...(expectedLevel ? { expectedLevel } : {})
    });
  }

  async resolve(query: {
    nodeId?: string;
    officialCode?: string;
    normalizedName?: string;
    expectedLevel?: LocationLevel;
  }): Promise<void> {
    const cleaned = {
      ...(query.nodeId ? { nodeId: requireText(query.nodeId, "Node ID") } : {}),
      ...(query.officialCode ? { officialCode: requireText(query.officialCode, "Official code") } : {}),
      ...(query.normalizedName ? { normalizedName: requireText(query.normalizedName, "Location name") } : {}),
      ...(query.expectedLevel ? { expectedLevel: query.expectedLevel } : {})
    };
    if (!cleaned.nodeId && !cleaned.officialCode && !cleaned.normalizedName) {
      throw new Error("A canonical identity constraint is required.");
    }
    this.retryOperation = { type: "resolve", query: cleaned };
    await this.runResolution("resolve", cleaned.normalizedName ?? cleaned.officialCode ?? cleaned.nodeId ?? "", cleaned);
  }

  async confirmResolution(nodeId: string): Promise<void> {
    const resolution = this.state.resolution;
    const node = resolution.status === "resolved"
      ? (resolution.node.nodeId === nodeId ? resolution.node : null)
      : resolution.status === "ambiguous"
        ? resolution.candidates.find((candidate) => candidate.nodeId === nodeId) ?? null
        : null;
    if (!node || !this.state.dataset) return;
    this.assertNodeDataset(node, this.state.dataset);
    const parent = this.currentParent();
    if (!parent || (!node.parents.some((candidate) => candidate.nodeId === parent.nodeId)
      && !node.lineage.some((candidate) => candidate.nodeId === parent.nodeId))) return;
    const existingBranchIndex = this.state.branches.findIndex((branch) => branch.parent.nodeId === parent.nodeId);
    const branchIndex = existingBranchIndex >= 0 ? existingBranchIndex : this.state.branches.length;
    const syntheticBranch: CanonicalLocationBranch = { parent, options: [node], status: "ready" };
    if (existingBranchIndex < 0) {
      this.update({ ...this.state, branches: [...this.state.branches, syntheticBranch] });
    } else if (!this.state.branches[existingBranchIndex].options.some((option) => option.nodeId === node.nodeId)) {
      const branches = [...this.state.branches];
      branches[existingBranchIndex] = {
        ...branches[existingBranchIndex],
        options: [...branches[existingBranchIndex].options, node]
      };
      this.update({ ...this.state, branches });
    }
    await this.select(branchIndex, node.nodeId);
  }

  clearResolution(): void {
    this.resolutionEpoch += 1;
    this.update({ ...this.state, resolution: { status: "idle" } });
  }

  clear(): void {
    this.navigationEpoch += 1;
    this.resolutionEpoch += 1;
    this.client.clearCache();
    this.retryOperation = { type: "initialize" };
    this.update({
      status: "idle",
      disabled: this.state.disabled,
      dataset: null,
      root: null,
      selection: [],
      branches: [],
      resolution: { status: "idle" },
      error: null,
      requiresReselection: false
    });
  }

  async retry(): Promise<void> {
    if (this.state.disabled || this.disposed) return;
    const operation = this.retryOperation;
    if (operation.type === "initialize") return await this.initialize();
    if (operation.type === "select") return await this.select(operation.branchIndex, operation.nodeId);
    if (operation.type === "search") return await this.search(operation.query, operation.expectedLevel);
    return await this.resolve(operation.query);
  }

  dispose(): void {
    this.disposed = true;
    this.navigationEpoch += 1;
    this.resolutionEpoch += 1;
    this.listeners.clear();
  }

  private async runResolution(
    operation: "search" | "resolve",
    displayQuery: string,
    query: { nodeId?: string; officialCode?: string; normalizedName?: string; expectedLevel?: LocationLevel }
  ): Promise<void> {
    if (this.state.disabled || this.disposed) return;
    const parent = this.currentParent();
    if (!parent || !this.state.dataset) return;
    const epoch = ++this.resolutionEpoch;
    this.update({
      ...this.state,
      status: "loading",
      resolution: { status: "loading", query: displayQuery },
      error: null
    });
    try {
      const dataset = await this.readDatasetFence();
      if (!dataset || !this.isCurrentResolution(epoch)) return;
      const result = await this.client[operation]({
        ...query,
        parentNodeId: parent.nodeId,
        resultLimit: this.resultLimit
      });
      if (!this.isCurrentResolution(epoch)) return;
      this.applyResolution(displayQuery, result, dataset);
    } catch (error) {
      if (!this.isCurrentResolution(epoch)) return;
      const mapped = requestError(error);
      if (mapped.code === "mixed_dataset") this.invalidateCanonicalState(mapped);
      else this.update({ ...this.state, status: "error", resolution: { status: "error", query: displayQuery, error: mapped }, error: mapped });
    }
  }

  private applyResolution(
    query: string,
    result: LocationBrowserResolution,
    dataset: LocationBrowserDatasetIdentity
  ): void {
    if (result.status === "resolved") {
      const node = toCanonicalLocationSelection(result.node);
      this.assertNodeDataset(node, dataset);
      this.update({ ...this.state, status: "ready", resolution: { status: "resolved", query, node }, error: null });
      return;
    }
    if (result.status === "ambiguous") {
      const candidates = this.validateNodes(result.candidates, dataset);
      this.update({ ...this.state, status: "ready", resolution: { status: "ambiguous", query, candidates, reason: result.reason }, error: null });
      return;
    }
    if (result.status === "unresolved") {
      const suggestions = this.validateNodes(result.suggestions ?? [], dataset);
      this.update({ ...this.state, status: "empty", resolution: { status: "unresolved", query, suggestions, reason: result.reason }, error: null });
      return;
    }
    const error: CanonicalLocationUiError = { code: "request_failed", message: result.reason, recoverable: true };
    this.update({ ...this.state, status: "error", resolution: { status: "error", query, error }, error });
  }

  private async readDatasetFence(): Promise<LocationBrowserDatasetIdentity | null> {
    const dataset = await this.client.metadata();
    if (this.state.dataset && !sameDataset(this.state.dataset, dataset)) {
      this.client.clearCache();
      this.navigationEpoch += 1;
      this.resolutionEpoch += 1;
      this.retryOperation = { type: "initialize" };
      this.update({
        ...this.state,
        status: "error",
        dataset,
        root: null,
        selection: [],
        branches: [],
        resolution: { status: "idle" },
        error: {
          code: "dataset_changed",
          message: "The canonical location dataset changed. Refresh and select the location again.",
          recoverable: true
        },
        requiresReselection: true
      });
      return null;
    }
    return dataset;
  }

  private validateNodes(
    nodes: readonly LocationBrowserCanonicalNode[],
    dataset: LocationBrowserDatasetIdentity
  ): readonly CanonicalLocationSelection[] {
    if (nodes.length > this.resultLimit) throw new Error("Canonical location result limit was exceeded.");
    return Object.freeze(nodes.map((node) => {
      this.assertNodeDataset(node, dataset);
      return toCanonicalLocationSelection(node);
    }));
  }

  private assertNodeDataset(
    node: LocationBrowserCanonicalNode,
    dataset: LocationBrowserDatasetIdentity
  ): void {
    if (!sameDataset(node, dataset)
      || node.parents.some((parent) => !sameDataset(parent.source, dataset))) {
      throw new LocationBrowserCatalogClientError("mixed_dataset");
    }
  }

  private currentParent(): CanonicalLocationSelection | null {
    return this.state.selection.length
      ? this.state.selection[this.state.selection.length - 1]
      : this.state.root;
  }

  private handleNavigationError(error: unknown, epoch: number): void {
    if (!this.isCurrentNavigation(epoch)) return;
    const mapped = requestError(error);
    if (mapped.code === "mixed_dataset") this.invalidateCanonicalState(mapped);
    else this.update({ ...this.state, status: "error", error: mapped });
  }

  private invalidateCanonicalState(error: CanonicalLocationUiError): void {
    this.client.clearCache();
    this.navigationEpoch += 1;
    this.resolutionEpoch += 1;
    this.retryOperation = { type: "initialize" };
    this.update({
      ...this.state,
      status: "error",
      root: null,
      selection: [],
      branches: [],
      resolution: { status: "idle" },
      error,
      requiresReselection: true
    });
  }

  private isCurrentNavigation(epoch: number): boolean {
    return !this.disposed && epoch === this.navigationEpoch;
  }

  private isCurrentResolution(epoch: number): boolean {
    return !this.disposed && epoch === this.resolutionEpoch;
  }

  private update(state: CanonicalLocationUiState): void {
    if (this.disposed) return;
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
