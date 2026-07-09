import { GrowthEventPriority, GrowthEventType } from "../events";
import type {
  GrowthCreditCalculationInput,
  GrowthCreditCalculationResult,
  GrowthCreditEngineConfiguration,
  GrowthCreditLedgerEntry,
  GrowthCreditRule,
  GrowthRuleViolation
} from "./types";

function violation(
  code: GrowthRuleViolation["code"],
  message: string,
  severity: GrowthRuleViolation["severity"] = "error"
): GrowthRuleViolation {
  return { code, message, severity };
}

function isInRuleWindow(rule: GrowthCreditRule, occurredAt: string) {
  const occurredTime = new Date(occurredAt).getTime();
  const startTime = rule.effectiveStartAt ? new Date(rule.effectiveStartAt).getTime() : undefined;
  const endTime = rule.effectiveEndAt ? new Date(rule.effectiveEndAt).getTime() : undefined;
  if (Number.isFinite(startTime) && occurredTime < Number(startTime)) return false;
  if (Number.isFinite(endTime) && occurredTime > Number(endTime)) return false;
  return true;
}

function roundCredits(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}

export function createEmptyGrowthCreditConfiguration(): GrowthCreditEngineConfiguration {
  return {
    enabled: false,
    rules: []
  };
}

export function validateGrowthCreditConfiguration(
  configuration: GrowthCreditEngineConfiguration
): GrowthRuleViolation[] {
  const seenRuleIds = new Set<string>();
  return configuration.rules.reduce<GrowthRuleViolation[]>((items, rule) => {
    const nextItems = [...items];
    if (!rule.id.trim()) nextItems.push(violation("invalid_configuration", "Every credit rule must have an id."));
    if (seenRuleIds.has(rule.id)) {
      nextItems.push(violation("invalid_configuration", `Credit rule ${rule.id} is duplicated.`));
    }
    if (rule.credits < 0 || !Number.isFinite(rule.credits)) {
      nextItems.push(violation("invalid_configuration", `Credit rule ${rule.id} cannot use negative credits.`));
    }
    if (rule.multiplier !== undefined && (rule.multiplier < 0 || !Number.isFinite(rule.multiplier))) {
      nextItems.push(violation("invalid_configuration", `Credit rule ${rule.id} has an invalid multiplier.`));
    }
    if (rule.bonusMultiplier !== undefined && (rule.bonusMultiplier < 0 || !Number.isFinite(rule.bonusMultiplier))) {
      nextItems.push(violation("invalid_configuration", `Credit rule ${rule.id} has an invalid bonus multiplier.`));
    }
    if (rule.minimumCredits !== undefined && rule.minimumCredits < 0) {
      nextItems.push(violation("invalid_configuration", `Credit rule ${rule.id} cannot use negative minimum credits.`));
    }
    if (rule.maximumCredits !== undefined && rule.maximumCredits < 0) {
      nextItems.push(violation("invalid_configuration", `Credit rule ${rule.id} cannot use negative maximum credits.`));
    }
    seenRuleIds.add(rule.id);
    return nextItems;
  }, []);
}

export function calculateGrowthCredits(input: GrowthCreditCalculationInput): GrowthCreditCalculationResult {
  const { activity, configuration } = input;
  const duplicateKey = activity.duplicateKey ?? `${activity.campaignId}:${activity.supporterId}:${activity.id}`;
  const existingKeys = new Set(input.existingLedgerKeys ?? []);
  const violations = validateGrowthCreditConfiguration(configuration);

  if (!configuration.enabled) {
    return {
      applied: false,
      activity,
      ledger: [],
      totalCredits: 0,
      events: [],
      violations: [violation("disabled_engine", "Growth Credit Engine is disabled.", "info")]
    };
  }

  if (existingKeys.has(duplicateKey)) {
    return {
      applied: false,
      activity,
      ledger: [],
      totalCredits: 0,
      events: [],
      violations: [violation("duplicate_calculation", "Growth credits for this activity were already calculated.", "warning")]
    };
  }

  if (violations.some((item) => item.severity === "error")) {
    return {
      applied: false,
      activity,
      ledger: [],
      totalCredits: 0,
      events: [],
      violations
    };
  }

  const matchingRules = configuration.rules
    .filter((rule) => rule.enabled)
    .filter((rule) => rule.activityKind === activity.kind)
    .filter((rule) => isInRuleWindow(rule, activity.occurredAt));

  if (matchingRules.length === 0) {
    return {
      applied: false,
      activity,
      ledger: [],
      totalCredits: 0,
      events: [],
      violations: [violation("ineligible_activity", `${activity.kind} has no active credit rule.`, "info")]
    };
  }

  const ledger = matchingRules.reduce<GrowthCreditLedgerEntry[]>((items, rule) => {
    const rawCredits = rule.credits * (rule.multiplier ?? 1) * (rule.bonusMultiplier ?? 1) * (activity.quantity ?? 1);
    const credits = roundCredits(Math.min(rule.maximumCredits ?? rawCredits, Math.max(rule.minimumCredits ?? 0, rawCredits)));
    if (credits <= 0) return items;
    return [
      ...items,
      {
        id: `credit-${activity.id}-${rule.id}`,
        campaignId: activity.campaignId,
        supporterId: activity.supporterId,
        activityId: activity.id,
        creditKind: rule.creditKind,
        credits,
        occurredAt: activity.occurredAt,
        duplicateKey: `${duplicateKey}:${rule.id}`,
        metadata: rule.metadata
      }
    ];
  }, []);

  const totalCredits = roundCredits(ledger.reduce((sum, item) => sum + item.credits, 0));

  return {
    applied: ledger.length > 0,
    activity,
    ledger,
    totalCredits,
    events: ledger.map((entry) => ({
      type: GrowthEventType.GrowthCreditsEarned,
      priority: GrowthEventPriority.High,
      context: {
        campaignId: entry.campaignId,
        supporterId: entry.supporterId
      },
      metadata: {
        activityId: entry.activityId,
        activityKind: activity.kind,
        creditKind: entry.creditKind,
        credits: entry.credits,
        duplicateKey: entry.duplicateKey
      }
    })),
    violations
  };
}
