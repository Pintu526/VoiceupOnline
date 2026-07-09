import { growthEventDefinitions } from "./definitions";
import {
  GrowthEventPriority,
  GrowthEventStatus,
  type GrowthEvent,
  type GrowthEventContext,
  type GrowthEventMetadata,
  type GrowthEventType
} from "./types";
import { GrowthEventUtilities } from "./utilities";

export interface CreateGrowthEventOptions {
  context: GrowthEventContext;
  metadata?: GrowthEventMetadata;
  priority?: GrowthEventPriority;
  status?: GrowthEventStatus;
  timestamp?: string;
}

export class GrowthEventFactory {
  static create(type: GrowthEventType, options: CreateGrowthEventOptions): GrowthEvent {
    const definition = growthEventDefinitions[type];
    const correlationId = options.context.correlationId || GrowthEventUtilities.createCorrelationId();
    const traceId = options.context.traceId || GrowthEventUtilities.createTraceId();

    return {
      eventId: GrowthEventUtilities.createEventId(),
      timestamp: options.timestamp ?? GrowthEventUtilities.now(),
      workspaceId: options.context.workspaceId,
      campaignId: options.context.campaignId,
      supporterId: options.context.supporterId,
      actorId: options.context.actorId,
      type,
      source: definition.source,
      status: options.status ?? GrowthEventStatus.Pending,
      priority: options.priority ?? definition.defaultPriority,
      device: options.context.device,
      browser: options.context.browser,
      platform: options.context.platform,
      country: options.context.country,
      state: options.context.state,
      city: options.context.city,
      language: options.context.language,
      timezone: options.context.timezone,
      utmSource: options.context.utmSource,
      utmMedium: options.context.utmMedium,
      utmCampaign: options.context.utmCampaign,
      referralId: options.context.referralId,
      metadata: options.metadata ?? {},
      correlationId,
      traceId
    };
  }
}
