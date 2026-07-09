import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BellRing,
  CalendarDays,
  ClipboardList,
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
  Smartphone,
  Target,
  UploadCloud,
  UserRound,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AuthorityRule, Campaign, ScanReviewItem, Signer } from "../../types";
import { Panel } from "../../ui/Panel";
import { MetricCard } from "../../ui/MetricCard";
import { Field } from "../../ui/Field";

interface MovementCrmTabProps {
  campaigns: Campaign[];
  activeCampaign: Campaign | undefined;
  signers: Signer[];
  campaignSigners: Signer[];
  scanItems: ScanReviewItem[];
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
  ["WhatsApp", "Setup needed", MessageCircle],
  ["SMS", "Setup needed", Phone],
  ["Email", "Setup needed", Mail],
  ["IVR", "Setup needed", BellRing],
  ["Social media", "Setup needed", Share2],
  ["Push notification", "Setup needed", Send]
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
  scanItems,
  authorities
}: MovementCrmTabProps) {
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedVolunteerLevel, setSelectedVolunteerLevel] = useState("Volunteer");
  const [taskOwner, setTaskOwner] = useState("Field lead");
  const [dailyTarget, setDailyTarget] = useState(25);
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
  const campaignScanItems = activeCampaign
    ? scanItems.filter((item) => item.campaignId === activeCampaign.id)
    : scanItems;
  const pendingUploads = campaignScanItems.filter((item) => item.status === "Needs review").length;
  const approvedUploads = campaignScanItems.filter((item) => item.status === "Approved").length;
  const rejectedUploads = campaignScanItems.filter((item) => item.status === "Rejected").length;
  const blockCoverage = uniqueCount(movementSigners.map((signer) => signer.block));
  const panchayatCoverage = uniqueCount(movementSigners.map((signer) => signer.panchayat));
  const fieldCollectionSupporters = movementSigners.filter(
    (signer) => signer.source === "scan" || signer.source === "field"
  ).length;

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
    ["Volunteers", 0, "Role upgrade available after setup"],
    ["New supporters", newSupporters, "Signed in the last 7 days"],
    ["Most active", supporterProfiles.filter((profile) => profile.campaignsSupported > 1).length, "Multiple campaign support by phone"],
    ["Inactive", inactiveSupporters, "No activity in 30+ days"],
    ["Communication-consented", 0, "Consent ledger available after setup"]
  ];

  const topReferrers = supporterProfiles.slice(0, 3);
  const selectedProfile = supporterProfiles.find((profile) => profile.id === selectedProfileId);
  const leaderboard = supporterProfiles
    .slice()
    .sort((a, b) => b.campaignsSupported - a.campaignsSupported || Number(b.otpVerified) - Number(a.otpVerified))
    .slice(0, 5);
  const volunteerReadinessScore = Math.min(
    100,
    (movementSigners.length > 0 ? 20 : 0) +
      Math.min(25, verifiedCount * 2) +
      Math.min(20, districtCoverage * 5) +
      Math.min(15, fieldCollectionSupporters * 3) +
      (communicationReady > 0 ? 20 : 0)
  );
  const coordinatorGaps = [
    ["State Coordinator", stateCoverage > 0, "Own statewide operations"],
    ["District Coordinator", districtCoverage > 0, "Assign one owner per active district"],
    ["Block Coordinator", blockCoverage > 0, "Assign for block-level field work"],
    ["Panchayat Coordinator", panchayatCoverage > 0, "Assign for ward/panchayat mobilization"],
    ["Ward Coordinator", panchayatCoverage > 0, "Use when ward data is available"]
  ];
  const districtGaps = Array.from(new Set(movementSigners.map((signer) => signer.district).filter(Boolean)))
    .slice(0, 6)
    .map((district) => ({
      label: district,
      ready: false,
      detail: "Assign district coordinator"
    }));
  const blockGaps = Array.from(new Set(movementSigners.map((signer) => signer.block).filter(Boolean)))
    .slice(0, 6)
    .map((block) => ({
      label: block,
      ready: false,
      detail: "Assign block coordinator"
    }));
  const volunteerTasks = [
    ["Field collection", "Collect 25 signatures from weak localities", "Field lead", activeCampaign ? "Ready to assign" : "Setup needed"],
    ["Upload tracking", pendingUploads > 0 ? `Review ${pendingUploads} pending upload${pendingUploads === 1 ? "" : "s"}` : "Upload new paper sheets", "Review lead", "Real queue"],
    ["Supporter verification", "Call or message pending supporters", "Volunteer", "Assignment available after setup"],
    ["Authority follow-up", "Prepare office visit or phone follow-up", "Coordinator", authorityReady ? "Ready" : "Needs authority"],
    ["Communication push", "Share campaign update with reachable supporters", "Digital volunteer", communicationReady ? "Ready" : "Needs contacts"]
  ];

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
          <MetricCard icon={<GitBranch />} label="Referrals" value={0} detail="Tracking appears after referrals" />
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
              <small>{state === "real" ? "Real data" : "Setup needed"}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Volunteer Operations" icon={<ShieldCheck />}>
        <div className="volunteer-ops-hero">
          <div>
            <span className="eyebrow">Field coordinator dashboard</span>
            <h3>Manage volunteers across state, district, block, panchayat, and ward levels.</h3>
            <p>
              Real supporter and field collection data powers readiness, upload tracking, and performance.
              Assignment, attendance, and volunteer role persistence are available after setup.
            </p>
          </div>
          <div className="volunteer-readiness-card">
            <span>Volunteer readiness</span>
            <strong>{volunteerReadinessScore}/100</strong>
            <small>{movementSigners.length.toLocaleString()} supporter profiles available</small>
          </div>
        </div>

        <div className="volunteer-ops-grid">
          <div className="volunteer-ops-card">
            <UsersRound size={20} />
            <span>Volunteer profiles</span>
            <strong>{supporterProfiles.length.toLocaleString()}</strong>
            <small>Real supporter records; role upgrade is available after setup.</small>
          </div>
          <div className="volunteer-ops-card">
            <Target size={20} />
            <span>Daily collection target</span>
            <strong>{Math.max(25, Math.ceil(Math.max(1, movementSigners.length) * 0.12)).toLocaleString()}</strong>
            <small>Suggested target from current supporter base.</small>
          </div>
          <div className="volunteer-ops-card">
            <UploadCloud size={20} />
            <span>Upload tracking</span>
            <strong>{campaignScanItems.length.toLocaleString()}</strong>
            <small>{pendingUploads} pending, {approvedUploads} approved, {rejectedUploads} rejected.</small>
          </div>
          <div className="volunteer-ops-card">
            <CalendarDays size={20} />
            <span>Attendance/events</span>
            <strong>Setup needed</strong>
            <small>Meeting and event participation tracking placeholder.</small>
          </div>
          <div className="volunteer-ops-card">
            <ClipboardList size={20} />
            <span>Field performance</span>
            <strong>{fieldCollectionSupporters.toLocaleString()}</strong>
            <small>Scan/field supporters imported for this scope.</small>
          </div>
          <div className="volunteer-ops-card">
            <MapPin size={20} />
            <span>Coordinator gaps</span>
            <strong>{coordinatorGaps.filter(([, ready]) => !ready).length}</strong>
            <small>Gaps based on available location coverage.</small>
          </div>
        </div>

        <div className="two-column">
          <div className="volunteer-task-board">
            <span className="eyebrow">Task assignment UI</span>
            <div className="volunteer-assignment-controls">
              <Field label="Volunteer level">
                <select value={selectedVolunteerLevel} onChange={(event) => setSelectedVolunteerLevel(event.target.value)}>
                  {volunteerLevels.map(([level]) => <option key={level}>{level}</option>)}
                </select>
              </Field>
              <Field label="Suggested owner">
                <select value={taskOwner} onChange={(event) => setTaskOwner(event.target.value)}>
                  {["Field lead", "Volunteer", "Ward Coordinator", "Block Coordinator", "District Coordinator"].map((owner) => (
                    <option key={owner}>{owner}</option>
                  ))}
                </select>
              </Field>
              <Field label="Daily target">
                <input
                  type="number"
                  min="0"
                  value={dailyTarget}
                  onChange={(event) => setDailyTarget(Number(event.target.value))}
                />
              </Field>
            </div>
            {volunteerTasks.map(([task, detail, owner, status]) => (
              <article className="volunteer-task-card" key={task}>
                <div>
                  <strong>{task}</strong>
                  <p>{detail}</p>
                  <small>Suggested owner: {owner} - planning owner: {taskOwner}</small>
                </div>
                <span>{status}</span>
              </article>
            ))}
          </div>
          <div className="coordinator-gap-board">
            <span className="eyebrow">Coordinator gap detection</span>
            {coordinatorGaps.map(([level, ready, detail]) => (
              <article className={ready ? "coordinator-gap-card ready" : "coordinator-gap-card"} key={String(level)}>
                <strong>{level}</strong>
                <small>{detail}</small>
                <span>{ready ? "Coverage available" : "Setup needed"}</span>
              </article>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Mobile Volunteer Dashboard" icon={<Smartphone />}>
        <div className="mobile-volunteer-dashboard">
          <div className="mobile-volunteer-card">
            <span>Today's target</span>
            <strong>{dailyTarget.toLocaleString()}</strong>
            <small>{selectedVolunteerLevel} planning view</small>
          </div>
          <div className="mobile-volunteer-card">
            <span>Uploads pending</span>
            <strong>{pendingUploads.toLocaleString()}</strong>
            <small>Review before counting as imported supporters</small>
          </div>
          <div className="mobile-volunteer-card">
            <span>Field supporters</span>
            <strong>{fieldCollectionSupporters.toLocaleString()}</strong>
            <small>Scan/manual sourced supporters</small>
          </div>
          <div className="mobile-volunteer-card">
            <span>Attendance</span>
            <strong>Setup needed</strong>
            <small>Event check-in and shift tracking placeholder</small>
          </div>
        </div>
        <div className="two-column">
          <div className="coordinator-gap-board">
            <span className="eyebrow">District coordinator gaps</span>
            {districtGaps.length === 0 && <p className="helper-text">District gap detection appears after signer location data is available.</p>}
            {districtGaps.map((gap) => (
              <article className="coordinator-gap-card" key={gap.label}>
                <strong>{gap.label}</strong>
                <small>{gap.detail}</small>
                <span>Setup needed</span>
              </article>
            ))}
          </div>
          <div className="coordinator-gap-board">
            <span className="eyebrow">Block coordinator gaps</span>
            {blockGaps.length === 0 && <p className="helper-text">Block gap detection appears after signer location data is available.</p>}
            {blockGaps.map((gap) => (
              <article className="coordinator-gap-card" key={gap.label}>
                <strong>{gap.label}</strong>
                <small>{gap.detail}</small>
                <span>Setup needed</span>
              </article>
            ))}
          </div>
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
                  <span>Occupation</span><strong>Setup needed</strong>
                  <span>Organization</span><strong>Setup needed</strong>
                  <span>Campaigns supported</span><strong>{profile.campaignsSupported}</strong>
                  <span>Volunteer level</span><strong>{profile.volunteerLevel}</strong>
                  <span>Communication consent</span><strong>Setup needed</strong>
                  <span>Referral count</span><strong>Setup needed</strong>
                  <span>Donation status</span><strong>Setup needed</strong>
                </div>
                <div className="template-chip-row">
                  {profile.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <small>Last activity: {new Date(profile.lastActivity).toLocaleDateString()}</small>
                {profile.comment && <p>{profile.comment}</p>}
                <button className="secondary-button" type="button" onClick={() => setSelectedProfileId(profile.id)}>
                  Open profile
                </button>
              </article>
            ))}
            {supporterProfiles.length === 0 && <p className="helper-text">No supporter records yet.</p>}
          </div>
          {selectedProfile && (
            <aside className="supporter-detail-drawer" aria-label="Supporter profile detail">
              <button className="icon-button" type="button" aria-label="Close supporter profile" onClick={() => setSelectedProfileId("")}>
                X
              </button>
              <span className="eyebrow">Supporter profile</span>
              <h3>{selectedProfile.name || "Unnamed supporter"}</h3>
              <p>{selectedProfile.phone || "No phone"} - {selectedProfile.email || "No email"}</p>
              <div className="profile-grid">
                <span>Location</span><strong>{selectedProfile.location || "Not captured"}</strong>
                <span>Volunteer level</span><strong>{selectedProfile.volunteerLevel}</strong>
                <span>Tags</span><strong>{selectedProfile.tags.join(", ")}</strong>
                <span>Journey</span><strong>Signed campaign {"->"} volunteer path after setup</strong>
                <span>Referral tree</span><strong>Appears after referrals</strong>
                <span>Consent readiness</span><strong>{selectedProfile.phone || selectedProfile.email ? "Contact field available" : "Needs contact"}</strong>
              </div>
            </aside>
          )}
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
                <strong>Setup milestone</strong>
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
          <div className="segment-builder-card">
            <span className="eyebrow">Segment builder</span>
            <strong>Build audience using existing supporter data</strong>
            <div className="template-chip-row">
              {["State", "District", "Campaign", "Verified", "New supporters", "Inactive"].map((filter) => (
                <span key={filter}>{filter}</span>
              ))}
            </div>
            <p className="helper-text">Saved segment persistence and automation are available after setup.</p>
          </div>
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
        <Panel title="Movement Leaderboard" icon={<BadgeCheck />}>
          <div className="leaderboard-list">
            {leaderboard.length === 0 && <p className="helper-text">Leaderboard appears after supporters join.</p>}
            {leaderboard.map((profile, index) => (
              <div className="leaderboard-row" key={profile.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{profile.name || "Unnamed supporter"}</strong>
                  <small>{profile.campaignsSupported} campaign touchpoint{profile.campaignsSupported === 1 ? "" : "s"} - {profile.otpVerified ? "verified" : "pending"}</small>
                </div>
              </div>
            ))}
          </div>
          <p className="helper-text">Volunteer score and referral-based ranking appear after setup.</p>
        </Panel>

        <Panel title="Referral Network" icon={<Share2 />}>
          <div className="referral-network">
            {topReferrers.map((profile, index) => (
              <div className="referral-node" key={profile.id}>
                <strong>{index + 1}. {profile.name || "Supporter"}</strong>
                <small>Referral count appears after sharing</small>
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
            <div><span>Nearby volunteers</span><strong>Setup needed</strong></div>
            <div><span>Suggested coordinators</span><strong>Setup needed</strong></div>
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
