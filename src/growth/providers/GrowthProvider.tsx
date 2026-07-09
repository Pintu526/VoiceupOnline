import { createContext, useMemo, type ReactNode } from "react";
import type { GrowthAnalyticsDomainModel, GrowthDashboardModel, GrowthEngineInput } from "../types";
import { buildGrowthDashboardModel } from "../services/growthEngineService";
import {
  GrowthEventDispatcher,
  GrowthEventFactory,
  GrowthEventType,
  type GrowthEvent,
  type GrowthEventContext,
  type GrowthEventIntent,
  type GrowthEventMetadata
} from "../events";
import { GROWTH_FEATURE_FLAGS } from "../constants/featureFlags";
import {
  buildSupporterGrowthAccounts,
  calculatePointContribution,
  createDisabledContributionSettings,
  validateContributionSettings
} from "../contributions";
import {
  calculateGrowthCredits,
  createEmptyGrowthCreditConfiguration,
  validateGrowthCreditConfiguration
} from "../credits";
import {
  applyGrowthCreditsToWallet,
  createGrowthWallet
} from "../wallet";
import {
  calculatePromotionDistribution,
  createDisabledPromotionConfiguration,
  evaluatePromotion,
  resolvePromotionRounds
} from "../promotion";
import {
  createEmptyRecognitionConfiguration,
  evaluateRecognition,
  validateRecognitionConfiguration
} from "../recognition";
import {
  buildRecognitionTree,
  buildSupporterGrowthPortal
} from "../tree";
import {
  createCampaignGrowthSimulationEvent,
  createSupporterGrowthSimulationEvent,
  simulateCampaignGrowth,
  simulateSupporterGrowth
} from "../calculator";
import { createTimelineRecordFromEvent } from "../timeline";
import {
  createEmptyAdvancementConfiguration,
  evaluateAdvancement,
  validateAdvancementConfiguration
} from "../advancement";
import { evaluateAchievementPeriod } from "../achievements";
import { buildContributionLeaderboard } from "../leaderboards";
import { evaluatePrizeQualifications } from "../prizes";
import {
  createEmptyContributionAdvancementConfiguration,
  evaluateContributionAdvancement
} from "../services/contributionAdvancementService";
import {
  createDisabledGrowthAdminFeatureConfiguration,
  createEmptyGrowthOperatingSystemConfiguration,
  evaluateGrowthOperatingSystemActivity
} from "../services/growthOperatingSystemService";

export interface GrowthConfiguration {
  featureFlag: string;
  queueMode: "in-memory";
  observabilityReady: boolean;
  aiRecommendationsReady: boolean;
  webhookReady: boolean;
}

export interface GrowthPermissions {
  canViewGrowthDashboard: boolean;
  canPublishGrowthEvents: boolean;
  canManageRewards: boolean;
  canManageMerchantRewards: boolean;
}

