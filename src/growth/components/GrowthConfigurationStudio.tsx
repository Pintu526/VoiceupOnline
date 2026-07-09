import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  Gift,
  GitBranch,
  Medal,
  Plus,
  RotateCcw,
  Save,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Trophy,
  WalletCards
} from "lucide-react";
import type { Campaign } from "../../types";
import { Field } from "../../ui/Field";
import type { MerchantCategory, MerchantRecord, MerchantRole, MerchantStatus } from "../merchant";
import { simulateSupporterGrowth } from "../calculator";
import {
  createDefaultCampaignGrowthConfiguration,
  normalizeCampaignGrowthConfiguration
} from "../configuration";
import type {
  CampaignCertificateTemplateConfiguration,
  CampaignChallengeConfiguration,
  CampaignGrowthAnalyticsConfiguration,
  CampaignGrowthConfiguration,
  CampaignGrowthLeaderboardFilter,
  CampaignMissionConfiguration,
  CampaignNotificationCenterConfiguration,
  GrowthAutomationRule
} from "../configuration";
import type { AchievementPeriodConfig } from "../achievements";
import { validateContributionSettings } from "../contributions";
import type { ContributionPointActivityType } from "../contributions";
import type { GrowthActivityKind, GrowthCreditKind, GrowthCreditRule } from "../credits";
import { validateGrowthCreditConfiguration } from "../credits";
import type { PrizeConfig, PrizeType } from "../prizes";
import { validateRecognitionConfiguration } from "../recognition";
import type { RecognitionLevelConfiguration } from "../recognition";

interface GrowthConfigurationStudioProps {
  campaign: Campaign;
  onChange: (campaign: Campaign) => void;
}

const activityOptions: Array<{ value: GrowthActivityKind; label: string }> = [
  { value: "campaign_signature", label: "Verified Signature" },
  { value: "referral_signup", label: "Referral Signup" },
  { value: "verified_referral", label: "Verified Referral" },
  { value: "volunteer_activity", label: "Volunteer" },
  { value: "attendance", label: "Event Attendance" },
  { value: "donation", label: "Donation" },
  { value: "share", label: "Share" },
  { value: "survey", label: "Daily Activity" },
  { value: "custom", label: "Custom Activity" }
];

const contributionActivityOptions: Array<{ value: ContributionPointActivityType; label: string }> = [
  { value: "verified_referral", label: "Verified Referral" },
  { value: "campaign_sign_completion", label: "Campaign Sign Completion" },
  { value: "volunteer_participation", label: "Volunteer" },
  { value: "event_attendance", label: "Event Attendance" },
  { value: "donation", label: "Donation" },
  { value: "daily_engagement", label: "Daily Activity" },
  { value: "campaign_milestone", label: "Campaign Milestone" },
  { value: "future_activity", label: "Custom Activity" }
];

const creditKinds: GrowthCreditKind[] = ["wallet", "promotion", "contribution", "recognition", "growth"];
const leaderboardFilters: Array<{ value: CampaignGrowthLeaderboardFilter; label: string }> = [
  { value: "current_campaign", label: "Current Campaign" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "overall", label: "Overall" },
  { value: "current_level", label: "Current Level" },
  { value: "highest_growth", label: "Highest Growth" },
  { value: "highest_contribution", label: "Highest Contribution" },
  { value: "highest_verified_referrals", label: "Highest Verified Referrals" },
  { value: "highest_campaign_influence", label: "Highest Campaign Influence" }
];
const analyticsLabels: Array<{ key: keyof CampaignGrowthAnalyticsConfiguration; label: string }> = [
  { key: "viralityScore", label: "Virality Score" },
  { key: "referralFunnel", label: "Referral Funnel" },
  { key: "growthFunnel", label: "Growth Funnel" },
  { key: "dropOffFunnel", label: "Drop-off Funnel" },
  { key: "treeDepth", label: "Tree Depth" },
  { key: "walletDistribution", label: "Wallet Distribution" },
  { key: "contributionDistribution", label: "Contribution Distribution" },
  { key: "promotionStatistics", label: "Promotion Statistics" },
  { key: "growthVelocity", label: "Growth Velocity" },
  { key: "dailyActiveSupporters", label: "Daily Active Supporters" }
];
const prizeTypes: PrizeType[] = [
  "voucher",
  "coupon",
  "gift",
  "gift_voucher",
  "certificate",
  "discount",
  "cashback",
  "membership",
  "experience",
  "donation",
  "digital_reward",
  "physical_reward",
  "medal",
  "trophy",
  "partner_coupon",
  "gift_hamper",
  "free_membership",
  "special_recognition",
  "premium_badge",
  "future_merchant_reward",
  "custom"
];
const merchantRoles: MerchantRole[] = [
  "merchant",
  "branch",
  "brand",
  "store",
  "partner",
  "reward_provider",
  "campaign_sponsor"
];
const merchantStatuses: MerchantStatus[] = ["active", "inactive", "pending", "verified"];
const merchantCategories: MerchantCategory[] = [
  "food",
  "retail",
  "digital",
  "education",
  "health",
  "travel",
  "lifestyle",
  "community",
  "services",
  "entertainment",
  "nonprofit",
  "other"
];
const rewardVisibilityOptions: PrizeConfig["visibility"][] = ["public", "supporter", "admin"];
const rewardFulfillmentModes: PrizeConfig["fulfillmentMode"][] = ["digital", "physical", "membership", "experience", "donation", "future_api"];

function withTimestamp(config: CampaignGrowthConfiguration): CampaignGrowthConfiguration {
  return { ...config, updatedAt: new Date().toISOString() };
}

