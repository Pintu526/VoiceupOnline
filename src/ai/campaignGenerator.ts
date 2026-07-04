import { buildCampaignCopilotPrompt } from "./promptBuilder";
import { mockAiCampaignProvider } from "./mockProvider";
import type {
  AiCampaignCopilotResult,
  AiCampaignIdeaInput,
  AiCampaignProvider,
  AiProviderId
} from "./types";

const providers: Record<AiProviderId, AiCampaignProvider | null> = {
  mock: mockAiCampaignProvider,
  openai: null,
  gemini: null,
  claude: null,
  "azure-openai": null,
  openrouter: null,
  "local-llm": null
};

export const futureAiProviders = [
  "OpenAI",
  "Gemini",
  "Claude",
  "Azure OpenAI",
  "OpenRouter",
  "Local LLM"
];

export async function generateCampaignWithAi(
  input: AiCampaignIdeaInput,
  providerId: AiProviderId = "mock"
): Promise<AiCampaignCopilotResult> {
  const provider = providers[providerId] ?? mockAiCampaignProvider;
  return provider.generateCampaign(input);
}

export function previewCampaignPrompt(input: AiCampaignIdeaInput) {
  return buildCampaignCopilotPrompt(input);
}
