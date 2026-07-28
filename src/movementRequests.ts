import type {
  Campaign,
  ParticipationRequest,
  ParticipationRequestLevel,
  ParticipationRequestSubmission,
  PublicParticipationRequest,
  PublicParticipationRequestStage
} from "./types";

export const PARTICIPATION_REQUEST_LEVELS: ParticipationRequestLevel[] = [
  "national",
  "state",
  "district",
  "block",
  "panchayat",
  "ward"
];

const levelRank: Record<ParticipationRequestLevel, number> = {
  national: 6,
  state: 5,
  district: 4,
  block: 3,
  panchayat: 2,
  ward: 1
};

export function getMinimumParticipationLevels(
  preferredLevel: ParticipationRequestLevel
): ParticipationRequestLevel[] {
  return PARTICIPATION_REQUEST_LEVELS.filter(
    (level) => levelRank[level] <= levelRank[preferredLevel]
  );
}

export function parseParticipationRequestList(value: string): string[] {
  return [...new Set(
    value
      .split(",")
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
  )].slice(0, 20);
}

export function participationRequestFingerprint(
  request: ParticipationRequestSubmission
): string {
  return JSON.stringify(request);
}

export function createParticipationRequestIdempotencyKey(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `participation-request:${random}`;
}

export function toPublicParticipationRequest(
  request: ParticipationRequest,
  campaign: Pick<Campaign, "id" | "slug" | "title">
): PublicParticipationRequest {
  let currentStage: PublicParticipationRequestStage;
  if (
    request.status === "assigned"
    || request.status === "approved"
    || request.status === "rejected"
    || request.status === "withdrawn"
  ) {
    currentStage = request.status;
  } else if (request.status === "escalated" || request.escalationState === "required") {
    currentStage = "escalated";
  } else if (request.routingMetadata.resolution === "candidate_resolved") {
    currentStage = "pending_review";
  } else {
    currentStage = "awaiting_assignment";
  }

  return {
    id: request.id,
    requestType: request.requestType,
    requestedRole: request.requestedRole,
    campaign: {
      id: campaign.id,
      slug: campaign.slug,
      title: campaign.title
    },
    status: request.status,
    preferredLevel: request.preferredLevel,
    minimumAcceptableLevel: request.minimumAcceptableLevel,
    geographicScope: {
      country: request.geographicScope.country,
      state: request.geographicScope.state,
      district: request.geographicScope.district,
      block: request.geographicScope.block,
      panchayat: request.geographicScope.panchayat,
      ward: request.geographicScope.ward
    },
    currentStage,
    submittedAt: request.submittedAt,
    updatedAt: request.updatedAt
  };
}
