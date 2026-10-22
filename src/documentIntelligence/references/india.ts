import { getMaintainedDistrictOptions, indianStatesAndUnionTerritories } from "../../geography.ts";
import type { DocumentReferenceData } from "../types.ts";
import type { CanonicalLocationCatalogReader } from "../../businessOs/location/ui/CanonicalLocationUiModel.ts";
import type { LocationBrowserDatasetIdentity } from "../../businessOs/location/browser/LocationBrowserCatalogContract.ts";

export function createIndiaDocumentReferenceData(): DocumentReferenceData {
  return {
    states: Object.fromEntries(indianStatesAndUnionTerritories.map((state) => [
      state,
      state === "Odisha" ? ["Odisha", "Orissa"] : [state]
    ])),
    districtsByState: Object.fromEntries(indianStatesAndUnionTerritories.map((state) => [
      state,
      getMaintainedDistrictOptions(state)
    ]))
  };
}

export interface CanonicalIndiaDocumentReferenceData {
  referenceData: DocumentReferenceData;
  dataset: LocationBrowserDatasetIdentity;
  source: "canonical_location_platform";
}

/**
 * Versioned OCR suggestion vocabulary. It is deliberately only vocabulary:
 * matching an OCR token never assigns canonical identity to a supporter.
 */
export async function createCanonicalIndiaDocumentReferenceData(
  reader: CanonicalLocationCatalogReader
): Promise<CanonicalIndiaDocumentReferenceData> {
  const [dataset, states] = await Promise.all([
    reader.metadata(),
    reader.children("in", 100)
  ]);
  const districts = await Promise.all(states.map(async (state) => ({
    state: state.label,
    districts: (await reader.children(state.nodeId, 100))
      .filter((node) => node.level === "district")
      .map((node) => node.label)
  })));
  return {
    dataset,
    source: "canonical_location_platform",
    referenceData: {
      states: Object.fromEntries(states.map((state) => [state.label, [state.label]])),
      districtsByState: Object.fromEntries(districts.map((entry) => [entry.state, entry.districts]))
    }
  };
}
