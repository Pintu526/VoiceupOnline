import { useCallback, useMemo } from "react";
import type { PersistedCanonicalLocationReference } from "../persistence/PersistedLocationReference.ts";
import {
  LocationBrowserCatalogClient,
  type LocationBrowserCatalogTransport
} from "../browser/LocationBrowserCatalogClient.ts";
import { CanonicalLocationPicker } from "./CanonicalLocationPicker";
import {
  createCanonicalLocationReferenceClaim,
  projectCanonicalSelectionToLegacyLocation,
  type LegacyLocationGovernanceLabels
} from "./CanonicalLocationLegacyAdapter";
import { createIndiaLgdCatalogReader } from "./IndiaLgdCatalogReader.ts";
import type { CanonicalLocationSelection } from "./CanonicalLocationUiModel";

export interface WorkspaceCanonicalLocationPickerProps {
  workspaceId: string;
  transport: LocationBrowserCatalogTransport;
  label: string;
  id: string;
  disabled?: boolean;
  onChange: (
    labels: LegacyLocationGovernanceLabels,
    locationReference: PersistedCanonicalLocationReference
  ) => void;
  onClear?: () => void;
}

/**
 * Reuses the Step-9 picker for authenticated workspace surfaces. Its output is
 * a claim only; every persistence boundary must validate and rebuild it.
 */
export function WorkspaceCanonicalLocationPicker({
  workspaceId,
  transport,
  label,
  id,
  disabled = false,
  onChange,
  onClear
}: WorkspaceCanonicalLocationPickerProps) {
  const client = useMemo(() => createIndiaLgdCatalogReader(
    new LocationBrowserCatalogClient({
      access: { type: "workspace", workspaceId },
      transport
    })
  ), [transport, workspaceId]);

  const handleChange = useCallback((selection: readonly CanonicalLocationSelection[]) => {
    if (selection.length <= 1) return;
    onChange(
      projectCanonicalSelectionToLegacyLocation(selection).legacyLabels,
      createCanonicalLocationReferenceClaim(selection)
    );
  }, [onChange]);

  return (
    <CanonicalLocationPicker
      client={client}
      rootNodeId="in"
      label={label}
      id={id}
      disabled={disabled}
      onChange={handleChange}
      onClear={onClear}
    />
  );
}
