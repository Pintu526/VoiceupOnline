import type {
  AmbassadorDomainModel,
  AmbassadorProfile,
  LeaderboardDomainModel,
  LeaderboardEntry
} from "../types";

function toEntry(profile: AmbassadorProfile, index: number): LeaderboardEntry {
  return {
    rank: index + 1,
    id: profile.id,
    name: profile.name,
    code: profile.code,
    level: profile.level,
    location: profile.location,
    score: profile.totalPoints,
    directReferrals: profile.directReferrals
  };
}

function topBy(
  ambassadors: AmbassadorDomainModel,
  sorter: (left: AmbassadorProfile, right: AmbassadorProfile) => number
) {
  return ambassadors.profiles.slice().sort(sorter).slice(0, 8).map(toEntry);
}

export function buildLeaderboardDomain(ambassadors: AmbassadorDomainModel): LeaderboardDomainModel {
  return {
    overall: topBy(ambassadors, (left, right) => right.totalPoints - left.totalPoints),
    referral: topBy(ambassadors, (left, right) => right.directReferrals - left.directReferrals),
    field: topBy(ambassadors, (left, right) => right.fieldSignatures - left.fieldSignatures)
  };
}
