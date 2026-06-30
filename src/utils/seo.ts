import type { Campaign } from "../types";
import type { getLegalPage } from "./routing";

export function updateSeoMetadata(
  campaign: Campaign | undefined,
  legalPage: ReturnType<typeof getLegalPage>,
  isPublicCampaignRoute: boolean
): void {
  if (typeof document === "undefined") return;

  const title =
    isPublicCampaignRoute && campaign
      ? `${campaign.title} | Voiceup Bharat`
      : "Voiceup Bharat";

  const description =
    isPublicCampaignRoute && campaign
      ? campaign.description || campaign.appealContent
      : legalPage
        ? `${legalPage} | Voiceup Bharat`
        : "Voiceup Bharat helps Indian organizations create public campaigns, collect support, and engage participants.";

  document.title = title;
  setMetaTag("description", description ?? "");
  setMetaProperty("og:title", title);
  setMetaProperty("og:description", description ?? "");
  setMetaProperty("og:type", isPublicCampaignRoute ? "article" : "website");
}

function setMetaTag(name: string, content: string): void {
  let element = document.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setMetaProperty(property: string, content: string): void {
  let element = document.querySelector(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}
