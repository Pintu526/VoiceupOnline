import { useMemo } from "react";
import {
  BadgeCheck,
  BellRing,
  GitBranch,
  HeartPulse,
  Mail,
  MapPin,
  MessageCircle,
  Network,
  Phone,
  Send,
  Share2,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AuthorityRule, Campaign, Signer } from "../../types";
import { Panel } from "../../ui/Panel";
import { MetricCard } from "../../ui/MetricCard";

interface MovementCrmTabProps {
  campaigns: Campaign[];
  activeCampaign: Campaign | undefined;
  signers: Signer[];
  campaignSigners: Signer[];
  authorities: AuthorityRule[];
}

const volunteerLevels = [
  ["Supporter", "Signed or joined at least one campaign."],
  ["Volunteer", "Ready to help with calls, shares, and field work."],
  ["Senior Volunteer", "Can guide small supporter groups."],
  ["Ward Coordinator", "Coordinates a ward-level cluster."],
  ["Panchayat Coordinator", "Coordinates village or panchayat activity."],
  ["Block Coordinator", "Connects multiple local clusters."],
  ["District Coordinator", "Owns district-level execution."],
  ["State Coordinator", "Coordinates statewide campaign activity."],
  ["National Coordinator", "Supports national movement operations."],
  ["Movement Leader", "Leads strategy, partnerships, and authority escalation."]
];

const engagementChannels: Array<[string, string, LucideIcon]> = [
  ["WhatsApp", "Provider ready", MessageCircle],
  ["SMS", "Provider ready", Phone],
  ["Email", "Provider ready", Mail],
  ["IVR", "Provider ready", BellRing],
  ["Social media", "Provider ready", Share2],
  ["Push notification", "Provider ready", Send]
];

function uniqueCount(values: string[]) {
  return new Set(values.filter(Boolean)).size;
}

function getDaysAgo(dateValue: string) {
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return 9999;
  return Math.floor((Date.now() - time) / 86400000);
}

function getCampaignTitle(campaigns: Campaign[], campaignId: string) {
  return campaigns.find((campaign) => campaign.id === campaignId)?.title ?? "Unknown campaign";
}

