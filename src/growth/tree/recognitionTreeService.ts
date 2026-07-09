import type { SupporterGrowthAccount } from "../contributions/types";
import type {
  RecognitionJourneyStep,
  RecognitionTreeInput,
  RecognitionTreeModel,
  RecognitionTreeNode
} from "./types";

function getDirectChildren(supporter: SupporterGrowthAccount, accounts: SupporterGrowthAccount[]) {
  if (!supporter.referralCode) return [];
  return accounts.filter((account) => account.parentReferralCode === supporter.referralCode);
}

function getIndirectChildren(children: SupporterGrowthAccount[], accounts: SupporterGrowthAccount[]) {
  const directIds = new Set(children.map((child) => child.supporterId));
  const childCodes = new Set(children.map((child) => child.referralCode).filter(Boolean));
  return accounts.filter(
    (account) => !directIds.has(account.supporterId) && account.parentReferralCode && childCodes.has(account.parentReferralCode)
  );
}

function toNode(account: SupporterGrowthAccount, accounts: SupporterGrowthAccount[], depth: number): RecognitionTreeNode {
  return {
    supporterId: account.supporterId,
    referralCode: account.referralCode,
    depth,
    directChildren: getDirectChildren(account, accounts).length,
    verifiedReferrals: account.verifiedReferrals
  };
}

function buildJourney(input: RecognitionTreeInput): RecognitionJourneyStep[] {
  const currentLevel = input.recognition.currentLevel;
  const nextLevel = input.recognition.nextLevel;
  return [
    ...(currentLevel
      ? [
          {
            id: currentLevel.id,
            label: currentLevel.name,
            reached: true,
            reachedAt: input.supporter.lastCalculatedAt
          }
        ]
      : []),
    ...(nextLevel
      ? [
          {
            id: nextLevel.id,
            label: nextLevel.name,
            reached: false
          }
        ]
      : [])
  ];
}

export function buildRecognitionTree(input: RecognitionTreeInput): RecognitionTreeModel {
  const directChildren = getDirectChildren(input.supporter, input.accounts);
  const indirectChildren = getIndirectChildren(directChildren, input.accounts);

  return {
    campaignId: input.supporter.campaignId,
    supporterId: input.supporter.supporterId,
    currentRecognition: input.recognition.currentLevel?.name,
    currentWallet: input.wallet.balance.walletCredits,
    promotionProgress: input.recognition.progressPercentage,
    contributionCredits: input.wallet.balance.contributionCredits,
    verifiedReferrals: input.supporter.verifiedReferrals,
    currentRank: input.currentRank,
    network: {
      directNetwork: directChildren.length,
      indirectNetwork: indirectChildren.length,
      verifiedReferrals: input.supporter.verifiedReferrals
    },
    journey: buildJourney(input),
    nodes: [
      toNode(input.supporter, input.accounts, 0),
      ...directChildren.map((account) => toNode(account, input.accounts, 1)),
      ...indirectChildren.map((account) => toNode(account, input.accounts, 2))
    ]
  };
}
