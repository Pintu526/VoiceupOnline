import { useEffect, useState } from "react";
import {
  readPublicCampaignLocationHierarchy,
  type CampaignLocationHierarchyEntry,
  type CampaignLocationPath,
  type PublicCampaignCustomLocation
} from "../backend";
import type { CampaignLocationCatalogState } from "./useCampaignLocationCatalog";

function toCatalogEntry(location: CampaignLocationHierarchyEntry): PublicCampaignCustomLocation {
  return {
    country: location.country,
    state: location.state,
    district: location.district,
    block: location.block,
    panchayat: location.panchayat,
    village: location.village,
    postalCode: location.postalCode
  };
}

export function usePublicCampaignLocationCatalog(
  campaignSlug: string,
  selectedPath: Partial<CampaignLocationPath>
): CampaignLocationCatalogState {
  const [catalog, setCatalog] = useState<CampaignLocationCatalogState>(() =>
    campaignSlug ? { status: "loading", locations: [] } : { status: "idle", locations: [] }
  );

  useEffect(() => {
    if (!campaignSlug) {
      setCatalog({ status: "idle", locations: [] });
      return;
    }
    let cancelled = false;
    setCatalog({ status: "loading", locations: [] });

    async function loadCatalog() {
      try {
        const parentPaths: Partial<CampaignLocationPath>[] = [{ country: "India" }];
        if (selectedPath.state) parentPaths.push({ country: "India", state: selectedPath.state });
        if (selectedPath.state && selectedPath.district) parentPaths.push({
          country: "India", state: selectedPath.state, district: selectedPath.district
        });
        if (selectedPath.state && selectedPath.district && selectedPath.block) parentPaths.push({
          country: "India", state: selectedPath.state, district: selectedPath.district, block: selectedPath.block
        });
        if (selectedPath.state && selectedPath.district && selectedPath.block && selectedPath.panchayat) {
          parentPaths.push({
            country: "India",
            state: selectedPath.state,
            district: selectedPath.district,
            block: selectedPath.block,
            panchayat: selectedPath.panchayat
          });
        }
        const results = await Promise.all(parentPaths.map((parentPath) =>
          readPublicCampaignLocationHierarchy(campaignSlug, parentPath)
        ));
        if (!cancelled) {
          setCatalog({
            status: "ready",
            locations: results.flatMap((result) => result.locations.map(toCatalogEntry))
          });
        }
      } catch {
        if (!cancelled) setCatalog({ status: "error", locations: [] });
      }
    }

    void loadCatalog();
    return () => { cancelled = true; };
  }, [campaignSlug, selectedPath.state, selectedPath.district, selectedPath.block, selectedPath.panchayat]);

  return catalog;
}
