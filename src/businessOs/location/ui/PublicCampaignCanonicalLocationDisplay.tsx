import { useEffect, useMemo, useState } from "react";
import {
  LocationBrowserCatalogClient,
  type LocationBrowserCatalogTransport
} from "../browser/LocationBrowserCatalogClient.ts";
import { createIndiaLgdCatalogReader } from "./IndiaLgdCatalogReader.ts";
import {
  createPublicCampaignUnverifiedLocation,
  hasPublicCampaignCanonicalLocationInput,
  resolvePublicCampaignCanonicalLocation,
  type PublicCampaignCanonicalLocationState,
  type PublicCampaignCanonicalLocationValues,
  type PublicCampaignLocationPolicyEntry
} from "./PublicCampaignCanonicalLocationModel.ts";
import type { CanonicalLocationSelection } from "./CanonicalLocationUiModel.ts";
import { createCanonicalLocationReferenceClaim } from "./CanonicalLocationLegacyAdapter.ts";
import type { PersistedCanonicalLocationReference } from "../persistence/PersistedLocationReference.ts";

export interface PublicCampaignCanonicalLocationDisplayProps {
  campaignSlug: string;
  values: PublicCampaignCanonicalLocationValues;
  campaignPolicy?: readonly PublicCampaignLocationPolicyEntry[];
  transport: LocationBrowserCatalogTransport;
  title: string;
  help: string;
  labels: {
    state: string;
    district: string;
    block: string;
    panchayat: string;
  };
  onConfirmCanonicalReference?: (reference: PersistedCanonicalLocationReference) => void;
}

function levelLabel(
  node: CanonicalLocationSelection,
  labels: PublicCampaignCanonicalLocationDisplayProps["labels"]
): string {
  if (node.level === "state") return labels.state;
  if (node.level === "district") return labels.district;
  if (node.level === "block") return labels.block;
  if (node.level === "local_body" && node.entityKind !== "gram_panchayat") return labels.block;
  return labels.panchayat;
}

function loadingState(
  values: PublicCampaignCanonicalLocationValues
): PublicCampaignCanonicalLocationState {
  return {
    status: "loading",
    canonicalSelection: [],
    input: createPublicCampaignUnverifiedLocation(values)
  };
}

export function PublicCampaignCanonicalLocationDisplay({
  campaignSlug,
  values,
  campaignPolicy = [],
  transport,
  title,
  help,
  labels,
  onConfirmCanonicalReference
}: PublicCampaignCanonicalLocationDisplayProps) {
  const client = useMemo(() => createIndiaLgdCatalogReader(
    new LocationBrowserCatalogClient({
      access: { type: "public_campaign", campaignSlug },
      transport
    })
  ), [campaignSlug, transport]);
  const [state, setState] = useState<PublicCampaignCanonicalLocationState>(() => ({
    status: "idle",
    canonicalSelection: [],
    input: createPublicCampaignUnverifiedLocation(values)
  }));

  useEffect(() => {
    let current = true;

    if (!hasPublicCampaignCanonicalLocationInput(values)) {
      setState({
        status: "empty",
        canonicalSelection: [],
        input: createPublicCampaignUnverifiedLocation(values),
        reason: "no_structured_location"
      });
      return () => {
        current = false;
      };
    }

    // Clear the previous canonical descendants before resolving a changed ancestor.
    setState(loadingState(values));
    void resolvePublicCampaignCanonicalLocation(client, values, campaignPolicy)
      .then((nextState) => {
        if (current) setState(nextState);
      })
      .catch(() => {
        if (!current) return;
        setState({
          status: "error",
          canonicalSelection: [],
          input: createPublicCampaignUnverifiedLocation(values),
          reason: "canonical_location_unavailable"
        });
      });

    return () => {
      current = false;
    };
  }, [
    campaignPolicy,
    client,
    values.block,
    values.country,
    values.district,
    values.panchayat,
    values.state
  ]);

  if (state.status === "loading") {
    return <p className="public-structured-location" role="status">Loading structured location…</p>;
  }
  if (state.status === "error") {
    return <p className="public-structured-location" role="alert">Structured location is temporarily unavailable.</p>;
  }
  if (state.canonicalSelection.length <= 1) return null;

  return (
    <div
      className="public-structured-location"
      data-canonical-status={state.status}
      data-verification-state={state.input.verificationState}
    >
      <strong>{title}</strong>
      <ol>
        {state.canonicalSelection.slice(1).map((node) => (
          <li
            key={node.canonicalNodeId}
            data-canonical-node-id={node.canonicalNodeId}
            data-official-code={node.officialCode ?? ""}
            data-authority={node.authority}
            data-source-dataset={node.sourceDataset}
            data-dataset-version={node.datasetVersion}
          >
            <span>{levelLabel(node, labels)}</span>
            <b>{node.label}</b>
          </li>
        ))}
      </ol>
      <small>{help}</small>
      {state.status === "ready" && onConfirmCanonicalReference && (
        <button
          className="secondary-button"
          type="button"
          onClick={() => onConfirmCanonicalReference(
            createCanonicalLocationReferenceClaim(state.canonicalSelection)
          )}
        >
          Use verified location
        </button>
      )}
      {(state.status === "ambiguous" || state.status === "unresolved") && (
        <small role="status">The remaining location is unverified.</small>
      )}
    </div>
  );
}