function numberValue(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function replaceAt<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function removeAt<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function filterSection(search: string, label: string) {
  return !search.trim() || label.toLowerCase().includes(search.trim().toLowerCase());
}

function newLevel(order: number): RecognitionLevelConfiguration {
  return {
    id: `level-${Date.now()}-${order}`,
    order,
    name: `Level ${order}`,
    description: "Campaign-defined recognition level.",
    color: "#123a8c",
    icon: "badge",
    badge: `Level ${order}`,
    certificate: false,
    privileges: [],
    prizeEligibility: false,
    visible: true,
    minimumWalletCredits: 0,
    promotionWalletCredits: 0,
    promotionThreshold: order * 10,
    creditsDeducted: 0,
    carryForwardPercentage: 100,
    resetPercentage: 0,
    contributionFormula: "configured",
    roundFormula: "level_number",
    promotionCreditsRequired: order * 10,
    promotionPercentage: 50,
    roundStrategy: { strategy: "level_number" },
    distributionStrategy: {
      enabled: true,
      depth: Math.min(order, 3),
      maximumLevels: Math.min(order, 3),
      contributionPercentage: 100,
      strategy: "recognition_tree",
      formula: "progressive"
    },
    eligibilityPeriod: "all_time"
  };
}

function newCreditRule(): GrowthCreditRule {
  return {
    id: `credit-${Date.now()}`,
    activityKind: "custom",
    creditKind: "wallet",
    enabled: true,
    credits: 1,
    minimumCredits: 0,
    maximumCredits: 100,
    bonusMultiplier: 1
  };
}

function newAchievement(campaignId: string): AchievementPeriodConfig {
  return {
    id: `${campaignId}-achievement-${Date.now()}`,
    label: "New Achievement",
    kind: "campaign_duration",
    startAt: "1970-01-01T00:00:00.000Z",
    endAt: "2999-12-31T23:59:59.999Z",
    minimumPoints: 10,
    minimumVerifiedReferrals: 1,
    minimumConversions: 0,
    prizeDescription: "Campaign recognition",
    numberOfWinners: 10,
    selectionCriteria: "top_points",
    active: true
  };
}

function newReward(campaignId: string): PrizeConfig {
  return {
    id: `${campaignId}-reward-${Date.now()}`,
    type: "certificate",
    label: "New Reward",
    description: "Campaign-configured recognition reward.",
    pointsRequired: 25,
    active: true,
    merchantRedemptionReady: false,
    categories: ["community"],
    visibility: "supporter",
    eligibilityRules: [],
    imageUrls: [],
    terms: "Campaign-defined reward terms apply.",
    fulfillmentMode: "digital",
    createdAt: new Date().toISOString()
  };
}

function newMerchant(campaignId: string): MerchantRecord {
  return {
    id: `${campaignId}-merchant-${Date.now()}`,
    name: "New Merchant",
    role: "merchant",
    status: "pending",
    categories: ["community"],
    description: "Campaign partner reward provider.",
    featured: false,
    visibility: "supporter",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function newAutomationRule(): GrowthAutomationRule {
  return {
    id: `automation-${Date.now()}`,
    label: "New Automation Rule",
    enabled: false,
    schedule: {
      frequency: "daily",
      time: "09:00",
      quietHours: {
        enabled: true,
        start: "22:00",
        end: "07:00"
      }
    }
  };
}

function newMission(campaignId: string): CampaignMissionConfiguration {
  return {
    id: `${campaignId}-mission-${Date.now()}`,
    name: "New Mission",
    icon: "target",
    description: "Complete mission goals to earn recognition and rewards.",
    points: 20,
    durationDays: 7,
    visibility: "supporter",
    reward: "Campaign badge",
    badge: "Mission Starter",
    levelRequirement: 1,
    repeatable: false,
    active: true
  };
}

function newChallenge(campaignId: string): CampaignChallengeConfiguration {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 86_400_000);
  return {
    id: `${campaignId}-challenge-${Date.now()}`,
    name: "Weekly Challenge",
    icon: "trophy",
    description: "Compete for top verified referrals this week.",
    startAt: now.toISOString(),
    endAt: end.toISOString(),
    winnerCount: 3,
    prize: "Top Performer Recognition",
    recognition: "Challenge Champion",
    visibility: "supporter",
    active: true
  };
}

function newCertificateTemplate(campaignId: string): CampaignCertificateTemplateConfiguration {
  return {
    id: `${campaignId}-certificate-${Date.now()}`,
    name: "Campaign Recognition",
    signatory: "Campaign Admin",
    title: "Campaign Completion Certificate",
    badge: "Verified Supporter",
    qrEnabled: true,
    verificationLinkTemplate: "{{referral_link}}",
    issueAutomatically: false,
    issueRule: "achievement_qualified"
  };
}

const notificationCategoryOptions: Array<{
  value: CampaignNotificationCenterConfiguration["categories"][number];
  label: string;
}> = [
  { value: "achievements", label: "Achievements" },
  { value: "promotion", label: "Promotion" },
  { value: "wallet", label: "Wallet" },
  { value: "mission", label: "Mission" },
  { value: "challenge", label: "Challenge" },
  { value: "leaderboard", label: "Leaderboard" },
  { value: "rewards", label: "Rewards" },
  { value: "recognition", label: "Recognition" },
  { value: "announcements", label: "Announcements" },
  { value: "campaign_updates", label: "Campaign Updates" }
];

export function GrowthConfigurationStudio({ campaign, onChange }: GrowthConfigurationStudioProps) {
  const [search, setSearch] = useState("");
  const [undoConfig, setUndoConfig] = useState<CampaignGrowthConfiguration | null>(null);
  const [projectionInvites, setProjectionInvites] = useState(10);
  const config = useMemo(() => normalizeCampaignGrowthConfiguration(campaign), [campaign]);
  const visibleLevels = config.operatingSystem.recognition.levels.slice(0, 15);
  const validationMessages = [
    ...validateGrowthCreditConfiguration(config.operatingSystem.credits).map((item) => item.message),
    ...validateRecognitionConfiguration(config.operatingSystem.recognition).map((item) => item.message),
    ...validateContributionSettings(config.contribution).map((item) => item.message)
  ];
  const projection = simulateSupporterGrowth({
    invitedSupporters: projectionInvites,
    expectedVerificationRate: 80,
    targetRecognitionLevel: visibleLevels[0],
    averageCreditsPerVerifiedSupporter: 10
  });

  function updateConfig(nextConfig: CampaignGrowthConfiguration) {
    setUndoConfig(config);
    onChange({ ...campaign, growthConfiguration: withTimestamp(nextConfig) });
  }

  function resetSection(section: keyof CampaignGrowthConfiguration) {
    const defaults = createDefaultCampaignGrowthConfiguration(campaign);
    updateConfig({ ...config, [section]: defaults[section] });
  }

  function updateLevel(index: number, patch: Partial<RecognitionLevelConfiguration>) {
    const levels = replaceAt(visibleLevels, index, { ...visibleLevels[index], ...patch });
    updateConfig({
      ...config,
      operatingSystem: {
        ...config.operatingSystem,
        recognition: { ...config.operatingSystem.recognition, levels }
      }
    });
  }

  function updateCreditRule(index: number, patch: Partial<GrowthCreditRule>) {
    const rules = replaceAt(config.operatingSystem.credits.rules, index, {
      ...config.operatingSystem.credits.rules[index],
      ...patch
    });
    updateConfig({
      ...config,
      operatingSystem: {
        ...config.operatingSystem,
        credits: { ...config.operatingSystem.credits, rules }
      }
    });
  }

  function updateAchievement(index: number, patch: Partial<AchievementPeriodConfig>) {
    updateConfig({ ...config, achievements: replaceAt(config.achievements, index, { ...config.achievements[index], ...patch }) });
  }

  function updateReward(index: number, patch: Partial<PrizeConfig>) {
    updateConfig({ ...config, rewards: replaceAt(config.rewards, index, { ...config.rewards[index], ...patch }) });
  }

  function updateMerchant(index: number, patch: Partial<MerchantRecord>) {
    updateConfig({
      ...config,
      merchants: replaceAt(config.merchants, index, {
        ...config.merchants[index],
        ...patch,
        updatedAt: new Date().toISOString()
      })
    });
  }

  function updateAutomationRule(index: number, patch: Partial<GrowthAutomationRule>) {
    updateConfig({
      ...config,
      automationRules: replaceAt(config.automationRules, index, {
        ...config.automationRules[index],
        ...patch
      })
    });
  }

  function updateMission(index: number, patch: Partial<CampaignMissionConfiguration>) {
    updateConfig({ ...config, missions: replaceAt(config.missions, index, { ...config.missions[index], ...patch }) });
  }

  function updateChallenge(index: number, patch: Partial<CampaignChallengeConfiguration>) {
    updateConfig({ ...config, challenges: replaceAt(config.challenges, index, { ...config.challenges[index], ...patch }) });
  }

  function updateCertificateTemplate(index: number, patch: Partial<CampaignCertificateTemplateConfiguration>) {
    updateConfig({
      ...config,
      certificates: {
        ...config.certificates,
        templates: replaceAt(config.certificates.templates, index, {
          ...config.certificates.templates[index],
          ...patch
        })
      }
    });
  }

  return (
    <div className="growth-config-studio">
      <div className="growth-config-toolbar">
        <div>
          <span className="eyebrow">Campaign Growth Configuration</span>
          <h4>Configure this campaign's Growth Engine rules</h4>
          <p>Autosaves to the campaign draft. Use Update campaign to persist the draft.</p>
        </div>
        <div className="input-with-icon">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Growth settings" />
        </div>
      </div>

      {validationMessages.length > 0 && (
        <div className="info-message growth-config-validation">
          <strong>Validation</strong>
          {validationMessages.slice(0, 4).map((message) => <span key={message}>{message}</span>)}
        </div>
      )}

      {filterSection(search, "Recognition Levels") && (
        <details className="growth-config-section" open>
          <summary><BadgeCheck size={18} /> Recognition Levels</summary>
          <div className="growth-config-actions">
            <button type="button" className="secondary-button" onClick={() => {
              if (visibleLevels.length >= 15) return;
              updateConfig({
                ...config,
                operatingSystem: {
                  ...config.operatingSystem,
                  recognition: {
                    ...config.operatingSystem.recognition,
                    levels: [...visibleLevels, newLevel(visibleLevels.length + 1)]
                  }
                }
              });
            }}>
              <Plus size={16} /> Add level
            </button>
            <button type="button" className="secondary-button" onClick={() => resetSection("operatingSystem")}>
              <RotateCcw size={16} /> Reset levels
            </button>
          </div>
          <div className="growth-level-grid">
            {visibleLevels.map((level, index) => (
              <article className="growth-config-card" key={level.id}>
                <div className="growth-config-card-header">
                  <strong>{level.name}</strong>
                  <button type="button" className="icon-button" onClick={() => updateConfig({
                    ...config,
                    operatingSystem: {
                      ...config.operatingSystem,
                      recognition: {
                        ...config.operatingSystem.recognition,
                        levels: removeAt(visibleLevels, index)
                      }
                    }
                  })} aria-label="Remove recognition level">
                    <Trash2 size={16} />
                  </button>
                </div>
                <Field label="Display Name"><input value={level.name} onChange={(event) => updateLevel(index, { name: event.target.value })} /></Field>
                <Field label="Description"><textarea value={level.description} onChange={(event) => updateLevel(index, { description: event.target.value })} /></Field>
                <div className="form-grid compact-form-grid">
                  <Field label="Icon"><input value={level.icon} onChange={(event) => updateLevel(index, { icon: event.target.value })} /></Field>
                  <Field label="Color"><input type="color" value={level.color} onChange={(event) => updateLevel(index, { color: event.target.value })} /></Field>
                  <Field label="Minimum Wallet Credits"><input type="number" min="0" value={level.minimumWalletCredits ?? 0} onChange={(event) => updateLevel(index, { minimumWalletCredits: numberValue(event.target.value) })} /></Field>
                  <Field label="Promotion Credits Required"><input type="number" min="0" value={level.promotionCreditsRequired} onChange={(event) => updateLevel(index, { promotionCreditsRequired: numberValue(event.target.value), promotionThreshold: numberValue(event.target.value) })} /></Field>
                  <Field label="Badge"><input value={level.badge ?? ""} onChange={(event) => updateLevel(index, { badge: event.target.value })} /></Field>
                  <Field label="Visibility">
                    <select value={level.visible === false ? "hidden" : "visible"} onChange={(event) => updateLevel(index, { visible: event.target.value === "visible" })}>
                      <option value="visible">Visible</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </Field>
                </div>
                <label className="check-row"><input type="checkbox" checked={level.certificate} onChange={(event) => updateLevel(index, { certificate: event.target.checked })} /> Certificate eligibility</label>
                <label className="check-row"><input type="checkbox" checked={level.prizeEligibility} onChange={(event) => updateLevel(index, { prizeEligibility: event.target.checked })} /> Prize eligibility</label>
                <Field label="Special Privileges"><input value={level.privileges.join(", ")} onChange={(event) => updateLevel(index, { privileges: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Growth Credits") && (
        <details className="growth-config-section" open>
          <summary><WalletCards size={18} /> Growth Credits</summary>
          <div className="growth-config-actions">
            <label className="check-row"><input type="checkbox" checked={config.operatingSystem.credits.enabled} onChange={(event) => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, credits: { ...config.operatingSystem.credits, enabled: event.target.checked } } })} /> Enable Growth Credits</label>
            <button type="button" className="secondary-button" onClick={() => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, credits: { ...config.operatingSystem.credits, rules: [...config.operatingSystem.credits.rules, newCreditRule()] } } })}><Plus size={16} /> Add activity</button>
          </div>
          <div className="growth-config-table">
            {config.operatingSystem.credits.rules.map((rule, index) => (
              <article className="growth-config-row" key={rule.id}>
                <label className="check-row"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateCreditRule(index, { enabled: event.target.checked })} /> Active</label>
                <Field label="Activity"><select value={rule.activityKind} onChange={(event) => updateCreditRule(index, { activityKind: event.target.value as GrowthActivityKind })}>{activityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
                <Field label="Credit Type"><select value={rule.creditKind} onChange={(event) => updateCreditRule(index, { creditKind: event.target.value as GrowthCreditKind })}>{creditKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></Field>
                <Field label="Credits"><input type="number" min="0" value={rule.credits} onChange={(event) => updateCreditRule(index, { credits: numberValue(event.target.value) })} /></Field>
                <Field label="Minimum"><input type="number" min="0" value={rule.minimumCredits ?? 0} onChange={(event) => updateCreditRule(index, { minimumCredits: numberValue(event.target.value) })} /></Field>
                <Field label="Maximum"><input type="number" min="0" value={rule.maximumCredits ?? 100} onChange={(event) => updateCreditRule(index, { maximumCredits: numberValue(event.target.value) })} /></Field>
                <Field label="Bonus Multiplier"><input type="number" min="0" step="0.1" value={rule.bonusMultiplier ?? rule.multiplier ?? 1} onChange={(event) => updateCreditRule(index, { bonusMultiplier: numberValue(event.target.value, 1) })} /></Field>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Contribution Rules") && (
        <details className="growth-config-section">
          <summary><GitBranch size={18} /> Contribution Rules</summary>
          <div className="form-grid">
            <label className="check-row"><input type="checkbox" checked={config.contribution.enabled} onChange={(event) => updateConfig({ ...config, contribution: { ...config.contribution, enabled: event.target.checked } })} /> Enable Contribution</label>
            <Field label="Maximum Contribution %"><input type="number" min="0" max="100" value={config.operatingSystem.promotion.distributionConfiguration.contributionPercentage} onChange={(event) => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, promotion: { ...config.operatingSystem.promotion, distributionConfiguration: { ...config.operatingSystem.promotion.distributionConfiguration, contributionPercentage: numberValue(event.target.value) } } } })} /></Field>
            <Field label="Number of Parent Levels"><input type="number" min="1" max="15" value={config.operatingSystem.promotion.distributionConfiguration.maximumLevels} onChange={(event) => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, promotion: { ...config.operatingSystem.promotion, distributionConfiguration: { ...config.operatingSystem.promotion.distributionConfiguration, maximumLevels: numberValue(event.target.value, 1), depth: numberValue(event.target.value, 1) } } } })} /></Field>
            <Field label="Round Formula"><input value={config.operatingSystem.promotion.distributionConfiguration.roundFormula ?? "level_number"} onChange={(event) => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, promotion: { ...config.operatingSystem.promotion, distributionConfiguration: { ...config.operatingSystem.promotion.distributionConfiguration, roundFormula: event.target.value } } } })} /></Field>
            <Field label="Promotion Formula"><input value={config.operatingSystem.promotion.distributionConfiguration.promotionFormula ?? "configured"} onChange={(event) => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, promotion: { ...config.operatingSystem.promotion, distributionConfiguration: { ...config.operatingSystem.promotion.distributionConfiguration, promotionFormula: event.target.value } } } })} /></Field>
            <Field label="Distribution Formula">
              <select value={config.operatingSystem.promotion.distributionConfiguration.formula} onChange={(event) => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, promotion: { ...config.operatingSystem.promotion, distributionConfiguration: { ...config.operatingSystem.promotion.distributionConfiguration, formula: event.target.value as typeof config.operatingSystem.promotion.distributionConfiguration.formula } } } })}>
                <option value="equal">Equal</option>
                <option value="percentage">Percentage</option>
                <option value="progressive">Progressive</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Maximum Daily Contribution"><input type="number" min="0" value={config.operatingSystem.promotion.distributionConfiguration.maximumDailyContribution ?? 0} onChange={(event) => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, promotion: { ...config.operatingSystem.promotion, distributionConfiguration: { ...config.operatingSystem.promotion.distributionConfiguration, maximumDailyContribution: numberValue(event.target.value) } } } })} /></Field>
            <Field label="Maximum Monthly Contribution"><input type="number" min="0" value={config.operatingSystem.promotion.distributionConfiguration.maximumMonthlyContribution ?? 0} onChange={(event) => updateConfig({ ...config, operatingSystem: { ...config.operatingSystem, promotion: { ...config.operatingSystem.promotion, distributionConfiguration: { ...config.operatingSystem.promotion.distributionConfiguration, maximumMonthlyContribution: numberValue(event.target.value) } } } })} /></Field>
          </div>
          <div className="growth-config-table">
            {config.contribution.levels.map((level, index) => (
              <article className="growth-config-row" key={level.level}>
                <strong>Parent Level {level.level}</strong>
                <Field label="Contribution %"><input type="number" min="0" max="100" value={level.percentage} onChange={(event) => updateConfig({ ...config, contribution: { ...config.contribution, levels: replaceAt(config.contribution.levels, index, { ...level, percentage: numberValue(event.target.value) }) } })} /></Field>
                <label className="check-row"><input type="checkbox" checked={level.enabled !== false} onChange={(event) => updateConfig({ ...config, contribution: { ...config.contribution, levels: replaceAt(config.contribution.levels, index, { ...level, enabled: event.target.checked }) } })} /> Enabled</label>
              </article>
            ))}
          </div>
          <div className="template-chip-row">
            {contributionActivityOptions.map((item) => {
              const selected = config.contribution.eligibleActivities.includes(item.value);
              return (
                <button key={item.value} type="button" className={selected ? "selected" : ""} onClick={() => updateConfig({ ...config, contribution: { ...config.contribution, eligibleActivities: selected ? config.contribution.eligibleActivities.filter((value) => value !== item.value) : [...config.contribution.eligibleActivities, item.value] } })}>
                  {item.label}
                </button>
              );
            })}
          </div>
        </details>
      )}

      {filterSection(search, "Promotion Rules") && (
        <details className="growth-config-section">
          <summary><Sparkles size={18} /> Promotion Rules</summary>
          <div className="growth-config-table">
            {visibleLevels.map((level, index) => (
              <article className="growth-config-row" key={`${level.id}-promotion`}>
                <strong>{level.name}</strong>
                <Field label="Promotion Wallet Credits"><input type="number" min="0" value={level.promotionWalletCredits ?? 0} onChange={(event) => updateLevel(index, { promotionWalletCredits: numberValue(event.target.value) })} /></Field>
                <Field label="Promotion Threshold"><input type="number" min="0" value={level.promotionThreshold ?? level.promotionCreditsRequired} onChange={(event) => updateLevel(index, { promotionThreshold: numberValue(event.target.value), promotionCreditsRequired: numberValue(event.target.value) })} /></Field>
                <Field label="Credits Deducted"><input type="number" min="0" value={level.creditsDeducted ?? 0} onChange={(event) => updateLevel(index, { creditsDeducted: numberValue(event.target.value) })} /></Field>
                <Field label="Carry Forward %"><input type="number" min="0" max="100" value={level.carryForwardPercentage ?? 100} onChange={(event) => updateLevel(index, { carryForwardPercentage: numberValue(event.target.value) })} /></Field>
                <Field label="Reset %"><input type="number" min="0" max="100" value={level.resetPercentage ?? 0} onChange={(event) => updateLevel(index, { resetPercentage: numberValue(event.target.value) })} /></Field>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Achievements") && (
        <details className="growth-config-section">
          <summary><Trophy size={18} /> Achievements</summary>
          <button type="button" className="secondary-button" onClick={() => updateConfig({ ...config, achievements: [...config.achievements, newAchievement(campaign.id)] })}><Plus size={16} /> Add achievement</button>
          <div className="growth-config-table">
            {config.achievements.map((achievement, index) => (
              <article className="growth-config-row" key={achievement.id}>
                <label className="check-row"><input type="checkbox" checked={achievement.active} onChange={(event) => updateAchievement(index, { active: event.target.checked })} /> Active</label>
                <Field label="Achievement Name"><input value={achievement.label} onChange={(event) => updateAchievement(index, { label: event.target.value })} /></Field>
                <Field label="Minimum Points"><input type="number" min="0" value={achievement.minimumPoints} onChange={(event) => updateAchievement(index, { minimumPoints: numberValue(event.target.value) })} /></Field>
                <Field label="Minimum Verified Referrals"><input type="number" min="0" value={achievement.minimumVerifiedReferrals} onChange={(event) => updateAchievement(index, { minimumVerifiedReferrals: numberValue(event.target.value) })} /></Field>
                <Field label="Winners"><input type="number" min="1" value={achievement.numberOfWinners} onChange={(event) => updateAchievement(index, { numberOfWinners: numberValue(event.target.value, 1) })} /></Field>
                <Field label="Prize Description"><input value={achievement.prizeDescription} onChange={(event) => updateAchievement(index, { prizeDescription: event.target.value })} /></Field>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Leaderboard") && (
        <details className="growth-config-section">
          <summary><BarChart3 size={18} /> Leaderboard</summary>
          <label className="check-row"><input type="checkbox" checked={config.leaderboard.enabled} onChange={(event) => updateConfig({ ...config, leaderboard: { ...config.leaderboard, enabled: event.target.checked } })} /> Enable leaderboard</label>
          <div className="template-chip-row">
            {leaderboardFilters.map((item) => {
              const selected = config.leaderboard.filters.includes(item.value);
              return <button key={item.value} type="button" className={selected ? "selected" : ""} onClick={() => updateConfig({ ...config, leaderboard: { ...config.leaderboard, filters: selected ? config.leaderboard.filters.filter((value) => value !== item.value) : [...config.leaderboard.filters, item.value] } })}>{item.label}</button>;
            })}
          </div>
        </details>
      )}

      {filterSection(search, "Rewards") && (
        <details className="growth-config-section">
          <summary><Gift size={18} /> Rewards</summary>
          <button type="button" className="secondary-button" onClick={() => updateConfig({ ...config, rewards: [...config.rewards, newReward(campaign.id)] })}><Plus size={16} /> Add reward</button>
          <div className="growth-config-table">
            {config.rewards.map((reward, index) => (
              <article className="growth-config-row" key={reward.id}>
                <label className="check-row"><input type="checkbox" checked={reward.active} onChange={(event) => updateReward(index, { active: event.target.checked })} /> Active</label>
                <Field label="Reward Name"><input value={reward.label} onChange={(event) => updateReward(index, { label: event.target.value })} /></Field>
                <Field label="Reward Type"><select value={reward.type} onChange={(event) => updateReward(index, { type: event.target.value as PrizeType })}>{prizeTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
                <Field label="Description"><input value={reward.description} onChange={(event) => updateReward(index, { description: event.target.value })} /></Field>
                <Field label="Points Required"><input type="number" min="0" value={reward.pointsRequired} onChange={(event) => updateReward(index, { pointsRequired: numberValue(event.target.value) })} /></Field>
                <Field label="Merchant">
                  <select value={reward.merchantId ?? ""} onChange={(event) => updateReward(index, { merchantId: event.target.value || undefined })}>
                    <option value="">Campaign reward only</option>
                    {config.merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
                  </select>
                </Field>
                <Field label="Quantity"><input type="number" min="0" value={reward.quantityAvailable ?? 0} onChange={(event) => updateReward(index, { quantityAvailable: numberValue(event.target.value) })} /></Field>
                <Field label="Visibility"><select value={reward.visibility} onChange={(event) => updateReward(index, { visibility: event.target.value as PrizeConfig["visibility"] })}>{rewardVisibilityOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                <Field label="Fulfillment"><select value={reward.fulfillmentMode} onChange={(event) => updateReward(index, { fulfillmentMode: event.target.value as PrizeConfig["fulfillmentMode"] })}>{rewardFulfillmentModes.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                <Field label="Expiry"><input type="date" value={reward.expiresAt?.slice(0, 10) ?? ""} onChange={(event) => updateReward(index, { expiresAt: event.target.value ? new Date(event.target.value).toISOString() : undefined })} /></Field>
                <Field label="Reservation Timeout (minutes)"><input type="number" min="0" value={reward.reservationTimeoutMinutes ?? 0} onChange={(event) => updateReward(index, { reservationTimeoutMinutes: numberValue(event.target.value) })} /></Field>
                <Field label="Terms"><input value={reward.terms} onChange={(event) => updateReward(index, { terms: event.target.value })} /></Field>
                <Field label="Eligibility Rules"><input value={reward.eligibilityRules.join(", ")} onChange={(event) => updateReward(index, { eligibilityRules: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
                <Field label="Categories"><input value={reward.categories.join(", ")} onChange={(event) => updateReward(index, { categories: event.target.value.split(",").map((item) => item.trim() as MerchantCategory).filter(Boolean) })} /></Field>
                <label className="check-row"><input type="checkbox" checked={reward.featured ?? false} onChange={(event) => updateReward(index, { featured: event.target.checked })} /> Featured</label>
                <label className="check-row"><input type="checkbox" checked={reward.trending ?? false} onChange={(event) => updateReward(index, { trending: event.target.checked })} /> Trending</label>
                <label className="check-row"><input type="checkbox" checked={reward.recommended ?? false} onChange={(event) => updateReward(index, { recommended: event.target.checked })} /> Recommended</label>
              </article>
            ))}
          </div>
          <p className="helper-text">Configure a generic marketplace catalog now. Fulfillment integrations can be added later without changing this runtime shape.</p>
        </details>
      )}

      {filterSection(search, "Merchants") && (
        <details className="growth-config-section">
          <summary><Gift size={18} /> Merchants</summary>
          <button type="button" className="secondary-button" onClick={() => updateConfig({ ...config, merchants: [...config.merchants, newMerchant(campaign.id)] })}><Plus size={16} /> Add merchant</button>
          <div className="growth-config-table">
            {config.merchants.map((merchant, index) => (
              <article className="growth-config-row" key={merchant.id}>
                <Field label="Merchant Name"><input value={merchant.name} onChange={(event) => updateMerchant(index, { name: event.target.value })} /></Field>
                <Field label="Role"><select value={merchant.role} onChange={(event) => updateMerchant(index, { role: event.target.value as MerchantRole })}>{merchantRoles.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                <Field label="Status"><select value={merchant.status} onChange={(event) => updateMerchant(index, { status: event.target.value as MerchantStatus })}>{merchantStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                <Field label="Description"><input value={merchant.description} onChange={(event) => updateMerchant(index, { description: event.target.value })} /></Field>
                <Field label="Categories"><input value={merchant.categories.join(", ")} onChange={(event) => updateMerchant(index, { categories: event.target.value.split(",").map((item) => item.trim() as MerchantCategory).filter(Boolean) })} /></Field>
                <Field label="Contact Name"><input value={merchant.contactName ?? ""} onChange={(event) => updateMerchant(index, { contactName: event.target.value })} /></Field>
                <Field label="Contact Email"><input value={merchant.contactEmail ?? ""} onChange={(event) => updateMerchant(index, { contactEmail: event.target.value })} /></Field>
                <Field label="Contact Phone"><input value={merchant.contactPhone ?? ""} onChange={(event) => updateMerchant(index, { contactPhone: event.target.value })} /></Field>
                <Field label="Location Label"><input value={merchant.locationLabel ?? ""} onChange={(event) => updateMerchant(index, { locationLabel: event.target.value })} /></Field>
                <Field label="Notes"><input value={merchant.notes ?? ""} onChange={(event) => updateMerchant(index, { notes: event.target.value })} /></Field>
                <label className="check-row"><input type="checkbox" checked={merchant.featured ?? false} onChange={(event) => updateMerchant(index, { featured: event.target.checked })} /> Featured partner</label>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Referral Sharing") && (
        <details className="growth-config-section">
          <summary><Share2 size={18} /> Referral Sharing</summary>
          <div className="form-grid">
            <Field label="Journey display name"><input value={config.sharing.journeyDisplayName} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, journeyDisplayName: event.target.value } })} /></Field>
            <Field label="WhatsApp message"><textarea value={config.sharing.whatsappMessage} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, whatsappMessage: event.target.value } })} /></Field>
            <Field label="SMS template"><textarea value={config.sharing.smsTemplate} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, smsTemplate: event.target.value } })} /></Field>
            <Field label="Email subject"><input value={config.sharing.emailSubject} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, emailSubject: event.target.value } })} /></Field>
            <Field label="Email template"><textarea value={config.sharing.emailTemplate} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, emailTemplate: event.target.value } })} /></Field>
            <Field label="Native Share message"><textarea value={config.sharing.nativeShareMessage} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, nativeShareMessage: event.target.value } })} /></Field>
            <Field label="Referral Poster"><input value={config.sharing.referralPosterHeadline} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, referralPosterHeadline: event.target.value } })} /></Field>
            <Field label="QR branding"><input value={config.sharing.qrBranding} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, qrBranding: event.target.value } })} /></Field>
            <Field label="Campaign slogan"><input value={config.sharing.campaignSlogan} onChange={(event) => updateConfig({ ...config, sharing: { ...config.sharing, campaignSlogan: event.target.value } })} /></Field>
          </div>
          <p className="helper-text">Dynamic variables: {config.sharing.dynamicVariables.join(", ")}</p>
        </details>
      )}

      {filterSection(search, "Campaign Analytics") && (
        <details className="growth-config-section">
          <summary><Medal size={18} /> Campaign Analytics</summary>
          <div className="growth-toggle-grid">
            {analyticsLabels.map((item) => (
              <label className="check-row" key={item.key}>
                <input type="checkbox" checked={config.analytics[item.key]} onChange={(event) => updateConfig({ ...config, analytics: { ...config.analytics, [item.key]: event.target.checked } })} />
                {item.label}
              </label>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Smart Automation Rules") && (
        <details className="growth-config-section">
          <summary><Sparkles size={18} /> Smart Automation Rules</summary>
          <button type="button" className="secondary-button" onClick={() => updateConfig({ ...config, automationRules: [...config.automationRules, newAutomationRule()] })}><Plus size={16} /> Add rule</button>
          <div className="growth-config-table">
            {config.automationRules.map((rule, index) => (
              <article className="growth-config-row" key={rule.id}>
                <label className="check-row"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateAutomationRule(index, { enabled: event.target.checked })} /> Active</label>
                <Field label="Rule Name"><input value={rule.label} onChange={(event) => updateAutomationRule(index, { label: event.target.value })} /></Field>
                <Field label="Frequency">
                  <select value={rule.schedule.frequency} onChange={(event) => updateAutomationRule(index, { schedule: { ...rule.schedule, frequency: event.target.value as GrowthAutomationRule["schedule"]["frequency"] } })}>
                    <option value="immediate">Immediate</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
                <Field label="Time"><input type="time" value={rule.schedule.time} onChange={(event) => updateAutomationRule(index, { schedule: { ...rule.schedule, time: event.target.value } })} /></Field>
                {rule.schedule.frequency === "weekly" && (
                  <Field label="Day of Week"><input type="number" min="0" max="6" value={rule.schedule.dayOfWeek ?? 1} onChange={(event) => updateAutomationRule(index, { schedule: { ...rule.schedule, dayOfWeek: numberValue(event.target.value, 1) } })} /></Field>
                )}
                {rule.schedule.frequency === "monthly" && (
                  <Field label="Day of Month"><input type="number" min="1" max="28" value={rule.schedule.dayOfMonth ?? 1} onChange={(event) => updateAutomationRule(index, { schedule: { ...rule.schedule, dayOfMonth: numberValue(event.target.value, 1) } })} /></Field>
                )}
                <label className="check-row"><input type="checkbox" checked={rule.schedule.quietHours.enabled} onChange={(event) => updateAutomationRule(index, { schedule: { ...rule.schedule, quietHours: { ...rule.schedule.quietHours, enabled: event.target.checked } } })} /> Quiet hours</label>
                <Field label="Quiet Start"><input type="time" value={rule.schedule.quietHours.start} onChange={(event) => updateAutomationRule(index, { schedule: { ...rule.schedule, quietHours: { ...rule.schedule.quietHours, start: event.target.value } } })} /></Field>
                <Field label="Quiet End"><input type="time" value={rule.schedule.quietHours.end} onChange={(event) => updateAutomationRule(index, { schedule: { ...rule.schedule, quietHours: { ...rule.schedule.quietHours, end: event.target.value } } })} /></Field>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Missions") && (
        <details className="growth-config-section">
          <summary><Trophy size={18} /> Missions</summary>
          <button type="button" className="secondary-button" onClick={() => updateConfig({ ...config, missions: [...config.missions, newMission(campaign.id)] })}><Plus size={16} /> Add mission</button>
          <div className="growth-config-table">
            {config.missions.map((mission, index) => (
              <article className="growth-config-row" key={mission.id}>
                <label className="check-row"><input type="checkbox" checked={mission.active} onChange={(event) => updateMission(index, { active: event.target.checked })} /> Active</label>
                <Field label="Mission Name"><input value={mission.name} onChange={(event) => updateMission(index, { name: event.target.value })} /></Field>
                <Field label="Description"><input value={mission.description} onChange={(event) => updateMission(index, { description: event.target.value })} /></Field>
                <Field label="Points"><input type="number" min="0" value={mission.points} onChange={(event) => updateMission(index, { points: numberValue(event.target.value) })} /></Field>
                <Field label="Duration (days)"><input type="number" min="1" value={mission.durationDays} onChange={(event) => updateMission(index, { durationDays: numberValue(event.target.value, 1) })} /></Field>
                <Field label="Level Requirement"><input type="number" min="1" value={mission.levelRequirement} onChange={(event) => updateMission(index, { levelRequirement: numberValue(event.target.value, 1) })} /></Field>
                <Field label="Reward"><input value={mission.reward} onChange={(event) => updateMission(index, { reward: event.target.value })} /></Field>
                <Field label="Badge"><input value={mission.badge} onChange={(event) => updateMission(index, { badge: event.target.value })} /></Field>
                <label className="check-row"><input type="checkbox" checked={mission.repeatable} onChange={(event) => updateMission(index, { repeatable: event.target.checked })} /> Repeatable</label>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Challenges") && (
        <details className="growth-config-section">
          <summary><Trophy size={18} /> Challenges</summary>
          <button type="button" className="secondary-button" onClick={() => updateConfig({ ...config, challenges: [...config.challenges, newChallenge(campaign.id)] })}><Plus size={16} /> Add challenge</button>
          <div className="growth-config-table">
            {config.challenges.map((challenge, index) => (
              <article className="growth-config-row" key={challenge.id}>
                <label className="check-row"><input type="checkbox" checked={challenge.active} onChange={(event) => updateChallenge(index, { active: event.target.checked })} /> Active</label>
                <Field label="Challenge Name"><input value={challenge.name} onChange={(event) => updateChallenge(index, { name: event.target.value })} /></Field>
                <Field label="Description"><input value={challenge.description} onChange={(event) => updateChallenge(index, { description: event.target.value })} /></Field>
                <Field label="Start"><input type="datetime-local" value={challenge.startAt.slice(0, 16)} onChange={(event) => updateChallenge(index, { startAt: new Date(event.target.value).toISOString() })} /></Field>
                <Field label="End"><input type="datetime-local" value={challenge.endAt.slice(0, 16)} onChange={(event) => updateChallenge(index, { endAt: new Date(event.target.value).toISOString() })} /></Field>
                <Field label="Winners"><input type="number" min="1" value={challenge.winnerCount} onChange={(event) => updateChallenge(index, { winnerCount: numberValue(event.target.value, 1) })} /></Field>
                <Field label="Prize"><input value={challenge.prize} onChange={(event) => updateChallenge(index, { prize: event.target.value })} /></Field>
                <Field label="Recognition"><input value={challenge.recognition} onChange={(event) => updateChallenge(index, { recognition: event.target.value })} /></Field>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Notification Preferences") && (
        <details className="growth-config-section">
          <summary><Medal size={18} /> Notification Preferences</summary>
          <label className="check-row"><input type="checkbox" checked={config.notifications.enabled} onChange={(event) => updateConfig({ ...config, notifications: { ...config.notifications, enabled: event.target.checked } })} /> Enable notification center</label>
          <div className="template-chip-row">
            {notificationCategoryOptions.map((item) => {
              const selected = config.notifications.categories.includes(item.value);
              return (
                <button key={item.value} type="button" className={selected ? "selected" : ""} onClick={() => updateConfig({ ...config, notifications: { ...config.notifications, categories: selected ? config.notifications.categories.filter((value) => value !== item.value) : [...config.notifications.categories, item.value] } })}>
                  {item.label}
                </button>
              );
            })}
          </div>
        </details>
      )}

      {filterSection(search, "Certificate Templates") && (
        <details className="growth-config-section">
          <summary><BadgeCheck size={18} /> Certificate Templates</summary>
          <div className="growth-config-actions">
            <label className="check-row"><input type="checkbox" checked={config.certificates.enabled} onChange={(event) => updateConfig({ ...config, certificates: { ...config.certificates, enabled: event.target.checked } })} /> Enable certificates</label>
            <button type="button" className="secondary-button" onClick={() => updateConfig({ ...config, certificates: { ...config.certificates, templates: [...config.certificates.templates, newCertificateTemplate(campaign.id)] } })}><Plus size={16} /> Add template</button>
          </div>
          <div className="growth-config-table">
            {config.certificates.templates.map((template, index) => (
              <article className="growth-config-row" key={template.id}>
                <Field label="Template Name"><input value={template.name} onChange={(event) => updateCertificateTemplate(index, { name: event.target.value })} /></Field>
                <Field label="Title"><input value={template.title} onChange={(event) => updateCertificateTemplate(index, { title: event.target.value })} /></Field>
                <Field label="Signatory"><input value={template.signatory} onChange={(event) => updateCertificateTemplate(index, { signatory: event.target.value })} /></Field>
                <Field label="Badge"><input value={template.badge} onChange={(event) => updateCertificateTemplate(index, { badge: event.target.value })} /></Field>
                <Field label="Verification Link"><input value={template.verificationLinkTemplate} onChange={(event) => updateCertificateTemplate(index, { verificationLinkTemplate: event.target.value })} /></Field>
                <Field label="Issue Rule"><input value={template.issueRule} onChange={(event) => updateCertificateTemplate(index, { issueRule: event.target.value })} /></Field>
                <label className="check-row"><input type="checkbox" checked={template.issueAutomatically} onChange={(event) => updateCertificateTemplate(index, { issueAutomatically: event.target.checked })} /> Issue automatically</label>
                <label className="check-row"><input type="checkbox" checked={template.qrEnabled} onChange={(event) => updateCertificateTemplate(index, { qrEnabled: event.target.checked })} /> QR verification</label>
              </article>
            ))}
          </div>
        </details>
      )}

      {filterSection(search, "Preview") && (
        <details className="growth-config-section" open>
          <summary><Sparkles size={18} /> Preview</summary>
          <div className="growth-config-preview">
            <div>
              <span className="eyebrow">Supporter dashboard preview</span>
              <strong>{visibleLevels[0]?.name ?? "Recognition Level"}</strong>
              <p>{visibleLevels[0]?.description ?? "Recognition journey preview appears here."}</p>
              <small>Badge: {visibleLevels[0]?.badge ?? "Not configured"}</small>
            </div>
            <div>
              <span className="eyebrow">What if</span>
              <Field label="Invites"><input type="number" min="1" value={projectionInvites} onChange={(event) => setProjectionInvites(numberValue(event.target.value, 1))} /></Field>
              <p>Expected wallet: {projection.expectedWallet.toLocaleString()} credits</p>
              <p>Promotion progress: {projection.expectedPromotion.toLocaleString()}%</p>
              <p>Prize eligibility: {projection.expectedPrizeEligibility ? "Possible" : "Not yet"}</p>
            </div>
            <div>
              <span className="eyebrow">Share card</span>
              <strong>{config.sharing.referralPosterHeadline}</strong>
              <p>{config.sharing.nativeShareMessage}</p>
            </div>
          </div>
        </details>
      )}

      <div className="growth-config-sticky-save">
        <button type="button" className="secondary-button" disabled={!undoConfig} onClick={() => undoConfig && updateConfig(undoConfig)}>
          <RotateCcw size={16} /> Undo
        </button>
        <button type="button" className="secondary-button" onClick={() => updateConfig(createDefaultCampaignGrowthConfiguration(campaign))}>
          <RotateCcw size={16} /> Reset all
        </button>
        <button type="submit" className="primary-button">
          <Save size={16} /> Save campaign
        </button>
      </div>
    </div>
  );
}
