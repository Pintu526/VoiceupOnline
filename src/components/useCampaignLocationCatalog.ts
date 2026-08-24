import { useEffect, useState } from "react";
import {
  getCurrentWorkspaceId,
  readCampaignLocations,
  type CampaignLocationRecord,
  type PublicCampaignCustomLocation
} from "../backend";
import type { IndiaLocationCatalogStatus } from "./indiaLocationOptions";

function toCatalogEntry(location: CampaignLocationRecord): PublicCampaignCustomLocation {
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
  campaign?: { id: string; slug: string } | null
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
      const accumulated: PublicCampaignCustomLocation[] = [];
      let offset = 0;
      try {
        while (true) {
          const result = await readCampaignLocations(
            {
              workspaceId: getCurrentWorkspaceId(),
              campaignId,
              campaignSlug
            },
            { active: true, limit: 500, offset }
          );
          for (const location of result.locations) {
            accumulated.push(toCatalogEntry(location));
          }
          if (!result.hasMore) break;
          if (result.nextOffset === null || result.nextOffset <= offset) break;
          offset = result.nextOffset;
        }
        if (!cancelled) setCatalog({ status: "ready", locations: accumulated });
      } catch {
        if (!cancelled) setCatalog({ status: "error", locations: [] });
      }
    }

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [campaign?.id, campaign?.slug]);

  return catalog;
}
