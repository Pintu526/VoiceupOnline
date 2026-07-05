import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  ClipboardList,
  Crosshair,
  FileScan,
  Flag,
  Landmark,
  MapPin,
  MessageCircle,
  RadioTower,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";
import type { getCampaignMetrics } from "../../lib";
import type {
  AuthorityRule,
  Campaign,
  IntegrationSettings,
  Organization,
  ScanReviewItem,
  Signer
} from "../../types";
import { Panel } from "../../ui/Panel";
import { getCampaignGoalValue, getLocationGovernance } from "../../utils/campaign";

interface CommandCenterTabProps {
  activeCampaign: Campaign | undefined;
  campaigns: Campaign[];
  campaignSigners: Signer[];
  signers: Signer[];
  authorities: AuthorityRule[];
  scanItems: ScanReviewItem[];
  organization: Organization;
  integrations: IntegrationSettings;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authorityMatch: { authority: AuthorityRule; score: number } | undefined;
  stateTotals: Record<string, number>;
  districtTotals: Record<string, number>;
  blockTotals: Record<string, number>;
  panchayatTotals: Record<string, number>;
  onOpenCampaigns: () => void;
  onOpenFieldCollection: () => void;
  onOpenEngagement: () => void;
  onOpenAuthorities: () => void;
  onOpenSaas: () => void;
  onOpenMovement: () => void;
}

type ActionPriority = "P0" | "P1" | "P2";

function rankedEntries(data: Record<string, number>) {
  return Object.entries(data)
    .filter(([label]) => Boolean(label))
    .sort((a, b) => b[1] - a[1]);
}

function getRiskLevel(score: number, hasAuthority: boolean, hasSupporters: boolean) {
  if (score < 45 || !hasAuthority || !hasSupporters) return "High";
  if (score < 75) return "Medium";
  return "Low";
}

function CommandMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="command-metric-card">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function CommandCenterTab({
  activeCampaign,
  campaigns,
  campaignSigners,
  signers,
  authorities,
  scanItems,
  organization,
  integrations,
  metrics,
  authorityMatch,
  stateTotals,
  districtTotals,
  blockTotals,
  panchayatTotals,
  onOpenCampaigns,
  onOpenFieldCollection,
  onOpenEngagement,
  onOpenAuthorities,
  onOpenSaas,
  onOpenMovement
}: CommandCenterTabProps) {
  const [missionGenerated, setMissionGenerated] = useState(false);
  const campaignScanItems = activeCampaign
    ? scanItems.filter((item) => item.campaignId === activeCampaign.id)
    : scanItems;
  const pendingScans = campaignScanItems.filter((item) => item.status === "Needs review").length;
  const verifiedSupporters = campaignSigners.filter(
    (signer) => signer.status === "verified" || signer.otpVerified
  ).length;
  const reachableSupporters = campaignSigners.filter((signer) => signer.phone || signer.email).length;
  const onlineSupporters = campaignSigners.filter((signer) => signer.source === "online").length;
  const paperSupporters = campaignSigners.filter((signer) => signer.source === "scan" || signer.source === "field").length;
  const communicationProviderReady =
    integrations.whatsappProvider !== "Not configured" ||
    integrations.smsProvider !== "Not configured" ||
    integrations.emailProvider !== "Not configured";
  const governance = getLocationGovernance(organization);
  const governanceConfigured = governance.lockLevel !== "none";
  const authorityReady = Boolean(activeCampaign?.selectedAuthorityId || authorityMatch || authorities.length > 0);
  const petitionReady = Boolean(activeCampaign?.title && activeCampaign.description && activeCampaign.slug);
  const movementHealthScore = Math.min(
    100,
    (activeCampaign ? 12 : 0) +
      (activeCampaign?.status === "Published" ? 14 : 0) +
      (activeCampaign?.heroImage ? 10 : 0) +
      (authorityReady ? 16 : 0) +
      (metrics.total > 0 ? 14 : 0) +
      (metrics.total ? Math.round((verifiedSupporters / Math.max(metrics.total, 1)) * 14) : 0) +
      (pendingScans === 0 ? 8 : 0) +
      (communicationProviderReady ? 6 : 0) +
      (governanceConfigured ? 6 : 0)
  );
  const riskLevel = getRiskLevel(movementHealthScore, authorityReady, metrics.total > 0);
  const topLocations = [
    ...rankedEntries(panchayatTotals).slice(0, 3).map(([label, value]) => ({ label, value, level: "Panchayat/Ward" })),
    ...rankedEntries(blockTotals).slice(0, 3).map(([label, value]) => ({ label, value, level: "Block" })),
    ...rankedEntries(districtTotals).slice(0, 3).map(([label, value]) => ({ label, value, level: "District" })),
    ...rankedEntries(stateTotals).slice(0, 3).map(([label, value]) => ({ label, value, level: "State" }))
  ].slice(0, 6);
  const weakLocations = topLocations.filter((item) => item.value <= Math.max(1, Math.floor(metrics.total * 0.08)));
  const locationCoverage =
    Object.keys(stateTotals).length +
    Object.keys(districtTotals).length +
    Object.keys(blockTotals).length +
    Object.keys(panchayatTotals).length;

  const actionBoard = useMemo(
    () =>
      [
        {
          show: Boolean(activeCampaign && activeCampaign.status !== "Published"),
          priority: "P0" as ActionPriority,
          title: "Campaign unpublished",
          reason: "Public momentum depends on publishing the selected campaign.",
          owner: "Campaign owner",
          action: onOpenCampaigns
        },
        {
          show: !authorityReady,
          priority: "P0" as ActionPriority,
          title: "Missing authority",
          reason: "Petition delivery needs a primary authority route.",
          owner: "Campaign admin",
          action: onOpenAuthorities
        },
        {
          show: Boolean(activeCampaign && !activeCampaign.heroImage),
          priority: "P1" as ActionPriority,
          title: "Missing banner",
          reason: "Campaign pages convert better with a real local image.",
          owner: "Content owner",
          action: onOpenCampaigns
        },
        {
          show: metrics.total === 0,
          priority: "P0" as ActionPriority,
          title: "No supporters yet",
          reason: "Share the public link and start field collection.",
          owner: "Campaign owner",
          action: onOpenEngagement
        },
        {
          show: metrics.total > 0 && verifiedSupporters < Math.ceil(metrics.total * 0.5),
          priority: "P1" as ActionPriority,
          title: "Low verified supporters",
          reason: "Authority submissions are stronger with verified signatures.",
          owner: "Review lead",
          action: onOpenFieldCollection
        },
        {
          show: pendingScans > 0,
          priority: "P1" as ActionPriority,
          title: "Scans pending review",
          reason: `${pendingScans} field collection item${pendingScans === 1 ? "" : "s"} need review.`,
          owner: "Field ops lead",
          action: onOpenFieldCollection
        },
        {
          show: !governanceConfigured,
          priority: "P2" as ActionPriority,
          title: "Missing location governance",
          reason: "SaaS geography lock is not configured.",
          owner: "SaaS admin",
          action: onOpenSaas
        },
        {
          show: !communicationProviderReady,
          priority: "P2" as ActionPriority,
          title: "Communication provider not configured",
          reason: "Bulk delivery remains provider-ready until a provider is configured.",
          owner: "Workspace admin",
          action: onOpenEngagement,
          providerReady: true
        },
        {
          show: Boolean(activeCampaign && !activeCampaign.shareUrl),
          priority: "P2" as ActionPriority,
          title: "Public link not shared",
          reason: "Campaign link is required for public distribution.",
          owner: "Campaign owner",
          action: onOpenCampaigns
        }
      ].filter((item) => item.show),
    [
      activeCampaign,
      authorityReady,
      communicationProviderReady,
      governanceConfigured,
      metrics.total,
      onOpenAuthorities,
      onOpenCampaigns,
      onOpenEngagement,
      onOpenFieldCollection,
      onOpenSaas,
      pendingScans,
      verifiedSupporters
    ]
  );

  const recommendedActions = [
    actionBoard[0]?.title ?? "Share today’s campaign update",
    authorityReady ? "Prepare authority follow-up note" : "Confirm primary authority",
    pendingScans > 0 ? "Review pending field sheets" : "Assign new field collection locality",
    reachableSupporters > 0 ? "Send supporter progress update" : "Collect phone/email for reachable audience",
    activeCampaign?.heroImage ? "Recruit district coordinators" : "Upload a campaign banner"
  ];
  const missionPlan = [
    ["Field collection task", pendingScans > 0 ? "Review pending paper sheets today." : "Collect 25 new supporters from one weak locality."],
    ["Authority task", authorityMatch ? `Prepare follow-up for ${authorityMatch.authority.name}.` : "Select and verify a primary authority."],
    ["Communication task", reachableSupporters > 0 ? `Send update preview to ${reachableSupporters.toLocaleString()} reachable supporters.` : "Prepare WhatsApp copy and collect phone numbers."],
    ["Volunteer task", "Assign one volunteer owner for field collection and one for sharing."],
    ["Campaign polish task", activeCampaign?.heroImage ? "Review public page copy and QR sharing." : "Upload a clear campaign banner image."]
  ];
  const coordinatorLevels = ["Ward", "Panchayat", "Block", "District", "State"];

  return (
    <section className="page-stack command-center">
      <Panel title="Movement Command Center" icon={<Crosshair />}>
        <div className="command-hero">
          <div>
            <span className="eyebrow">National campaign operations room</span>
            <h2>{activeCampaign?.title ?? "Select or create a campaign to start operations"}</h2>
            <p>
              See what is moving, what is weak, and what action should happen next using only existing Voiceup data.
            </p>
          </div>
          <div className={`command-risk-card risk-${riskLevel.toLowerCase()}`}>
            <span>Campaign risk</span>
            <strong>{riskLevel}</strong>
            <small>Movement health {movementHealthScore}/100</small>
          </div>
        </div>
        <div className="command-metric-grid">
          <CommandMetric label="Selected campaign" value={activeCampaign ? activeCampaign.status : "Setup needed"} detail={activeCampaign?.slug ? `/${activeCampaign.slug}` : "No campaign selected"} />
          <CommandMetric label="Total supporters" value={metrics.total} detail={`${onlineSupporters} online, ${paperSupporters} paper/manual`} />
          <CommandMetric label="Verified supporters" value={verifiedSupporters} detail={`${metrics.total ? Math.round((verifiedSupporters / Math.max(metrics.total, 1)) * 100) : 0}% verification`} />
          <CommandMetric label="Field pending" value={pendingScans} detail="Scan/review queue" />
          <CommandMetric label="Authority readiness" value={authorityReady ? "Ready" : "Setup needed"} detail={authorityMatch ? `${authorityMatch.score}% match` : `${authorities.length} authority rules`} />
          <CommandMetric label="Communication" value={reachableSupporters} detail={communicationProviderReady ? "Provider configured" : "Provider-ready only"} />
          <CommandMetric label="Movement health" value={`${movementHealthScore}/100`} detail="Deterministic operations score" />
          <CommandMetric label="Campaign risk" value={riskLevel} detail="Based on weak operational signals" />
        </div>
      </Panel>

      <div className="two-column">
        <Panel title="Geographic Progress" icon={<MapPin />}>
          <div className="command-location-grid">
            <CommandMetric label="Location coverage" value={locationCoverage} detail="State/district/block/panchayat buckets" />
            <CommandMetric label="Online vs paper" value={`${onlineSupporters}/${paperSupporters}`} detail="Online / paper-manual split" />
          </div>
          <div className="ranked-list">
            <span className="eyebrow">Top locations</span>
            {topLocations.length === 0 && <p className="helper-text">Setup needed: collect supporter location data.</p>}
            {topLocations.map((item) => (
              <div key={`${item.level}-${item.label}`}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.level}</small>
                </div>
                <span>{item.value.toLocaleString()}</span>
                <div className="progress"><div style={{ width: `${Math.min(100, (item.value / Math.max(metrics.total, 1)) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="ranked-list weak">
            <span className="eyebrow">Weak locations</span>
            {weakLocations.length === 0 ? (
              <p className="helper-text">No weak location insight yet. More location data will improve this view.</p>
            ) : weakLocations.map((item) => (
              <div key={`weak-${item.level}-${item.label}`}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.level} needs more supporters</small>
                </div>
                <span>{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Action Board" icon={<ClipboardList />}>
          <div className="action-board-list">
            {actionBoard.length === 0 && <p className="success-message">No urgent operational gaps detected.</p>}
            {actionBoard.map((task) => (
              <article className={`action-card priority-${task.priority.toLowerCase()}`} key={task.title}>
                <span>{task.priority}</span>
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.reason}</p>
                  <small>Owner: {task.owner}</small>
                </div>
                {task.providerReady && <em>Provider-ready</em>}
                <button className="secondary-button" type="button" onClick={task.action}>
                  Open
                </button>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="two-column">
        <Panel title="AI Movement Brain" icon={<Sparkles />}>
          <div className="brain-card">
            <span className="eyebrow">What should we do next?</span>
            <strong>{recommendedActions[0]}</strong>
            <p>Provider-ready AI UI using deterministic insights from current app state.</p>
          </div>
          <div className="mission-list">
            {recommendedActions.map((action, index) => (
              <div key={action}>
                <span>{index + 1}</span>
                <strong>{action}</strong>
              </div>
            ))}
          </div>
          <div className="command-insight-grid">
            <div><span>Campaign strength</span><strong>{movementHealthScore}/100</strong></div>
            <div><span>Risk level</span><strong>{riskLevel}</strong></div>
            <div><span>Weak location insight</span><strong>{weakLocations[0]?.label ?? "Setup needed"}</strong></div>
            <div><span>Authority follow-up</span><strong>{authorityMatch?.authority.name ?? "Select authority"}</strong></div>
            <div><span>Volunteer suggestion</span><strong>Recruit local coordinators</strong></div>
            <div><span>Communication suggestion</span><strong>{reachableSupporters ? "Send progress update" : "Build audience"}</strong></div>
          </div>
        </Panel>

        <Panel title="Daily Mission Mode" icon={<Flag />}>
          <button className="primary-button" type="button" onClick={() => setMissionGenerated(true)}>
            Generate Today&apos;s Mission Plan
          </button>
          {missionGenerated ? (
            <div className="mission-list">
              {missionPlan.map(([label, task]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{task}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="helper-text">Generate a deterministic plan from today&apos;s campaign state.</p>
          )}
        </Panel>
      </div>

      <div className="two-column">
        <Panel title="Volunteer War Room" icon={<UsersRound />}>
          <div className="command-insight-grid">
            <div><span>Volunteer readiness</span><strong>{metrics.total > 25 ? "Ready to recruit" : "Setup needed"}</strong></div>
            <div><span>Top volunteer</span><strong>Provider-ready</strong></div>
            <div><span>Field upload status</span><strong>{pendingScans ? `${pendingScans} pending` : "Clear"}</strong></div>
            <div><span>District gaps</span><strong>{Object.keys(districtTotals).length ? "Review coverage" : "Setup needed"}</strong></div>
          </div>
          <div className="coordinator-grid">
            {coordinatorLevels.map((level) => (
              <div key={level}>
                <strong>{level} Coordinator</strong>
                <small>{Object.keys(districtTotals).length ? "Assign owner" : "Setup needed"}</small>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Authority Delivery Tracker" icon={<Landmark />}>
          <div className="delivery-tracker">
            {[
              ["Primary authority", authorityMatch?.authority.name ?? "Setup needed"],
              ["Suggested authorities", authorityReady ? `${authorities.length} available` : "Setup needed"],
              ["Petition ready", petitionReady ? "Ready" : "Needs campaign copy"],
              ["Export-ready", petitionReady ? "PDF/CSV available in Reports" : "Setup needed"],
              ["Email-ready", integrations.emailProvider === "Not configured" ? "Provider-ready" : integrations.emailProvider],
              ["Follow-up due", "Provider-ready"],
              ["Response status", "Provider-ready"]
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Communication Readiness" icon={<MessageCircle />}>
        <div className="command-metric-grid">
          <CommandMetric label="Reachable supporters" value={reachableSupporters} detail="Phone or email available" />
          <CommandMetric label="Audience count" value={campaignSigners.length} detail="Selected campaign supporters" />
          <CommandMetric label="WhatsApp" value={integrations.whatsappProvider === "Not configured" ? "Provider-ready" : integrations.whatsappProvider} detail="No bulk send from this screen" />
          <CommandMetric label="SMS" value={integrations.smsProvider === "Not configured" ? "Provider-ready" : integrations.smsProvider} detail="No send action" />
          <CommandMetric label="Email" value={integrations.emailProvider === "Not configured" ? "Provider-ready" : integrations.emailProvider} detail="No send action" />
          <CommandMetric label="IVR" value="Provider-ready" detail="Future voice provider" />
        </div>
        <div className="brain-card">
          <span className="eyebrow">Consent reminder</span>
          <strong>Do not send messages without consent verification.</strong>
          <p>{activeCampaign?.participantUpdateMessage || activeCampaign?.socialShareText || "Suggested message appears after campaign copy is configured."}</p>
        </div>
      </Panel>
    </section>
  );
}

export default CommandCenterTab;
