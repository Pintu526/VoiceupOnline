import { useCallback, useMemo, useState } from "react";
import {
  LocationBrowserCatalogClient,
  type LocationBrowserCatalogTransport
} from "../browser/LocationBrowserCatalogClient.ts";
import { Field } from "../../../ui/Field";
import { CanonicalLocationPicker } from "./CanonicalLocationPicker.tsx";
import {
  createUnverifiedCustomLocation,
  type CanonicalLocationSelection,
  type UnverifiedCustomLocationSelection
} from "./CanonicalLocationUiModel.ts";
import {
  createCanonicalLocationReferenceClaim,
  createCustomLocationReference,
  EMPTY_LEGACY_LOCATION_GOVERNANCE,
  projectCanonicalSelectionToLegacyLocation,
  updateUnverifiedLegacyLocation,
  type LegacyLocationGovernanceField,
  type LegacyLocationGovernanceLabels
} from "./CanonicalLocationLegacyAdapter.ts";
import type { PersistedLocationReference } from "../persistence/PersistedLocationReference.ts";
import { createIndiaLgdCatalogReader } from "./IndiaLgdCatalogReader.ts";

export interface SaasLocationGovernancePickerProps {
  workspaceId: string;
  values: LegacyLocationGovernanceLabels;
  transport: LocationBrowserCatalogTransport;
  onChange: (values: LegacyLocationGovernanceLabels, locationReference: PersistedLocationReference | null) => void;
  disabled?: boolean;
}

const manualFields: ReadonlyArray<{ field: LegacyLocationGovernanceField; label: string }> = [
  { field: "state", label: "State / Union Territory" },
  { field: "district", label: "District" },
  { field: "block", label: "Development block or urban local body" },
  { field: "panchayat", label: "Gram Panchayat / Ward" }
];

export function SaasLocationGovernancePicker({
  workspaceId,
  values,
  transport,
  onChange,
  disabled = false
}: SaasLocationGovernancePickerProps) {
  const client = useMemo(() => createIndiaLgdCatalogReader(
    new LocationBrowserCatalogClient({
      access: { type: "workspace", workspaceId },
      transport
    })
  ), [transport, workspaceId]);
  const [canonicalSelection, setCanonicalSelection] = useState<readonly CanonicalLocationSelection[]>([]);
  const [unverifiedManual, setUnverifiedManual] = useState<{
    field: LegacyLocationGovernanceField;
    selection: UnverifiedCustomLocationSelection & { verificationState: "unverified_custom" };
  } | null>(null);

  const handleCanonicalChange = useCallback((selection: readonly CanonicalLocationSelection[]) => {
    setCanonicalSelection(selection);
    setUnverifiedManual(null);
    if (selection.length <= 1) return;
    onChange(
      projectCanonicalSelectionToLegacyLocation(selection).legacyLabels,
      createCanonicalLocationReferenceClaim(selection)
    );
  }, [onChange]);

  const handleCanonicalClear = useCallback(() => {
    setCanonicalSelection([]);
    setUnverifiedManual(null);
    onChange({ ...EMPTY_LEGACY_LOCATION_GOVERNANCE }, null);
  }, [onChange]);

  const handleManualChange = useCallback((
    field: LegacyLocationGovernanceField,
    label: string
  ) => {
    setCanonicalSelection([]);
    if (label.trim()) {
      const selection = createUnverifiedCustomLocation(label);
      setUnverifiedManual({
        field,
        selection: { ...selection, verificationState: selection.verificationStatus }
      });
    } else {
      setUnverifiedManual(null);
    }
    const nextValues = updateUnverifiedLegacyLocation(values, field, label);
    onChange(nextValues, label.trim() ? createCustomLocationReference(nextValues, field, label) : null);
  }, [onChange, values]);

  const selectedNode = canonicalSelection[canonicalSelection.length - 1];

  return (
    <>
      <div className="wide">
        <CanonicalLocationPicker
          id="saas-location-governance-canonical"
          client={client}
          rootNodeId="in"
          label="Official canonical location"
          disabled={disabled}
          onChange={handleCanonicalChange}
          onClear={handleCanonicalClear}
        />
      </div>

      {selectedNode && canonicalSelection.length > 1 && (
        <div className="info-message wide" data-testid="saas-canonical-location-identity">
          <strong>{selectedNode.label}</strong>
          <span>Canonical node: {selectedNode.canonicalNodeId}</span>
          <span>Official code: {selectedNode.officialCode ?? "Not assigned"}</span>
          <span>{selectedNode.authority} / {selectedNode.sourceDataset} / {selectedNode.datasetVersion}</span>
        </div>
      )}

      {manualFields.map(({ field, label }) => (
        <Field key={field} label={label}>
          <input
            id={`saas-location-governance-manual-${field}`}
            value={values[field]}
            onChange={(event) => handleManualChange(field, event.currentTarget.value)}
            disabled={disabled}
            autoComplete="off"
            data-verification-state="unverified_custom"
          />
          <small>
            {unverifiedManual?.field === field
              ? `"${unverifiedManual.selection.label}" is an ${unverifiedManual.selection.verificationState} location.`
              : "Manual compatibility values remain unverified until explicitly reconciled."}
          </small>
        </Field>
      ))}
    </>
  );
}
