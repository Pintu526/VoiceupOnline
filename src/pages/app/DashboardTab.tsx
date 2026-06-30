import { CalendarDays, FileScan, Globe2, Landmark, SearchCheck, Users } from "lucide-react";
import type { AuthorityRule, Campaign } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { Panel } from "../../ui/Panel";
import { MetricCard } from "../../ui/MetricCard";
import { BarList } from "../../ui/BarList";
import { Hero } from "../../components/Hero";
import { EmptyWorkspace } from "../../components/EmptyWorkspace";
import type { Organization } from "../../types";

interface DashboardTabProps {
  activeCampaign: Campaign | undefined;
  metrics: ReturnType<typeof getCampaignMetrics>;
  authorityMatch: { authority: AuthorityRule; score: number } | undefined;
  dailyTotals: Record<string, number>;
  organization: Organization;
  onCreateCampaign: () => void;
  onOpenSubscription: () => void;
}

const PLACEHOLDER_CAMPAIGN: Campaign = {
  id: "",
  title: "Your Campaign Dashboard",
  slug: "",
  category: "Civic",
  description: "Create your first campaign to start collecting signatures and tracking progress.",
  appealContent: "",
  authorityTargetLevel: "district",
  authoritySelectionMode: "admin_enforced",
  selectedAuthorityId: "",
  donationEnabled: false,
  donationLockedBySaas: false,
  donationCaption: "",
  donationUpiId: "",
  donationQrImage: "",
  donationPaymentDetails: "",
  donationAllowOneTime: false,
  donationAllowRecurring: false,
  state: "",
  district: "",
  block: "",
  panchayat: "",
  location: "",
  postalCode: "",
  startDate: "",
  endDate: "",
  goal: 0,
  status: "Draft",
  consentText: "",
  requiredFields: [],
  requiredFieldsLockedBySaas: false,
  authorityLockedBySaas: false,
  publishingLockedBySaas: false,
  goalLockedBySaas: false,
  datesLockedBySaas: false,
  maxSignersAllowed: 0,
  maxScansAllowed: 0,
  shareUrl: "",
  adminUrl: "",
  adminEmail: "",
  adminPasscode: "",
  qrLabel: "",
  heroImage: "",
  heroImagePosition: "center center",
  heroImageZoom: 120,
  campaignVideoUrl: "",
  socialShareText: "",
  thankYouMessage: "",
  participantUpdateMessage: ""
};

export function DashboardTab({
  activeCampaign,
  metrics,
  authorityMatch,
  dailyTotals,
  organization,
  onCreateCampaign,
  onOpenSubscription
}: DashboardTabProps) {
  const displayCampaign = activeCampaign ?? PLACEHOLDER_CAMPAIGN;

  return (
    <section className="page-stack">
      <Hero
        campaign={displayCampaign}
        metrics={metrics}
        authority={authorityMatch?.authority}
      />

      <div className="metric-grid dashboard-metrics" aria-label="Campaign performance metrics">
        <MetricCard
          icon={<Users />}
          label="Total signers"
          value={metrics.total}
          detail={`${metrics.verified} verified`}
        />
        <MetricCard
          icon={<Globe2 />}
          label="Online signatures"
          value={metrics.online}
          detail="Collected from public page"
        />
        <MetricCard
          icon={<FileScan />}
          label="Scanned records"
          value={metrics.scanned}
          detail={`${metrics.pending} awaiting review`}
        />
        <MetricCard
          icon={<SearchCheck />}
          label="Duplicates"
          value={metrics.duplicates}
          detail="Flagged automatically"
        />
      </div>

      {!activeCampaign && (
        <EmptyWorkspace
          organization={organization}
          onCreateCampaign={onCreateCampaign}
          onOpenSubscription={onOpenSubscription}
        />
      )}

      <div className="two-column dashboard-insights">
        <Panel title="Daily campaign status" icon={<CalendarDays />}>
          <BarList data={dailyTotals} emptyLabel="No signer activity yet." />
        </Panel>
        <Panel title="Authority routing" icon={<Landmark />}>
          {authorityMatch ? (
            <div className="authority-card">
              <strong>{authorityMatch.authority.name}</strong>
              <span>{authorityMatch.authority.department}</span>
              <span>{authorityMatch.authority.email}</span>
              <div className="progress">
                <div style={{ width: `${authorityMatch.score}%` }} />
              </div>
              <small>
                {authorityMatch.score}% routing confidence by category, location, and PIN code.
              </small>
            </div>
          ) : (
            <p>No matching authority rule has been configured.</p>
          )}
        </Panel>
      </div>
    </section>
  );
}