export interface GrowthServices {
  buildDashboardModel: typeof buildGrowthDashboardModel;
  credits: {
    calculateGrowthCredits: typeof calculateGrowthCredits;
    createEmptyGrowthCreditConfiguration: typeof createEmptyGrowthCreditConfiguration;
    validateGrowthCreditConfiguration: typeof validateGrowthCreditConfiguration;
  };
  wallet: {
    applyGrowthCreditsToWallet: typeof applyGrowthCreditsToWallet;
    createGrowthWallet: typeof createGrowthWallet;
  };
  promotion: {
    calculatePromotionDistribution: typeof calculatePromotionDistribution;
    createDisabledPromotionConfiguration: typeof createDisabledPromotionConfiguration;
    evaluatePromotion: typeof evaluatePromotion;
    resolvePromotionRounds: typeof resolvePromotionRounds;
  };
  recognition: {
    createEmptyRecognitionConfiguration: typeof createEmptyRecognitionConfiguration;
    evaluateRecognition: typeof evaluateRecognition;
    validateRecognitionConfiguration: typeof validateRecognitionConfiguration;
  };
  tree: {
    buildRecognitionTree: typeof buildRecognitionTree;
    buildSupporterGrowthPortal: typeof buildSupporterGrowthPortal;
  };
  calculator: {
    createCampaignGrowthSimulationEvent: typeof createCampaignGrowthSimulationEvent;
    createSupporterGrowthSimulationEvent: typeof createSupporterGrowthSimulationEvent;
    simulateCampaignGrowth: typeof simulateCampaignGrowth;
    simulateSupporterGrowth: typeof simulateSupporterGrowth;
  };
  timeline: {
    createTimelineRecordFromEvent: typeof createTimelineRecordFromEvent;
  };
  contribution: {
    buildSupporterGrowthAccounts: typeof buildSupporterGrowthAccounts;
    calculatePointContribution: typeof calculatePointContribution;
    createDisabledContributionSettings: typeof createDisabledContributionSettings;
    validateContributionSettings: typeof validateContributionSettings;
  };
  advancement: {
    createEmptyAdvancementConfiguration: typeof createEmptyAdvancementConfiguration;
    evaluateAdvancement: typeof evaluateAdvancement;
    validateAdvancementConfiguration: typeof validateAdvancementConfiguration;
  };
  achievements: {
    evaluateAchievementPeriod: typeof evaluateAchievementPeriod;
  };
  prizes: {
    evaluatePrizeQualifications: typeof evaluatePrizeQualifications;
  };
  leaderboards: {
    buildContributionLeaderboard: typeof buildContributionLeaderboard;
  };
  contributionAdvancement: {
    createEmptyContributionAdvancementConfiguration: typeof createEmptyContributionAdvancementConfiguration;
    evaluateContributionAdvancement: typeof evaluateContributionAdvancement;
  };
  operatingSystem: {
    createDisabledGrowthAdminFeatureConfiguration: typeof createDisabledGrowthAdminFeatureConfiguration;
    createEmptyGrowthOperatingSystemConfiguration: typeof createEmptyGrowthOperatingSystemConfiguration;
    evaluateGrowthOperatingSystemActivity: typeof evaluateGrowthOperatingSystemActivity;
  };
}

export interface GrowthEventsApi {
  dispatcher: GrowthEventDispatcher;
  publishEvent: (
    type: GrowthEventType,
    metadata?: GrowthEventMetadata,
    context?: Partial<GrowthEventContext>
  ) => Promise<GrowthEvent>;
  publishIntent: (intent: GrowthEventIntent) => Promise<GrowthEvent>;
  publishIntents: (intents: GrowthEventIntent[]) => Promise<GrowthEvent[]>;
}

export interface GrowthProviderValue {
  growthContext: GrowthEventContext;
  events: GrowthEventsApi;
  dashboardModel: GrowthDashboardModel;
  services: GrowthServices;
  configuration: GrowthConfiguration;
  analytics: GrowthAnalyticsDomainModel;
  permissions: GrowthPermissions;
}

export const GrowthContext = createContext<GrowthProviderValue | null>(null);

interface GrowthProviderProps {
  input: GrowthEngineInput;
  children: ReactNode;
  permissions?: Partial<GrowthPermissions>;
  configuration?: Partial<GrowthConfiguration>;
}

function getRuntimeContext(): Pick<GrowthEventContext, "device" | "browser" | "platform" | "language" | "timezone"> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      device: "server",
      browser: "",
      platform: "",
      language: "en",
      timezone: "UTC"
    };
  }

  return {
    device: navigator.maxTouchPoints > 0 ? "touch" : "desktop",
    browser: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ""
  };
}