export function MovementCrmTab({
  campaigns,
  activeCampaign,
  signers,
  campaignSigners,
  authorities
}: MovementCrmTabProps) {
  const movementSigners = activeCampaign ? campaignSigners : signers;
  const supporterProfiles = useMemo(
    () =>
      movementSigners
        .slice()
        .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())
        .map((signer) => ({
          ...signer,
          location: [signer.panchayat, signer.block, signer.district, signer.state].filter(Boolean).join(", "),
          campaignsSupported: signers.filter((item) => item.phone && item.phone === signer.phone).length || 1,
          lastActivity: signer.signedAt,
          volunteerLevel: "Supporter",
          tags: [signer.status, signer.source, signer.otpVerified ? "Verified" : "Unverified"].filter(Boolean)
        })),
    [movementSigners, signers]
  );

  const verifiedCount = movementSigners.filter((signer) => signer.status === "verified" || signer.otpVerified).length;
  const newSupporters = movementSigners.filter((signer) => getDaysAgo(signer.signedAt) <= 7).length;
  const inactiveSupporters = movementSigners.filter((signer) => getDaysAgo(signer.signedAt) > 30).length;
  const communicationReady = movementSigners.filter((signer) => signer.phone || signer.email).length;
  const districtCoverage = uniqueCount(movementSigners.map((signer) => signer.district));
  const stateCoverage = uniqueCount(movementSigners.map((signer) => signer.state));
  const authorityReady = Boolean(activeCampaign?.selectedAuthorityId || authorities.length > 0);

  const healthChecks = [
    {
      label: "Supporter growth",
      score: Math.min(20, movementSigners.length > 0 ? 10 + newSupporters * 2 : 0),
      suggestion: "Bring in new supporters this week."
    },
    {
      label: "Verified supporters",
      score: movementSigners.length ? Math.round((verifiedCount / movementSigners.length) * 20) : 0,
      suggestion: "Improve verification coverage."
    },
    {
      label: "Location coverage",
      score: Math.min(20, districtCoverage * 5 + stateCoverage * 3),
      suggestion: "Expand beyond the current geography."
    },
    {
      label: "Engagement readiness",
      score: movementSigners.length ? Math.round((communicationReady / movementSigners.length) * 20) : 0,
      suggestion: "Collect phone or email where consent allows."
    },
    {
      label: "Authority readiness",
      score: authorityReady ? 20 : 0,
      suggestion: "Attach a clear authority route."
    }
  ];
  const healthScore = healthChecks.reduce((sum, check) => sum + check.score, 0);

  const segments = [
    ["By state", stateCoverage, "Real signer state values"],
    ["By district", districtCoverage, "Real signer district values"],
    ["By campaign", uniqueCount(movementSigners.map((signer) => signer.campaignId)), "Real campaign support"],
    ["By category", uniqueCount(campaigns.map((campaign) => campaign.category)), "Real campaign categories"],
    ["Volunteers", 0, "Provider-ready role upgrade"],
    ["New supporters", newSupporters, "Signed in the last 7 days"],
    ["Most active", supporterProfiles.filter((profile) => profile.campaignsSupported > 1).length, "Multiple campaign support by phone"],
    ["Inactive", inactiveSupporters, "No activity in 30+ days"],
    ["Communication-consented", 0, "Provider-ready consent ledger"]
  ];

  const topReferrers = supporterProfiles.slice(0, 3);

  return (
    <section className="page-stack movement-crm">
      <Panel title="Movement CRM" icon={<Network />}>
        <div className="movement-hero">
          <div>
            <span className="eyebrow">Public Movement Operating System</span>
            <h2>{activeCampaign ? activeCampaign.title : "All campaigns movement graph"}</h2>
            <p>
              Connect supporters, volunteers, campaigns, authorities, communications, referrals,
              documents, events, and donations from one operating surface.
            </p>
          </div>
          <div className="movement-health">
            <span>Movement Health</span>
            <strong>{healthScore}/100</strong>
            <small>Based only on available campaign, signer, and authority data.</small>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard icon={<UsersRound />} label="Supporters" value={movementSigners.length} detail="Real signer records" />
          <MetricCard icon={<BadgeCheck />} label="Verified" value={verifiedCount} detail="Verified or OTP-confirmed" />
          <MetricCard icon={<MapPin />} label="Districts" value={districtCoverage} detail="Real location coverage" />
          <MetricCard icon={<GitBranch />} label="Referrals" value={0} detail="Provider-ready tracking" />
        </div>
      </Panel>

      <Panel title="Movement Graph" icon={<GitBranch />}>
        <div className="movement-graph" aria-label="Movement graph overview">
          {[
            ["Campaign", activeCampaign?.title ?? `${campaigns.length} campaigns`, "real"],
            ["Supporters", `${movementSigners.length} signer records`, "real"],
            ["Volunteers", "Role upgrade pipeline", "ready"],
            ["Authorities", `${authorities.length} authority rules`, "real"],
            ["Communications", "SMS, WhatsApp, Email, IVR", "ready"],
            ["Referrals", "Invite tree tracking", "ready"],
            ["Events", "Meetings and field actions", "ready"],
            ["Documents", "Letters, PDFs, evidence", "ready"]
          ].map(([label, value, state]) => (
            <div className={state === "real" ? "movement-node real" : "movement-node"} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{state === "real" ? "Real data" : "Provider ready"}</small>
            </div>
          ))}
        </div>
      </Panel>

      <div className="two-column">
        <Panel title="Supporter Profiles" icon={<UserRound />}>
          <div className="supporter-profile-list">
            {supporterProfiles.slice(0, 8).map((profile) => (
              <article className="supporter-profile-card" key={profile.id}>
                <div>
                  <strong>{profile.name || "Unnamed supporter"}</strong>
                  <small>{profile.phone || "No phone"} - {profile.email || "No email"}</small>
                </div>
                <div className="profile-grid">
                  <span>Location</span><strong>{profile.location || "Not captured"}</strong>
                  <span>Occupation</span><strong>Provider ready</strong>
                  <span>Organization</span><strong>Provider ready</strong>
                  <span>Campaigns supported</span><strong>{profile.campaignsSupported}</strong>
                  <span>Volunteer level</span><strong>{profile.volunteerLevel}</strong>
                  <span>Communication consent</span><strong>Provider ready</strong>
                  <span>Referral count</span><strong>Provider ready</strong>
                  <span>Donation status</span><strong>Provider ready</strong>
                </div>
                <div className="template-chip-row">
                  {profile.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <small>Last activity: {new Date(profile.lastActivity).toLocaleDateString()}</small>
                {profile.comment && <p>{profile.comment}</p>}
              </article>
            ))}
            {supporterProfiles.length === 0 && <p className="helper-text">No supporter records yet.</p>}
          </div>
        </Panel>

        <Panel title="Movement Timeline" icon={<HeartPulse />}>
          <div className="movement-timeline">
            {supporterProfiles.slice(0, 6).map((profile) => (
              <div className="timeline-item real" key={profile.id}>
                <span>Signed Campaign</span>
                <strong>{profile.name || "Supporter"} signed {getCampaignTitle(campaigns, profile.campaignId)}</strong>
                <small>{new Date(profile.signedAt).toLocaleString()}</small>
              </div>
            ))}
            {[
              "Invited Supporters",
              "Joined WhatsApp",
              "Attended Meeting",
              "Became Volunteer",
              "Organized Event",
              "Contacted Authority"
            ].map((item) => (
              <div className="timeline-item" key={item}>
                <span>{item}</span>
                <strong>Provider-ready milestone</strong>
                <small>Will appear as real activity after tracking is implemented.</small>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Volunteer Management" icon={<ShieldCheck />}>
        <div className="volunteer-level-grid">
          {volunteerLevels.map(([level, description], index) => (
            <article className={index === 0 ? "volunteer-level-card active" : "volunteer-level-card"} key={level}>
              <span>{index + 1}</span>
              <strong>{level}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </Panel>

      <div className="two-column">
        <Panel title="Smart Segments" icon={<UsersRound />}>
          <div className="segment-grid">
            {segments.map(([label, value, detail]) => (
              <button className="segment-card" type="button" key={label}>
                <span>{label}</span>
                <strong>{Number(value).toLocaleString()}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Engagement Hub" icon={<MessageCircle />}>
          <div className="engagement-channel-grid">
            {engagementChannels.map(([label, status, Icon]) => (
              <article className="engagement-channel-card" key={String(label)}>
                <Icon size={20} />
                <strong>{label}</strong>
                <small>{status}</small>
                <p>Audience: {movementSigners.length.toLocaleString()} supporters</p>
                <p>Schedule, preview, and consent checks are UI-only foundations.</p>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="two-column">
        <Panel title="Referral Network" icon={<Share2 />}>
          <div className="referral-network">
            {topReferrers.map((profile, index) => (
              <div className="referral-node" key={profile.id}>
                <strong>{index + 1}. {profile.name || "Supporter"}</strong>
                <small>Referral count provider-ready</small>
              </div>
            ))}
            <p className="helper-text">
              Referral edges, invite codes, growth paths, and top referrers are ready for future tracking.
            </p>
          </div>
        </Panel>

        <Panel title="Campaign Integration" icon={<ShieldCheck />}>
          <div className="campaign-integration-grid">
            <div><span>Existing supporters</span><strong>{campaignSigners.length.toLocaleString()}</strong></div>
            <div><span>Potential audience</span><strong>{signers.length.toLocaleString()}</strong></div>
            <div><span>Nearby volunteers</span><strong>Provider ready</strong></div>
            <div><span>Suggested coordinators</span><strong>Provider ready</strong></div>
            <div><span>Authority readiness</span><strong>{authorityReady ? "Ready" : "Needs route"}</strong></div>
            <div><span>Communication readiness</span><strong>{communicationReady.toLocaleString()} reachable</strong></div>
          </div>
          <div className="quality-suggestions">
            <span className="eyebrow">Health suggestions</span>
            {healthChecks.filter((check) => check.score < 15).map((check) => (
              <p key={check.label}>{check.suggestion}</p>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}
