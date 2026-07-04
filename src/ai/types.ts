import type { CampaignCategory, SignerRequiredField } from "../types";

export type AiProviderId =
  | "mock"
  | "openai"
  | "gemini"
  | "claude"
  | "azure-openai"
  | "openrouter"
  | "local-llm";

export type AiLanguage = "English" | "Hindi" | "Odia";

export interface AiCampaignIdeaInput {
  idea: string;
  language: AiLanguage;
  locationHint?: string;
}

export interface AiCampaignDraft {
  title: string;
  subtitle: string;
  summary: string;
  fullDescription: string;
  objectives: string[];
  problemStatement: string;
  expectedOutcome: string;
  suggestedTarget: number;
  suggestedDurationDays: number;
  suggestedCategory: CampaignCategory;
  suggestedTags: string[];
  suggestedBannerStyle: string;
  suggestedHeroImagePrompt: string;
  suggestedSupporterFields: SignerRequiredField[];
  suggestedAuthority: string;
  suggestedHashtags: string[];
  whatsappMessage: string;
  facebookPost: string;
  xPost: string;
  linkedInPost: string;
  emailSubject: string;
  emailBody: string;
  pressRelease: string;
  volunteerPlan: string[];
  qrPosterHeadline: string;
  qualityScore: number;
}

export interface AiCampaignSimulation {
  potentialSupporters: number;
  authorityReach: "Low" | "Medium" | "High";
  volunteerEffort: "Low" | "Medium" | "High";
  communicationEffort: "Low" | "Medium" | "High";
  estimatedCompletion: string;
  riskLevel: "Low" | "Medium" | "High";
}

export interface AiCampaignCopilotResult {
  draft: AiCampaignDraft;
  advisor: string[];
  simulation: AiCampaignSimulation;
  contentStudio: {
    posterText: string;
    speech: string;
    pressRelease: string;
    volunteerScript: string;
    meetingAgenda: string;
    pamphlet: string;
    leaflet: string;
  };
}

export interface AiCampaignProvider {
  id: AiProviderId;
  label: string;
  generateCampaign(input: AiCampaignIdeaInput): Promise<AiCampaignCopilotResult>;
}
