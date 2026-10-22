import {
  representUnverifiedCustomLocation,
  type LocationBrowserDatasetIdentity,
  type LocationBrowserUnverifiedCustomLocation
} from "../browser/LocationBrowserCatalogContract.ts";
import {
  projectCanonicalSelectionToLegacyLocation
} from "./CanonicalLocationLegacyAdapter.ts";
import {
  toCanonicalLocationSelection,
  type CanonicalLocationCatalogReader,
  type CanonicalLocationSelection
} from "./CanonicalLocationUiModel.ts";

export interface PublicCampaignCanonicalLocationValues {
  country?: string;
  state?: string;
  district?: string;
  block?: string;
  panchayat?: string;
}

export interface PublicCampaignLocationPolicyEntry extends PublicCampaignCanonicalLocationValues {
  village?: string;
  postalCode?: string;
}

export type PublicCampaignUnverifiedLocation = LocationBrowserUnverifiedCustomLocation & {
  verificationState: "unverified_custom";
};

export type PublicCampaignCanonicalLocationState =
  | {
      status: "idle" | "loading" | "empty";
      canonicalSelection: readonly CanonicalLocationSelection[];
      input: PublicCampaignUnverifiedLocation;
      reason?: string;
    }
  | {
      status: "ready";
      canonicalSelection: readonly CanonicalLocationSelection[];
      input: PublicCampaignUnverifiedLocation;
    }
  | {
      status: "ambiguous";
      canonicalSelection: readonly CanonicalLocationSelection[];
      candidates: readonly CanonicalLocationSelection[];
      input: PublicCampaignUnverifiedLocation;
      reason: string;
    }
  | {
      status: "unresolved" | "error";
      canonicalSelection: readonly CanonicalLocationSelection[];
      input: PublicCampaignUnverifiedLocation;
      reason: string;
    };

const INDIA_ROOT_NODE_ID = "in";
const POLICY_FIELDS = ["state", "district", "block", "panchayat"] as const;

function normalizeLabel(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-IN");
}

function isIndia(value: string | undefined): boolean {
  const country = normalizeLabel(value);
  return !country || country === "india" || country === "in";
}

function sameDataset(
  first: LocationBrowserDatasetIdentity,
  second: LocationBrowserDatasetIdentity
): boolean {
  return first.authority === second.authority
    && first.sourceDataset === second.sourceDataset
    && first.datasetVersion === second.datasetVersion;
}

function assertCanonicalNode(
  node: CanonicalLocationSelection,
  dataset: LocationBrowserDatasetIdentity,
  parentNodeId?: string
): void {
  if (!sameDataset(node, dataset)) throw new Error("Canonical location versions cannot be combined.");
  if (parentNodeId && !node.parents.some((parent) => parent.nodeId === parentNodeId && sameDataset(parent.source, dataset))) {
    throw new Error("Canonical location parentage is inconsistent.");
  }
}

export function createPublicCampaignUnverifiedLocation(
  values: PublicCampaignCanonicalLocationValues
): PublicCampaignUnverifiedLocation {
  const input = representUnverifiedCustomLocation({
    country: values.country?.trim() || "India",
    state: values.state?.trim() || undefined,
    district: values.district?.trim() || undefined,
    block: values.block?.trim() || undefined,
    panchayat: values.panchayat?.trim() || undefined,
    source: "manual"
  });
  return { ...input, verificationState: "unverified_custom" };
}

export function hasPublicCampaignCanonicalLocationInput(
  values: PublicCampaignCanonicalLocationValues
): boolean {
  return isIndia(values.country) && POLICY_FIELDS.some((field) => Boolean(values[field]?.trim()));
}

/**
 * Campaign configuration is a names-only policy overlay. It may exclude a
 * canonical path, but it never supplies canonical identity or official nodes.
 */
export function campaignPolicyAllowsCanonicalSelection(
  selection: readonly CanonicalLocationSelection[],
  policy: readonly PublicCampaignLocationPolicyEntry[]
): boolean {
  if (policy.length === 0) return true;
  const canonicalLabels = projectCanonicalSelectionToLegacyLocation(selection).legacyLabels;

  return policy.some((entry) => {
    if (entry.country && !isIndia(entry.country)) return false;
    return POLICY_FIELDS.every((field) => {
      const requiredLabel = normalizeLabel(entry[field]);
      const selectedLabel = normalizeLabel(canonicalLabels[field]);
      return !requiredLabel || !selectedLabel || requiredLabel === selectedLabel;
    });
  });
}

/**
 * Resolve a read-only C11 display suggestion through the canonical public
 * catalog. The names-only signer input always remains an unverified object;
 * resolved canonical identity is retained separately and is never persisted.
 */
export async function resolvePublicCampaignCanonicalLocation(
  client: CanonicalLocationCatalogReader,
  values: PublicCampaignCanonicalLocationValues,
  campaignPolicy: readonly PublicCampaignLocationPolicyEntry[] = []
): Promise<PublicCampaignCanonicalLocationState> {
  const input = createPublicCampaignUnverifiedLocation(values);
  if (!isIndia(values.country)) {
    return { status: "empty", canonicalSelection: [], input, reason: "outside_india" };
  }
  if (!hasPublicCampaignCanonicalLocationInput(values)) {
    return { status: "empty", canonicalSelection: [], input, reason: "no_structured_location" };
  }

  const dataset = await client.metadata();
  const root = toCanonicalLocationSelection(await client.node(INDIA_ROOT_NODE_ID));
  assertCanonicalNode(root, dataset);
  const selection: CanonicalLocationSelection[] = [root];
  const labels = POLICY_FIELDS.map((field) => values[field]?.trim() ?? "");

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    if (!label) {
      if (labels.slice(index + 1).some(Boolean)) {
        return {
          status: "unresolved",
          canonicalSelection: selection,
          input,
          reason: "missing_canonical_parent"
        };
      }
      break;
    }

    const parent = selection[selection.length - 1];
    const resolution = await client.search({
      normalizedName: label,
      parentNodeId: parent.canonicalNodeId,
      resultLimit: 100
    });

    if (resolution.status === "resolved") {
      const node = toCanonicalLocationSelection(resolution.node);
      assertCanonicalNode(node, dataset, parent.canonicalNodeId);
      selection.push(node);
      continue;
    }

    if (resolution.status === "ambiguous") {
      const candidates = resolution.candidates.map((candidate) => {
        const node = toCanonicalLocationSelection(candidate);
        assertCanonicalNode(node, dataset, parent.canonicalNodeId);
        return node;
      });
      return {
        status: "ambiguous",
        canonicalSelection: selection,
        candidates,
        input,
        reason: resolution.reason
      };
    }

    return {
      status: "unresolved",
      canonicalSelection: selection,
      input,
      reason: resolution.reason
    };
  }

  if (selection.length <= 1) {
    return { status: "empty", canonicalSelection: [], input, reason: "no_resolved_location" };
  }
  if (!campaignPolicyAllowsCanonicalSelection(selection, campaignPolicy)) {
    return { status: "empty", canonicalSelection: [], input, reason: "campaign_policy_filtered" };
  }

  return { status: "ready", canonicalSelection: selection, input };
}
