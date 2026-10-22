import {
  LocationBrowserCatalogClientError,
  type LocationBrowserCatalogClient
} from "../browser/LocationBrowserCatalogClient.ts";
import type {
  LocationBrowserCanonicalNode,
  LocationBrowserDatasetIdentity,
  LocationBrowserResolution
} from "../browser/LocationBrowserCatalogContract.ts";
import type { CanonicalLocationCatalogReader } from "./CanonicalLocationUiModel.ts";

export const INDIA_LGD_CATALOG_IDENTITY = Object.freeze({
  authority: "LGD",
  sourceDataset: "india-lgd"
});

function assertIndiaLgdDataset(dataset: LocationBrowserDatasetIdentity): void {
  if (dataset.authority !== INDIA_LGD_CATALOG_IDENTITY.authority
    || dataset.sourceDataset !== INDIA_LGD_CATALOG_IDENTITY.sourceDataset) {
    throw new LocationBrowserCatalogClientError("mixed_dataset");
  }
}

function assertIndiaLgdNode(node: LocationBrowserCanonicalNode): LocationBrowserCanonicalNode {
  assertIndiaLgdDataset(node);
  return node;
}

function assertIndiaLgdResolution(resolution: LocationBrowserResolution): LocationBrowserResolution {
  if (resolution.status === "resolved") assertIndiaLgdNode(resolution.node);
  if (resolution.status === "ambiguous") resolution.candidates.forEach(assertIndiaLgdNode);
  if (resolution.status === "unresolved") resolution.suggestions?.forEach(assertIndiaLgdNode);
  return resolution;
}

/**
 * Consumer-specific source fence. Dataset versions remain metadata-driven,
 * while authority and source are fixed to the official India LGD catalog.
 */
export function createIndiaLgdCatalogReader(
  client: LocationBrowserCatalogClient
): CanonicalLocationCatalogReader {
  return {
    async metadata() {
      const metadata = await client.metadata();
      assertIndiaLgdDataset(metadata);
      return metadata;
    },
    async node(nodeId) {
      return assertIndiaLgdNode(await client.node(nodeId));
    },
    async children(parentNodeId, resultLimit) {
      const nodes = await client.children(parentNodeId, resultLimit);
      nodes.forEach(assertIndiaLgdNode);
      return nodes;
    },
    async resolve(query) {
      return assertIndiaLgdResolution(await client.resolve(query));
    },
    async search(query) {
      return assertIndiaLgdResolution(await client.search(query));
    },
    clearCache() {
      client.clearCache();
    }
  };
}
