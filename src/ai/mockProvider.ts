import type { AiCampaignIdeaInput, AiCampaignProvider, AiCampaignCopilotResult } from "./types";

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferCategory(idea: string) {
  const lower = idea.toLowerCase();
  if (/(school|college|teacher|scholarship|library)/.test(lower)) return "Education";
  if (/(hospital|health|medical|ambulance|phc|blood)/.test(lower)) return "Health";
  if (/(tree|lake|river|plastic|forest|chilika|environment)/.test(lower)) return "Environment";
  if (/(bus|traffic|transport|road|pothole|street)/.test(lower)) return "Transport";
  if (/(house|housing|rent|slum)/.test(lower)) return "Housing";
  return "Civic";
}

function inferAuthority(idea: string) {
  const lower = idea.toLowerCase();
  if (/(road|pothole|street|drainage|footpath)/.test(lower)) return "Municipal Commissioner and Executive Engineer";
  if (/(tree|forest|lake|river|plastic|chilika)/.test(lower)) return "Forest Officer, Collector, and Municipal Commissioner";
  if (/(cow|animal|veterinary)/.test(lower)) return "Animal Husbandry Officer and District Collector";
  if (/(school|teacher|education|college)/.test(lower)) return "District Education Officer and Collector";
  if (/(hospital|medical|ambulance|phc)/.test(lower)) return "Chief District Medical Officer and Collector";
  return "District Collector and relevant department officer";
}

function getRiskLevel(idea: string): "Low" | "Medium" | "High" {
  return /(slaughter|corruption|violence|crime|illegal)/i.test(idea) ? "High" : "Medium";
}

export const mockAiCampaignProvider: AiCampaignProvider = {
  id: "mock",
  label: "Mock provider",
  async generateCampaign(input: AiCampaignIdeaInput): Promise<AiCampaignCopilotResult> {
    const cleanIdea = input.idea.trim() || "Repair potholes on Nandankanan Road";
    const topic = titleCase(cleanIdea);
    const category = inferCategory(cleanIdea);
    const authority = inferAuthority(cleanIdea);
    const qualityScore = cleanIdea.length > 24 ? 82 : 74;

    return {
      draft: {
        title: `${cleanIdea}: A Public Appeal for Timely Action`,
        subtitle: `A community-led campaign to move "${cleanIdea}" from concern to resolution.`,
        summary: `Residents are coming together to request practical, time-bound action on "${cleanIdea}".`,
        fullDescription: `This campaign documents public concern about "${cleanIdea}" and converts it into a respectful petition for the appropriate authority. The goal is to gather verified community support, present clear local context, and request a transparent action plan with follow-up updates for "${cleanIdea}".`,
        objectives: [
          `Collect verified public support from citizens affected by "${cleanIdea}"`,
          "Present a clear petition to the responsible authority",
          "Create a follow-up trail for updates, meetings, and resolution"
        ],
        problemStatement: `The issue of "${cleanIdea}" is affecting public convenience, trust, safety, or civic quality of life. Citizens need a single organized voice that explains the problem clearly and asks for accountable action.`,
        expectedOutcome: `A written authority response, a visible action plan, and measurable progress updates for supporters of "${cleanIdea}".`,
        suggestedTarget: category === "Environment" ? 2500 : 1000,
        suggestedDurationDays: category === "Civic" || category === "Transport" ? 21 : 30,
        suggestedCategory: category,
        suggestedTags: [category, "Public petition", "Community action", "Voiceup"],
        suggestedBannerStyle: "Use a clear local photo with the issue visible, minimal text, and a strong civic headline.",
        suggestedHeroImagePrompt: `A realistic civic campaign banner showing community concern about ${cleanIdea}, Indian urban/local context, hopeful tone, clean composition.`,
        suggestedSupporterFields: ["name", "phone"],
        suggestedAuthority: authority,
        suggestedHashtags: ["#Voiceup", `#${topic.replace(/[^A-Za-z0-9]/g, "")}`, "#PublicAction"],
        whatsappMessage: `I signed this campaign for ${topic}. Please add your support and share it with people who care about this issue.`,
        facebookPost: `Our community is asking for timely action on ${topic}. Add your signature and help make this public appeal stronger.`,
        xPost: `Support the campaign: ${topic}. Add your voice for timely civic action. #Voiceup`,
        linkedInPost: `Community-led public action works best when concerns are documented clearly. Support this campaign on ${topic} and help route it to the right authority.`,
        emailSubject: `Public appeal: ${topic}`,
        emailBody: `Dear supporter,\n\nWe are gathering verified public support for ${topic}. Please review the campaign, sign if you agree, and share it with your network.\n\nThank you for adding your voice.`,
        pressRelease: `Citizens have launched a public campaign on "${cleanIdea}", requesting timely action from ${authority}. The campaign aims to collect verified support and submit a consolidated petition with clear local context.`,
        volunteerPlan: [
          "Identify affected localities and community champions",
          "Share the campaign link through trusted groups",
          "Collect field evidence and supporter concerns",
          "Prepare a respectful authority submission",
          "Follow up with updates for supporters"
        ],
        qrPosterHeadline: `Scan to support ${cleanIdea}`,
        qualityScore
      },
      advisor: [
        qualityScore < 80 ? "Add a more specific location to improve campaign quality." : "Campaign idea is specific enough for a strong first draft.",
        "Upload a real local banner image before publishing.",
        "Confirm the final authority after selecting campaign location.",
        "Keep required supporter fields minimal to improve conversion."
      ],
      simulation: {
        potentialSupporters: category === "Environment" ? 3500 : 1500,
        authorityReach: authority.includes("Collector") ? "High" : "Medium",
        volunteerEffort: getRiskLevel(cleanIdea) === "High" ? "High" : "Medium",
        communicationEffort: "Medium",
        estimatedCompletion: category === "Transport" || category === "Civic" ? "2 to 4 weeks" : "4 to 8 weeks",
        riskLevel: getRiskLevel(cleanIdea)
      },
      contentStudio: {
        posterText: `Support ${topic}. Scan, sign, and share.`,
        speech: `Friends, we are here to turn a shared concern into a clear public request. This campaign asks for timely action on ${topic}.`,
        pressRelease: `A public campaign has been created for ${topic}, inviting citizens to add verified support and route the petition to ${authority}.`,
        volunteerScript: `Hello, we are collecting public support for ${topic}. Would you like to review the campaign and add your signature?`,
        meetingAgenda: "1. Issue briefing\n2. Evidence review\n3. Supporter outreach\n4. Authority route\n5. Follow-up owners",
        pamphlet: `Why this matters: ${topic}. What you can do: sign, share, volunteer, and follow updates.`,
        leaflet: `Add your voice for ${topic}. Scan the QR code and sign the public appeal.`
      }
    };
  }
};
