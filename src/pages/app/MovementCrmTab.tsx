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
import { useTranslation } from "../../i18n/useTranslation";

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

function getCampaignTitle(campaigns: Campaign[], campaignId: string, fallback: string) {
  return campaigns.find((campaign) => campaign.id === campaignId)?.title ?? fallback;
}

export function MovementCrmTab({
  campaigns,
  activeCampaign,
  signers,
  campaignSigners,
  scanItems,
  authorities
}: MovementCrmTabProps) {
  const { t } = useTranslation();
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
      label: t("crm.health.supporterGrowth"),
      score: Math.min(20, movementSigners.length > 0 ? 10 + newSupporters * 2 : 0),
      suggestion: t("crm.health.bringSupporters")
    },
    {
      label: t("crm.health.verifiedSupporters"),
      score: movementSigners.length ? Math.round((verifiedCount / movementSigners.length) * 20) : 0,
      suggestion: t("crm.health.improveVerification")
    },
    {
      label: t("crm.health.locationCoverage"),
      score: Math.min(20, districtCoverage * 5 + stateCoverage * 3),
      suggestion: t("crm.health.expandGeography")
    },
    {
      label: t("crm.health.engagementReadiness"),
      score: movementSigners.length ? Math.round((communicationReady / movementSigners.length) * 20) : 0,
      suggestion: t("crm.health.collectContacts")
    },
    {
      label: t("crm.health.authorityReadiness"),
      score: authorityReady ? 20 : 0,
      suggestion: t("crm.health.attachAuthority")
    }
  ];
  const healthScore = healthChecks.reduce((sum, check) => sum + check.score, 0);

  const segments = [
    [t("crm.segments.byState"), stateCoverage, t("crm.segments.stateValues")],
    [t("crm.segments.byDistrict"), districtCoverage, t("crm.segments.districtValues")],
    [t("crm.segments.byCampaign"), uniqueCount(movementSigners.map((signer) => signer.campaignId)), t("crm.segments.campaignSupport")],
    [t("crm.segments.byCategory"), uniqueCount(campaigns.map((campaign) => campaign.category)), t("crm.segments.categories")],
    [t("crm.common.volunteers"), 0, t("crm.segments.roleUpgrade")],
    [t("crm.segments.newSupporters"), newSupporters, t("crm.segments.lastSevenDays")],
    [t("crm.segments.mostActive"), supporterProfiles.filter((profile) => profile.campaignsSupported > 1).length, t("crm.segments.multipleCampaigns")],
    [t("crm.segments.inactive"), inactiveSupporters, t("crm.segments.noActivity")],
    [t("crm.segments.consented"), 0, t("crm.segments.consentLedger")]
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
    [t("crm.volunteers.stateCoordinator"), stateCoverage > 0, t("crm.volunteers.stateOwner")],
    [t("crm.volunteers.districtCoordinator"), districtCoverage > 0, t("crm.volunteers.districtOwner")],
    [t("crm.volunteers.blockCoordinator"), blockCoverage > 0, t("crm.volunteers.blockOwner")],
    [t("crm.volunteers.panchayatCoordinator"), panchayatCoverage > 0, t("crm.volunteers.panchayatOwner")],
    [t("crm.volunteers.wardCoordinator"), panchayatCoverage > 0, t("crm.volunteers.wardOwner")]
  ];
  const districtGaps = Array.from(new Set(movementSigners.map((signer) => signer.district).filter(Boolean)))
    .slice(0, 6)
    .map((district) => ({
      label: district,
      ready: false,
      detail: t("crm.volunteers.assignDistrict")
    }));
  const blockGaps = Array.from(new Set(movementSigners.map((signer) => signer.block).filter(Boolean)))
    .slice(0, 6)
    .map((block) => ({
      label: block,
      ready: false,
      detail: t("crm.volunteers.assignBlock")
    }));
  const volunteerTasks = [
    [t("crm.tasks.fieldCollection"), t("crm.tasks.collectSignatures"), t("crm.owners.fieldLead"), t(activeCampaign ? "crm.status.readyAssign" : "crm.status.setupNeeded")],
    [t("crm.tasks.uploadTracking"), pendingUploads > 0 ? `${t("crm.tasks.review")} ${pendingUploads} ${t("crm.tasks.pendingUploads")}` : t("crm.tasks.uploadSheets"), t("crm.owners.reviewLead"), t("crm.status.realQueue")],
    [t("crm.tasks.supporterVerification"), t("crm.tasks.contactPending"), t("crm.common.volunteer"), t("crm.status.assignmentAfterSetup")],
    [t("crm.tasks.authorityFollowup"), t("crm.tasks.prepareFollowup"), t("crm.owners.coordinator"), t(authorityReady ? "crm.status.ready" : "crm.status.needsAuthority")],
    [t("crm.tasks.communicationPush"), t("crm.tasks.shareUpdate"), t("crm.owners.digitalVolunteer"), t(communicationReady ? "crm.status.ready" : "crm.status.needsContacts")]
  ];

  return (
    <section className="page-stack movement-crm">
      <Panel title={t("crm.title")} icon={<Network />}>
        <div className="movement-hero">
          <div>
            <span className="eyebrow">{t("crm.hero.eyebrow")}</span>
            <h2>{activeCampaign ? activeCampaign.title : t("crm.hero.allCampaigns")}</h2>
            <p>{t("crm.hero.description")}</p>
          </div>
          <div className="movement-health">
            <span>{t("crm.health.title")}</span>
            <strong>{healthScore}/100</strong>
            <small>{t("crm.health.dataHelp")}</small>
          </div>
        </div>

        <div className="metric-grid">
          <MetricCard icon={<UsersRound />} label={t("crm.common.supporters")} value={movementSigners.length} detail={t("crm.metrics.realRecords")} />
          <MetricCard icon={<BadgeCheck />} label={t("crm.common.verified")} value={verifiedCount} detail={t("crm.metrics.verifiedOtp")} />
          <MetricCard icon={<MapPin />} label={t("crm.common.districts")} value={districtCoverage} detail={t("crm.metrics.locationCoverage")} />
          <MetricCard icon={<GitBranch />} label={t("crm.common.referrals")} value={0} detail={t("crm.metrics.referralTracking")} />
        </div>
      </Panel>

      <Panel title={t("crm.graph.title")} icon={<GitBranch />}>
        <div className="movement-graph" aria-label={t("crm.graph.aria")}>
          {[
            [t("crm.graph.campaign"), activeCampaign?.title ?? `${campaigns.length} ${t("crm.common.campaigns")}`, "real"],
            [t("crm.common.supporters"), `${movementSigners.length} ${t("crm.graph.signerRecords")}`, "real"],
            [t("crm.common.volunteers"), t("crm.graph.rolePipeline"), "ready"],
            [t("crm.graph.authorities"), `${authorities.length} ${t("crm.graph.authorityRules")}`, "real"],
            [t("crm.graph.communications"), "SMS, WhatsApp, Email, IVR", "ready"],
            [t("crm.common.referrals"), t("crm.graph.inviteTracking"), "ready"],
            [t("crm.graph.events"), t("crm.graph.meetings") , "ready"],
            [t("crm.graph.documents"), t("crm.graph.letters"), "ready"]
          ].map(([label, value, state]) => (
            <div className={state === "real" ? "movement-node real" : "movement-node"} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{t(state === "real" ? "crm.status.realData" : "crm.status.setupNeeded")}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t("crm.volunteers.operations")} icon={<ShieldCheck />}>
        <div className="volunteer-ops-hero">
          <div>
            <span className="eyebrow">{t("crm.volunteers.dashboard")}</span>
            <h3>{t("crm.volunteers.manageAcrossLevels")}</h3>
            <p>{t("crm.volunteers.operationsHelp")}</p>
          </div>
          <div className="volunteer-readiness-card">
            <span>{t("crm.volunteers.readiness")}</span>
            <strong>{volunteerReadinessScore}/100</strong>
            <small>{movementSigners.length.toLocaleString()} {t("crm.volunteers.profilesAvailable")}</small>
          </div>
        </div>

        <div className="volunteer-ops-grid">
          <div className="volunteer-ops-card">
            <UsersRound size={20} />
            <span>{t("crm.volunteers.profiles")}</span>
            <strong>{supporterProfiles.length.toLocaleString()}</strong>
            <small>{t("crm.volunteers.profilesHelp")}</small>
          </div>
          <div className="volunteer-ops-card">
            <Target size={20} />
            <span>{t("crm.volunteers.dailyTarget")}</span>
            <strong>{Math.max(25, Math.ceil(Math.max(1, movementSigners.length) * 0.12)).toLocaleString()}</strong>
            <small>{t("crm.volunteers.targetHelp")}</small>
          </div>
          <div className="volunteer-ops-card">
            <UploadCloud size={20} />
            <span>{t("crm.tasks.uploadTracking")}</span>
            <strong>{campaignScanItems.length.toLocaleString()}</strong>
            <small>{pendingUploads} {t("crm.status.pending")}, {approvedUploads} {t("crm.status.approved")}, {rejectedUploads} {t("crm.status.rejected")}.</small>
          </div>
          <div className="volunteer-ops-card">
            <CalendarDays size={20} />
            <span>{t("crm.volunteers.attendanceEvents")}</span>
            <strong>{t("crm.status.setupNeeded")}</strong>
            <small>{t("crm.volunteers.attendanceHelp")}</small>
          </div>
          <div className="volunteer-ops-card">
            <ClipboardList size={20} />
            <span>{t("crm.volunteers.fieldPerformance")}</span>
            <strong>{fieldCollectionSupporters.toLocaleString()}</strong>
            <small>{t("crm.volunteers.fieldHelp")}</small>
          </div>
          <div className="volunteer-ops-card">
            <MapPin size={20} />
            <span>{t("crm.volunteers.coordinatorGaps")}</span>
            <strong>{coordinatorGaps.filter(([, ready]) => !ready).length}</strong>
            <small>{t("crm.volunteers.gapsHelp")}</small>
          </div>
        </div>

        <div className="two-column">
          <div className="volunteer-task-board">
            <span className="eyebrow">{t("crm.tasks.assignmentUi")}</span>
            <div className="volunteer-assignment-controls">
              <Field label={t("crm.volunteers.level")}>
                <select value={selectedVolunteerLevel} onChange={(event) => setSelectedVolunteerLevel(event.target.value)}>
                  {volunteerLevels.map(([level]) => <option key={level} value={level}>{t(`crm.levels.${level.replace(/\s/g, "").toLowerCase()}.label`)}</option>)}
                </select>
              </Field>
              <Field label={t("crm.tasks.suggestedOwner")}>
                <select value={taskOwner} onChange={(event) => setTaskOwner(event.target.value)}>
                  {["Field lead", "Volunteer", "Ward Coordinator", "Block Coordinator", "District Coordinator"].map((owner) => (
                    <option key={owner} value={owner}>{t(`crm.owners.${owner.replace(/\s/g, "").toLowerCase()}`)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("crm.volunteers.dailyTarget")}>
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
                  <small>{t("crm.tasks.suggestedOwner")}: {owner} - {t("crm.tasks.planningOwner")}: {taskOwner}</small>
                </div>
                <span>{status}</span>
              </article>
            ))}
          </div>
          <div className="coordinator-gap-board">
            <span className="eyebrow">{t("crm.volunteers.gapDetection")}</span>
            {coordinatorGaps.map(([level, ready, detail]) => (
              <article className={ready ? "coordinator-gap-card ready" : "coordinator-gap-card"} key={String(level)}>
                <strong>{level}</strong>
                <small>{detail}</small>
                <span>{t(ready ? "crm.status.coverageAvailable" : "crm.status.setupNeeded")}</span>
              </article>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title={t("crm.mobile.title")} icon={<Smartphone />}>
        <div className="mobile-volunteer-dashboard">
          <div className="mobile-volunteer-card">
            <span>{t("crm.mobile.todayTarget")}</span>
            <strong>{dailyTarget.toLocaleString()}</strong>
            <small>{t(`crm.levels.${selectedVolunteerLevel.replace(/\s/g, "").toLowerCase()}.label`)} {t("crm.mobile.planningView")}</small>
          </div>
          <div className="mobile-volunteer-card">
            <span>{t("crm.mobile.uploadsPending")}</span>
            <strong>{pendingUploads.toLocaleString()}</strong>
            <small>{t("crm.mobile.reviewBeforeCounting")}</small>
          </div>
          <div className="mobile-volunteer-card">
            <span>{t("crm.mobile.fieldSupporters")}</span>
            <strong>{fieldCollectionSupporters.toLocaleString()}</strong>
            <small>{t("crm.mobile.scanManual")}</small>
          </div>
          <div className="mobile-volunteer-card">
            <span>{t("crm.mobile.attendance")}</span>
            <strong>{t("crm.status.setupNeeded")}</strong>
            <small>{t("crm.mobile.attendanceHelp")}</small>
          </div>
        </div>
        <div className="two-column">
          <div className="coordinator-gap-board">
            <span className="eyebrow">{t("crm.mobile.districtGaps")}</span>
            {districtGaps.length === 0 && <p className="helper-text">{t("crm.mobile.districtGapsEmpty")}</p>}
            {districtGaps.map((gap) => (
              <article className="coordinator-gap-card" key={gap.label}>
                <strong>{gap.label}</strong>
                <small>{gap.detail}</small>
                <span>{t("crm.status.setupNeeded")}</span>
              </article>
            ))}
          </div>
          <div className="coordinator-gap-board">
            <span className="eyebrow">{t("crm.mobile.blockGaps")}</span>
            {blockGaps.length === 0 && <p className="helper-text">{t("crm.mobile.blockGapsEmpty")}</p>}
            {blockGaps.map((gap) => (
              <article className="coordinator-gap-card" key={gap.label}>
                <strong>{gap.label}</strong>
                <small>{gap.detail}</small>
                <span>{t("crm.status.setupNeeded")}</span>
              </article>
            ))}
          </div>
        </div>
      </Panel>

      <div className="two-column">
        <Panel title={t("supporters.profiles.title")} icon={<UserRound />}>
          <div className="supporter-profile-list">
            {supporterProfiles.slice(0, 8).map((profile) => (
              <article className="supporter-profile-card" key={profile.id}>
                <div>
                  <strong>{profile.name || t("supporters.common.unnamed")}</strong>
                  <small>{profile.phone || t("supporters.common.noPhone")} - {profile.email || t("supporters.common.noEmail")}</small>
                </div>
                <div className="profile-grid">
                  <span>{t("supporters.fields.location")}</span><strong>{profile.location || t("supporters.common.notCaptured")}</strong>
                  <span>{t("supporters.fields.occupation")}</span><strong>{t("crm.status.setupNeeded")}</strong>
                  <span>{t("supporters.fields.organization")}</span><strong>{t("crm.status.setupNeeded")}</strong>
                  <span>{t("supporters.fields.campaignsSupported")}</span><strong>{profile.campaignsSupported}</strong>
                  <span>{t("crm.volunteers.level")}</span><strong>{t("crm.levels.supporter.label")}</strong>
                  <span>{t("supporters.fields.communicationConsent")}</span><strong>{t("crm.status.setupNeeded")}</strong>
                  <span>{t("supporters.fields.referralCount")}</span><strong>{t("crm.status.setupNeeded")}</strong>
                  <span>{t("supporters.fields.donationStatus")}</span><strong>{t("crm.status.setupNeeded")}</strong>
                </div>
                <div className="template-chip-row">
                  {profile.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <small>{t("supporters.fields.lastActivity")}: {new Date(profile.lastActivity).toLocaleDateString()}</small>
                {profile.comment && <p>{profile.comment}</p>}
                <button className="secondary-button" type="button" onClick={() => setSelectedProfileId(profile.id)}>
                  {t("supporters.profiles.open")}
                </button>
              </article>
            ))}
            {supporterProfiles.length === 0 && <p className="helper-text">{t("supporters.profiles.empty")}</p>}
          </div>
          {selectedProfile && (
            <aside className="supporter-detail-drawer" aria-label={t("supporters.profiles.detailAria")}>
              <button className="icon-button" type="button" aria-label={t("supporters.profiles.closeAria")} onClick={() => setSelectedProfileId("")}>
                X
              </button>
              <span className="eyebrow">{t("supporters.profiles.profile")}</span>
              <h3>{selectedProfile.name || t("supporters.common.unnamed")}</h3>
              <p>{selectedProfile.phone || t("supporters.common.noPhone")} - {selectedProfile.email || t("supporters.common.noEmail")}</p>
              <div className="profile-grid">
                <span>{t("supporters.fields.location")}</span><strong>{selectedProfile.location || t("supporters.common.notCaptured")}</strong>
                <span>{t("crm.volunteers.level")}</span><strong>{t("crm.levels.supporter.label")}</strong>
                <span>{t("supporters.fields.tags")}</span><strong>{selectedProfile.tags.join(", ")}</strong>
                <span>{t("supporters.fields.journey")}</span><strong>{t("supporters.profiles.volunteerPath")}</strong>
                <span>{t("supporters.fields.referralTree")}</span><strong>{t("supporters.profiles.afterReferrals")}</strong>
                <span>{t("supporters.fields.consentReadiness")}</span><strong>{t(selectedProfile.phone || selectedProfile.email ? "supporters.profiles.contactAvailable" : "supporters.profiles.needsContact")}</strong>
              </div>
            </aside>
          )}
        </Panel>

        <Panel title={t("crm.timeline.title")} icon={<HeartPulse />}>
          <div className="movement-timeline">
            {supporterProfiles.slice(0, 6).map((profile) => (
              <div className="timeline-item real" key={profile.id}>
                <span>{t("crm.timeline.signedCampaign")}</span>
                <strong>{profile.name || t("supporters.common.supporter")} {t("crm.timeline.signed")} {getCampaignTitle(campaigns, profile.campaignId, t("crm.timeline.unknownCampaign"))}</strong>
                <small>{new Date(profile.signedAt).toLocaleString()}</small>
              </div>
            ))}
            {[
              "invitedSupporters",
              "joinedWhatsapp",
              "attendedMeeting",
              "becameVolunteer",
              "organizedEvent",
              "contactedAuthority"
            ].map((itemKey) => (
              <div className="timeline-item" key={itemKey}>
                <span>{t(`crm.timeline.${itemKey}`)}</span>
                <strong>{t("crm.timeline.setupMilestone")}</strong>
                <small>{t("crm.timeline.trackingHelp")}</small>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title={t("crm.volunteers.management")} icon={<ShieldCheck />}>
        <div className="volunteer-level-grid">
          {volunteerLevels.map(([level, description], index) => (
            <article className={index === 0 ? "volunteer-level-card active" : "volunteer-level-card"} key={level}>
              <span>{index + 1}</span>
              <strong>{t(`crm.levels.${level.replace(/\s/g, "").toLowerCase()}.label`)}</strong>
              <p>{t(`crm.levels.${level.replace(/\s/g, "").toLowerCase()}.description`)}</p>
            </article>
          ))}
        </div>
      </Panel>

      <div className="two-column">
        <Panel title={t("crm.segments.title")} icon={<UsersRound />}>
          <div className="segment-builder-card">
            <span className="eyebrow">{t("crm.segments.builder")}</span>
            <strong>{t("crm.segments.buildAudience")}</strong>
            <div className="template-chip-row">
              {["state", "district", "campaign", "verified", "newSupporters", "inactive"].map((filterKey) => (
                <span key={filterKey}>{t(`crm.segments.filters.${filterKey}`)}</span>
              ))}
            </div>
            <p className="helper-text">{t("crm.segments.persistenceHelp")}</p>
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

        <Panel title={t("crm.engagement.title")} icon={<MessageCircle />}>
          <div className="engagement-channel-grid">
            {engagementChannels.map(([label, status, Icon]) => (
              <article className="engagement-channel-card" key={String(label)}>
                <Icon size={20} />
                <strong>{label}</strong>
                <small>{t("crm.status.setupNeeded")}</small>
                <p>{t("crm.engagement.audience")}: {movementSigners.length.toLocaleString()} {t("crm.common.supporters").toLowerCase()}</p>
                <p>{t("crm.engagement.foundationHelp")}</p>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="two-column">
        <Panel title={t("crm.leaderboard.title")} icon={<BadgeCheck />}>
          <div className="leaderboard-list">
            {leaderboard.length === 0 && <p className="helper-text">{t("crm.leaderboard.empty")}</p>}
            {leaderboard.map((profile, index) => (
              <div className="leaderboard-row" key={profile.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{profile.name || t("supporters.common.unnamed")}</strong>
                  <small>{profile.campaignsSupported} {t("crm.leaderboard.campaignTouchpoints")} - {t(profile.otpVerified ? "crm.status.verified" : "crm.status.pending")}</small>
                </div>
              </div>
            ))}
          </div>
          <p className="helper-text">{t("crm.leaderboard.rankingHelp")}</p>
        </Panel>

        <Panel title={t("referrals.network.title")} icon={<Share2 />}>
          <div className="referral-network">
            {topReferrers.map((profile, index) => (
              <div className="referral-node" key={profile.id}>
                <strong>{index + 1}. {profile.name || t("supporters.common.supporter")}</strong>
                <small>{t("referrals.network.countAfterSharing")}</small>
              </div>
            ))}
            <p className="helper-text">
              {t("referrals.network.trackingHelp")}
            </p>
          </div>
        </Panel>

        <Panel title={t("crm.integration.title")} icon={<ShieldCheck />}>
          <div className="campaign-integration-grid">
            <div><span>{t("crm.integration.existingSupporters")}</span><strong>{campaignSigners.length.toLocaleString()}</strong></div>
            <div><span>{t("crm.integration.potentialAudience")}</span><strong>{signers.length.toLocaleString()}</strong></div>
            <div><span>{t("crm.integration.nearbyVolunteers")}</span><strong>{t("crm.status.setupNeeded")}</strong></div>
            <div><span>{t("crm.integration.suggestedCoordinators")}</span><strong>{t("crm.status.setupNeeded")}</strong></div>
            <div><span>{t("crm.health.authorityReadiness")}</span><strong>{t(authorityReady ? "crm.status.ready" : "crm.status.needsRoute")}</strong></div>
            <div><span>{t("crm.analytics.communicationReadiness")}</span><strong>{communicationReady.toLocaleString()} {t("crm.integration.reachable")}</strong></div>
          </div>
          <div className="quality-suggestions">
            <span className="eyebrow">{t("crm.health.suggestions")}</span>
            {healthChecks.filter((check) => check.score < 15).map((check) => (
              <p key={check.label}>{check.suggestion}</p>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}
