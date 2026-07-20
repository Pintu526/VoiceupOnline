import { getMaintainedDistrictOptions, indianStatesAndUnionTerritories } from "../../geography.ts";
import type { DocumentReferenceData } from "../types.ts";

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
