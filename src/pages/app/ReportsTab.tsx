import { BarChart3, Download, FileText, MapPin, RadioTower, Users } from "lucide-react";
import type { AuthorityRule, Campaign, IntegrationSettings, ScanReviewItem, Signer } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { exportCsv } from "../../lib";
import { exportPdf, exportSignerAppealPdf } from "../../pdfExports";
import { Panel } from "../../ui/Panel";
import { ReportBlock } from "../../ui/ReportBlock";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";

interface ReportsTabProps {
  activeCampaign: Campaign | undefined;
  campaigns: Campaign[];
  signers: Signer[];
  scanItems: ScanReviewItem[];
  integrations: IntegrationSettings;
  campaignSigners: Signer[];
  metrics: ReturnType<typeof getCampaignMetrics>;
  authorityMatch: { authority: AuthorityRule; score: number } | undefined;
  dailyTotals: Record<string, number>;
  weeklyTotals: Record<string, number>;
  stateTotals: Record<string, number>;
  districtTotals: Record<string, number>;
  blockTotals: Record<string, number>;
  panchayatTotals: Record<string, number>;
  onUpdateSignerStatus: (signerId: string, status: Signer["status"]) => void;
  onCreateCampaign: () => void;
}

export function ReportsTab({
  activeCampaign,
  campaigns,
  signers,
  scanItems,
  integrations,
  campaignSigners,
  authorityMatch,
  dailyTotals,
  weeklyTotals,
  stateTotals,
  districtTotals,
  blockTotals,
  panchayatTotals,
  onUpdateSignerStatus,
  onCreateCampaign
}: ReportsTabProps) {
  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title="Reports will appear after campaign setup"
        description="Create a campaign and collect signatures before downloading PDF or CSV reports."
        onCreateCampaign={onCreateCampaign}
      />
    );
  }
  const locationCoverage =
    Object.keys(stateTotals).length +
    Object.keys(districtTotals).length +
    Object.keys(blockTotals).length +
    Object.keys(panchayatTotals).length;
  const verifiedCount = campaignSigners.filter((signer) => signer.status === "verified" || signer.otpVerified).length;
  const communicationReady = campaignSigners.filter((signer) => signer.phone || signer.email).length;
  const authorityReady = authorityMatch ? "Ready" : "Needs authority";
  const allVerified = signers.filter((signer) => signer.status === "verified" || signer.otpVerified).length;
  const onlineCount = campaignSigners.filter((signer) => signer.source === "online").length;
  const paperCount = campaignSigners.filter((signer) => signer.source === "scan").length;
  const manualCount = campaignSigners.filter((signer) => signer.source === "field").length;
  const pendingScans = scanItems.filter((item) => item.campaignId === activeCampaign.id && item.status === "Needs review").length;
  const approvedScans = scanItems.filter((item) => item.campaignId === activeCampaign.id && item.status === "Approved").length;
  const weakDistricts = Object.entries(districtTotals)
    .filter(([, count]) => count <= Math.max(1, Math.floor(campaignSigners.length * 0.08)))
    .sort((a, b) => a[1] - b[1])
    .slice(0, 6);
  const topDistricts = Object.entries(districtTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const campaignComparison = campaigns
    .map((campaign) => {
      const campaignSupporters = signers.filter((signer) => signer.campaignId === campaign.id);
      const verified = campaignSupporters.filter((signer) => signer.status === "verified" || signer.otpVerified).length;
      return {
        campaign,
        supporters: campaignSupporters.length,
        verified
      };
    })
    .sort((a, b) => b.supporters - a.supporters)
    .slice(0, 8);
  const providerConfigured =
    integrations.whatsappProvider !== "Not configured" ||
    integrations.smsProvider !== "Not configured" ||
    integrations.emailProvider !== "Not configured";

  return (
    <section className="page-stack">
      <Panel title="National Command Center 2.0" icon={<RadioTower />}>
        <div className="national-command-hero">
          <div>
            <span className="eyebrow">Leadership visibility</span>
            <h2>India, state, and district campaign performance.</h2>
            <p>
              Built from existing campaigns, supporters, field collection, authority routing, and communication readiness.
            </p>
          </div>
          <div className="analytics-command-card">
            <span>National verified supporters</span>
            <strong>{allVerified.toLocaleString()}</strong>
            <small>{signers.length.toLocaleString()} total supporter records across campaigns</small>
          </div>
        </div>
        <div className="analytics-command-grid">
          {[
            ["Campaigns", campaigns.length, "All workspace campaigns"],
            ["India coverage", Object.keys(stateTotals).length, "States with supporters"],
            ["District coverage", Object.keys(districtTotals).length, "Districts with supporters"],
            ["Weak districts", weakDistricts.length, "Low participation districts"],
            ["Online collection", onlineCount, "Selected campaign online supporters"],
            ["Paper collection", paperCount, "Selected campaign scan supporters"],
            ["Manual collection", manualCount, "Selected campaign field supporters"],
            ["Pending field review", pendingScans, "Scan rows needing review"]
          ].map(([label, value, detail]) => (
            <div className="analytics-command-card" key={String(label)}>
              <span>{label}</span>
              <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Analytics Command Center" icon={<BarChart3 />}>
        <div className="analytics-command-grid">
          {[
            ["National overview", campaignSigners.length, "Real campaign signer records"],
            ["Verified supporters", verifiedCount, "OTP verified or approved"],
            ["Location coverage", locationCoverage, "State/district/block/panchayat buckets"],
            ["Authority readiness", authorityReady, authorityMatch ? `${authorityMatch.score}% confidence` : "No match"],
            ["Field collection status", campaignSigners.filter((signer) => signer.source === "scan").length, "Imported scan supporters"],
            ["Communication readiness", communicationReady, "Phone or email available"],
            ["Volunteer productivity", manualCount + paperCount, "Field/manual contribution proxy"],
            ["AI insight cards", "Provider ready", "Mock recommendations only"]
          ].map(([label, value, detail]) => (
            <div className="analytics-command-card" key={String(label)}>
              <span>{label}</span>
              <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
        <div className="two-column">
          <div className="export-ready-card">
            <FileText size={22} />
            <strong>Export-ready reporting section</strong>
            <p>PDF and CSV export buttons below continue using existing export functions.</p>
          </div>
          <div className="export-ready-card">
            <MapPin size={22} />
            <strong>Distribution insight</strong>
            <p>Use the existing location reports below to compare state, district, block, and panchayat coverage.</p>
          </div>
        </div>
      </Panel>

      <div className="two-column">
        <Panel title="Supporter Growth Trend" icon={<BarChart3 />}>
          <div className="growth-trend-list">
            {Object.entries(dailyTotals).length === 0 && <p className="helper-text">No daily supporter trend yet.</p>}
            {Object.entries(dailyTotals).slice(-14).map(([date, count]) => (
              <div key={date}>
                <span>{date}</span>
                <strong>{count.toLocaleString()}</strong>
                <div className="progress">
                  <div style={{ width: `${Math.min(100, (count / Math.max(...Object.values(dailyTotals), 1)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Weak District Detection" icon={<MapPin />}>
          <div className="growth-trend-list weak">
            {weakDistricts.length === 0 && <p className="helper-text">Weak district insight appears after district data is available.</p>}
            {weakDistricts.map(([district, count]) => (
              <div key={district}>
                <span>{district}</span>
                <strong>{count.toLocaleString()}</strong>
                <small>Needs focused volunteer and communication push.</small>
              </div>
            ))}
          </div>
          <span className="eyebrow">Top districts</span>
          <div className="template-chip-row">
            {topDistricts.map(([district, count]) => <span key={district}>{district}: {count}</span>)}
          </div>
        </Panel>
      </div>

      <Panel title="Campaign Comparison" icon={<Users />}>
        <div className="campaign-comparison-grid">
          {campaignComparison.map(({ campaign, supporters, verified }) => (
            <article className="campaign-comparison-card" key={campaign.id}>
              <span className="eyebrow">{campaign.status}</span>
              <strong>{campaign.title}</strong>
              <small>/{campaign.slug}</small>
              <div className="progress">
                <div style={{ width: `${Math.min(100, (supporters / Math.max(...campaignComparison.map((item) => item.supporters), 1)) * 100)}%` }} />
              </div>
              <p>{supporters.toLocaleString()} supporters - {verified.toLocaleString()} verified</p>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Leadership Readiness" icon={<RadioTower />}>
        <div className="analytics-command-grid">
          {[
            ["Authority response tracking", "Provider-ready", "Response status and follow-up dates need provider workflow"],
            ["Field collection status", `${approvedScans} approved / ${pendingScans} pending`, "Existing scan review data"],
            ["Communication readiness", communicationReady, providerConfigured ? "Provider configured" : "Provider-ready only"],
            ["Exportable reports", "Ready", "PDF and CSV exports below use existing functions"],
            ["AI insight cards", "Provider-ready", "No real AI API connected"],
            ["Volunteer productivity", manualCount + paperCount, "Field contribution proxy from source data"]
          ].map(([label, value, detail]) => (
            <div className="analytics-command-card" key={String(label)}>
              <span>{label}</span>
              <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Reports and exports" icon={<Download />}>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={() =>
              exportPdf(activeCampaign, campaignSigners, authorityMatch?.authority)
            }
          >
            <FileText size={18} /> Download PDF report
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => exportCsv(activeCampaign, campaignSigners)}
          >
            <Download size={18} /> Download CSV
          </button>
        </div>
        <div className="report-grid">
          <ReportBlock title="Daily status" data={dailyTotals} />
          <ReportBlock title="Weekly status" data={weeklyTotals} />
          <ReportBlock title="State-wise count" data={stateTotals} />
          <ReportBlock title="District-wise count" data={districtTotals} />
          <ReportBlock title="Block-wise count" data={blockTotals} />
          <ReportBlock title="Panchayat / ward count" data={panchayatTotals} />
        </div>
      </Panel>

      <Panel title="Signer register" icon={<Users />}>
        {campaignSigners.length === 0 ? (
          <p>No signers have been collected for this campaign yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Alt contacts</th>
                  <th>OTP</th>
                  <th>State</th>
                  <th>District</th>
                  <th>Block</th>
                  <th>Panchayat / Ward</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Signed at</th>
                  <th>Review</th>
                  <th>Appeal PDF</th>
                </tr>
              </thead>
              <tbody>
                {campaignSigners.map((signer) => (
                  <tr key={signer.id}>
                    <td>
                      <strong>{signer.name}</strong>
                      <span>{signer.email}</span>
                    </td>
                    <td>{signer.phone}</td>
                    <td>
                      <span>WA: {signer.whatsappNumber || signer.phone || "-"}</span>
                      <span>TG: {signer.telegramHandle || "-"}</span>
                    </td>
                    <td>{signer.otpVerified ? "Verified" : "Not verified"}</td>
                    <td>{signer.state || "Not captured"}</td>
                    <td>{signer.district || "Not captured"}</td>
                    <td>{signer.block || "Not captured"}</td>
                    <td>{signer.panchayat || "Not captured"}</td>
                    <td>{signer.source}</td>
                    <td>
                      <select
                        value={signer.status}
                        onChange={(e) =>
                          onUpdateSignerStatus(signer.id, e.target.value as Signer["status"])
                        }
                      >
                        <option value="verified">verified</option>
                        <option value="pending">pending</option>
                        <option value="duplicate">duplicate</option>
                        <option value="rejected">rejected</option>
                      </select>
                    </td>
                    <td>{new Date(signer.signedAt).toLocaleString()}</td>
                    <td>{signer.reviewerNote ?? "Ready"}</td>
                    <td>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          exportSignerAppealPdf(
                            activeCampaign,
                            signer,
                            authorityMatch?.authority
                          )
                        }
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
