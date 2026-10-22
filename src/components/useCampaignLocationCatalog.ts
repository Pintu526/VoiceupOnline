import { useEffect, useState } from "react";
import {
  getCurrentWorkspaceId,
  readCampaignLocationHierarchy,
  type CampaignLocationHierarchyEntry,
  type CampaignLocationPath,
  type PublicCampaignCustomLocation
} from "../backend";
import type { IndiaLocationCatalogStatus } from "./indiaLocationOptions";

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

export interface CampaignLocationCatalogState {
  status: IndiaLocationCatalogStatus;
  locations: PublicCampaignCustomLocation[];
}

export function useCampaignLocationCatalog(
  campaign?: { id: string; slug: string } | null,
  selectedPath: Partial<CampaignLocationPath> = {},
  refreshKey = 0
): CampaignLocationCatalogState {
  const [catalog, setCatalog] = useState<CampaignLocationCatalogState>(() =>
    campaign?.id && campaign.slug
      ? { status: "loading", locations: [] }
      : { status: "idle", locations: [] }
  );

  useEffect(() => {
    if (!campaign?.id || !campaign.slug) {
      setCatalog({ status: "idle", locations: [] });
      return;
    }

    let cancelled = false;
    const campaignId = campaign.id;
    const campaignSlug = campaign.slug;
    setCatalog({ status: "loading", locations: [] });

    async function loadCatalog() {
      try {
        const parentPaths: Partial<CampaignLocationPath>[] = [{ country: "India" }];
        if (selectedPath.state) parentPaths.push({ country: "India", state: selectedPath.state });
        if (selectedPath.state && selectedPath.district) parentPaths.push({
          country: "India",
          state: selectedPath.state,
          district: selectedPath.district
        });
        if (selectedPath.state && selectedPath.district && selectedPath.block) parentPaths.push({
          country: "India",
          state: selectedPath.state,
          district: selectedPath.district,
          block: selectedPath.block
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
        const results = await Promise.all(parentPaths.map((parentPath) => readCampaignLocationHierarchy(
          {
            workspaceId: getCurrentWorkspaceId(),
            campaignId,
            campaignSlug
          },
          parentPath
        )));
        const accumulated = results.flatMap((result) => result.locations.map(toCatalogEntry));
        if (!cancelled) setCatalog({ status: "ready", locations: accumulated });
      } catch {
        if (!cancelled) setCatalog({ status: "error", locations: [] });
      }
    }

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [
    campaign?.id,
    campaign?.slug,
    selectedPath.state,
    selectedPath.district,
    selectedPath.block,
    selectedPath.panchayat,
    refreshKey
  ]);

  return catalog;
}
