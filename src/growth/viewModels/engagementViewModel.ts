import { buildCelebrationItems } from "../celebrations";
import { buildCampaignEngagementHubModel } from "../engagement/engagementHubService";
import { buildCampaignGamificationModel } from "../gamification/gamificationService";
import { buildCampaignIntelligenceModel, type CampaignIntelligenceModel } from "../intelligence";
import { buildEngagementInsights, type EngagementInsight } from "../insights";
import type { GrowthRuntimeState } from "../lifecycle";
import { buildCampaignShareStudioModel } from "../shareStudio/shareStudioService";
import type { GrowthDashboardModel } from "../types";
import type { CelebrationItem } from "../celebrations";
import type { LeaderboardEntry } from "../types";

export interface GrowthEngagementHubViewModel {
  activeCampaignId?: string;
  runtime?: GrowthRuntimeState;
  engagement: ReturnType<typeof buildCampaignEngagementHubModel>;
  gamification: ReturnType<typeof buildCampaignGamificationModel>;
  shareStudio: ReturnType<typeof buildCampaignShareStudioModel>;
  insights: EngagementInsight[];
  celebrations: CelebrationItem[];
  intelligence: CampaignIntelligenceModel;
  leaderboard: {
    overall: LeaderboardEntry[];
    referral: LeaderboardEntry[];
    field: LeaderboardEntry[];
  };
}

export function buildGrowthEngagementHubViewModel(options: {
  model: GrowthDashboardModel;
  runtime?: GrowthRuntimeState;
  activeCampaignId?: string;
}): GrowthEngagementHubViewModel {
  const { model, runtime, activeCampaignId } = options;
  return {
    activeCampaignId,
    runtime,
    engagement: buildCampaignEngagementHubModel({ model, runtime, activeCampaignId }),
    gamification: buildCampaignGamificationModel(model),
    shareStudio: buildCampaignShareStudioModel(),
    insights: buildEngagementInsights(model),
    celebrations: buildCelebrationItems(model, runtime, activeCampaignId),
    intelligence: buildCampaignIntelligenceModel({ model, runtime, activeCampaignId }),
    leaderboard: model.leaderboards
  };
}