function createBaseEventContext(input: GrowthEngineInput): GrowthEventContext {
  return {
    workspaceId: input.organization.id || "workspace-local",
    campaignId: input.activeCampaign?.id,
    actorId: input.organization.ownerEmail || input.organization.billingEmail || "workspace-user",
    country: input.activeCampaign?.country,
    state: input.activeCampaign?.state,
    city: input.activeCampaign?.district || input.activeCampaign?.location,
    ...getRuntimeContext()
  };
}

export function GrowthProvider({
  input,
  children,
  permissions,
  configuration
}: GrowthProviderProps) {
  const dispatcher = useMemo(() => new GrowthEventDispatcher(), []);
  const dashboardModel = useMemo(() => buildGrowthDashboardModel(input), [input]);
  const growthContext = useMemo(() => createBaseEventContext(input), [input]);

  const value = useMemo<GrowthProviderValue>(() => {
    const publishIntent: GrowthEventsApi["publishIntent"] = (intent) => {
      const event = GrowthEventFactory.create(intent.type, {
        context: { ...growthContext, ...intent.context },
        metadata: intent.metadata ?? {},
        priority: intent.priority
      });
      return dispatcher.publish(event);
    };
    const publishEvent: GrowthEventsApi["publishEvent"] = (type, metadata = {}, context = {}) =>
      publishIntent({ type, metadata, context });
    const publishIntents: GrowthEventsApi["publishIntents"] = (intents) =>
      Promise.all(intents.map((intent) => publishIntent(intent)));

    return {
      growthContext,
      events: {
        dispatcher,
        publishEvent,
        publishIntent,
        publishIntents
      },
      dashboardModel,
      services: {
        buildDashboardModel: buildGrowthDashboardModel,
        credits: {
          calculateGrowthCredits,
          createEmptyGrowthCreditConfiguration,
          validateGrowthCreditConfiguration
        },
        wallet: {
          applyGrowthCreditsToWallet,
          createGrowthWallet
        },
        promotion: {
          calculatePromotionDistribution,
          createDisabledPromotionConfiguration,
          evaluatePromotion,
          resolvePromotionRounds
        },
        recognition: {
          createEmptyRecognitionConfiguration,
          evaluateRecognition,
          validateRecognitionConfiguration
        },
        tree: {
          buildRecognitionTree,
          buildSupporterGrowthPortal
        },
        calculator: {
          createCampaignGrowthSimulationEvent,
          createSupporterGrowthSimulationEvent,
          simulateCampaignGrowth,
          simulateSupporterGrowth
        },
        timeline: {
          createTimelineRecordFromEvent
        },
        contribution: {
          buildSupporterGrowthAccounts,
          calculatePointContribution,
          createDisabledContributionSettings,
          validateContributionSettings
        },
        advancement: {
          createEmptyAdvancementConfiguration,
          evaluateAdvancement,
          validateAdvancementConfiguration
        },
        achievements: {
          evaluateAchievementPeriod
        },
        prizes: {
          evaluatePrizeQualifications
        },
        leaderboards: {
          buildContributionLeaderboard
        },
        contributionAdvancement: {
          createEmptyContributionAdvancementConfiguration,
          evaluateContributionAdvancement
        },
        operatingSystem: {
          createDisabledGrowthAdminFeatureConfiguration,
          createEmptyGrowthOperatingSystemConfiguration,
          evaluateGrowthOperatingSystemActivity
        }
      },
      configuration: {
        featureFlag: GROWTH_FEATURE_FLAGS.growthEngine,
        queueMode: "in-memory",
        observabilityReady: true,
        aiRecommendationsReady: false,
        webhookReady: false,
        ...configuration
      },
      analytics: dashboardModel.analytics,
      permissions: {
        canViewGrowthDashboard: true,
        canPublishGrowthEvents: true,
        canManageRewards: false,
        canManageMerchantRewards: false,
        ...permissions
      }
    };
  }, [configuration, dashboardModel, dispatcher, growthContext, permissions]);

  return <GrowthContext.Provider value={value}>{children}</GrowthContext.Provider>;
}
