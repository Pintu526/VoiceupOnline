import type { SupporterGrowthAccount } from "../contributions/types";
import type { RecognitionEvaluationResult } from "../recognition/types";
import type { GrowthWallet } from "../wallet/types";

export interface RecognitionTreeNetworkSummary {
  directNetwork: number;
  indirectNetwork: number;
  verifiedReferrals: number;
}

export interface RecognitionJourneyStep {
  id: string;
  label: string;
  reached: boolean;
  reachedAt?: string;
}

export interface RecognitionTreeNode {
  supporterId: string;
  referralCode?: string;
  depth: number;
  directChildren: number;
  verifiedReferrals: number;
}

export interface RecognitionTreeModel {
  campaignId: string;
  supporterId: string;
  currentRecognition?: string;
  currentWallet: number;
  promotionProgress: number;
  contributionCredits: number;
  verifiedReferrals: number;
  currentRank?: number;
  network: RecognitionTreeNetworkSummary;
  journey: RecognitionJourneyStep[];
  nodes: RecognitionTreeNode[];
}

export interface SupporterPortalShareAction {
  id: string;
  label: string;
  channel: "native" | "whatsapp" | "sms" | "facebook" | "x" | "linkedin" | "telegram" | "email" | "copy" | "poster";
  url?: string;
}

export interface SupporterGrowthPortalModel {
  routePattern: "/r/:supporterCode";
  supporterCode: string;
  publicPath: string;
  campaignId: string;
  supporterId: string;
  referralLink: string;
  qrPayload: string;
  tree: RecognitionTreeModel;
  wallet: GrowthWallet;
  shareActions: SupporterPortalShareAction[];
  accessibleWithoutAdminLogin: true;
}

export interface RecognitionTreeInput {
  supporter: SupporterGrowthAccount;
  accounts: SupporterGrowthAccount[];
  wallet: GrowthWallet;
  recognition: RecognitionEvaluationResult;
  currentRank?: number;
}
