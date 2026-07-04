import type { AiCampaignIdeaInput } from "./types";
import { campaignCopilotOutputSections, campaignCopilotSystemPrompt } from "./promptTemplates";

export function buildCampaignCopilotPrompt(input: AiCampaignIdeaInput) {
  return [
    campaignCopilotSystemPrompt.trim(),
    `Language: ${input.language}`,
    `Campaign idea: ${input.idea}`,
    input.locationHint ? `Location hint: ${input.locationHint}` : "Location hint: Not provided",
    "Return concise structured content for these sections:",
    campaignCopilotOutputSections.map((section) => `- ${section}`).join("\n")
  ].join("\n\n");
}
