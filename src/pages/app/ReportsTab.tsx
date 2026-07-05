import { useState } from "react";
import { BarChart3, BookOpen, ClipboardCopy, Download, FileCheck2, FileText, MapPin, Printer, RadioTower, Users } from "lucide-react";
import type { AuthorityRule, Campaign, IntegrationSettings, Organization, ScanReviewItem, Signer } from "../../types";
import type { getCampaignMetrics } from "../../lib";
import { exportCsv } from "../../lib";
import {
  buildCoverLetterText,
  exportPdf,
  exportSignerAppealPdf,
  reportThemeOptions,
  type ReportThemeId
} from "../../pdfExports";
import { Panel } from "../../ui/Panel";
import { ReportBlock } from "../../ui/ReportBlock";
import { NoCampaignPanel } from "../../ui/NoCampaignPanel";
import { getReferralLeaderboard } from "../../utils/referrals";

interface ReportsTabProps {
  activeCampaign: Campaign | undefined;
  campaigns: Campaign[];
  organization: Organization;
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
  organization,
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
  const [reportExportMessage, setReportExportMessage] = useState("");
  const [reportThemeId, setReportThemeId] = useState<ReportThemeId>("government-classic");

  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title="Reports will appear after campaign setup"
        description="Create a campaign and collect signatures before downloading PDF or CSV reports."
        onCreateCampaign={onCreateCampaign}
      />
    );
  }
  const campaign = activeCampaign;
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
  const referredSignatures = campaignSigners.filter((signer) => signer.referredBy || signer.referredByPhoneOrCode).length;
  const referralLeaders = getReferralLeaderboard(campaignSigners);
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
  const collectionTotal = Math.max(1, onlineCount + paperCount + manualCount);
  const topStates = Object.entries(stateTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topBlocks = Object.entries(blockTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const weakBlocks = Object.entries(blockTotals)
    .filter(([, count]) => count <= Math.max(1, Math.floor(campaignSigners.length * 0.05)))
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5);
  const aiInsights = [
    weakDistricts.length > 0
      ? `Prioritize ${weakDistricts[0][0]} for field collection and volunteer outreach.`
      : "District coverage looks balanced or needs more district data.",
    authorityMatch
      ? `Authority route is ready with ${authorityMatch.score}% confidence.`
      : "Add or confirm an authority before large-scale outreach.",
    communicationReady > 0
      ? `${communicationReady.toLocaleString()} supporters are reachable by phone or email after consent checks.`
      : "Collect consented phone or email fields before communication pushes.",
    pendingScans > 0
      ? `Review ${pendingScans.toLocaleString()} pending field collection rows.`
      : "Field collection queue has no pending review rows."
  ];

  function downloadPetitionDossier() {
    exportPdf(campaign, campaignSigners, authorityMatch?.authority, {
      organization,
      integrations,
      theme: reportThemeId
    });
  }

  async function copyCoverLetter() {
    const text = buildCoverLetterText(campaign, campaignSigners, authorityMatch?.authority, {
      organization,
      integrations,
      theme: reportThemeId
    });
    try {
      await navigator.clipboard.writeText(text);
      setReportExportMessage("Cover letter copied. Paste it into Word, Google Docs, email, or an authority submission portal.");
    } catch {
      setReportExportMessage("Cover letter is ready, but clipboard access was blocked by the browser.");
    }
  }

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

      <Panel title="State, District, and Block Progress" icon={<MapPin />}>
        <div className="analytics-progress-grid">
          <div className="analytics-progress-card">
            <span className="eyebrow">Top states</span>
            <div className="ranked-list">
              {topStates.length === 0 && <p className="helper-text">State data appears after supporters provide location.</p>}
              {topStates.map(([state, count]) => (
                <div key={state}>
                  <span>{state}</span>
                  <strong>{count.toLocaleString()}</strong>
                  <div className="progress">
                    <div style={{ width: `${Math.min(100, (count / Math.max(...Object.values(stateTotals), 1)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="analytics-progress-card">
            <span className="eyebrow">Top districts</span>
            <div className="ranked-list">
              {topDistricts.length === 0 && <p className="helper-text">District progress appears after district data is available.</p>}
              {topDistricts.map(([district, count]) => (
                <div key={district}>
                  <span>{district}</span>
                  <strong>{count.toLocaleString()}</strong>
                  <div className="progress">
                    <div style={{ width: `${Math.min(100, (count / Math.max(...Object.values(districtTotals), 1)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="analytics-progress-card">
            <span className="eyebrow">Top blocks</span>
            <div className="ranked-list">
              {topBlocks.length === 0 && <p className="helper-text">Block progress appears after block data is available.</p>}
              {topBlocks.map(([block, count]) => (
                <div key={block}>
                  <span>{block}</span>
                  <strong>{count.toLocaleString()}</strong>
                  <div className="progress">
                    <div style={{ width: `${Math.min(100, (count / Math.max(...Object.values(blockTotals), 1)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="analytics-progress-card">
            <span className="eyebrow">Weak blocks</span>
            <div className="ranked-list weak">
              {weakBlocks.length === 0 && <p className="helper-text">Weak block insight appears after block-level data is available.</p>}
              {weakBlocks.map(([block, count]) => (
                <div key={block}>
                  <span>{block}</span>
                  <strong>{count.toLocaleString()}</strong>
                  <small>Needs local coordinator push.</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Collection Split and AI Insights" icon={<RadioTower />}>
        <div className="analytics-progress-grid">
          {[
            ["Online", onlineCount, "Public signing page"],
            ["Paper", paperCount, "OCR/scan import"],
            ["Manual", manualCount, "Manual field entry"]
          ].map(([label, value, detail]) => (
            <div className="analytics-progress-card" key={String(label)}>
              <span className="eyebrow">{label}</span>
              <strong>{Number(value).toLocaleString()}</strong>
              <div className="progress">
                <div style={{ width: `${Math.min(100, (Number(value) / collectionTotal) * 100)}%` }} />
              </div>
              <small>{detail}</small>
            </div>
          ))}
          <div className="analytics-progress-card ai-ready">
            <span className="eyebrow">AI insight cards</span>
            <strong>Provider-ready</strong>
            {aiInsights.map((insight) => <small key={insight}>{insight}</small>)}
          </div>
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
            ["Referral growth", referredSignatures, referralLeaders[0] ? `Top referrer: ${referralLeaders[0].label}` : "Provider-ready leaderboard"],
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
        <div className="report-suite-hero">
          <div>
            <span className="eyebrow">Authority-ready Petition Dossier</span>
            <h2>Premium report package for submission, print, media, and leadership review.</h2>
            <p>
              Built only from existing campaign, supporter, authority, organization, location, field collection,
              and provider-ready readiness data. Missing values are marked Not configured or Not available.
            </p>
          </div>
          <div className="report-suite-score">
            <strong>{verifiedCount.toLocaleString()}</strong>
            <span>verified supporters ready for formal reporting</span>
          </div>
        </div>
        <div className="report-theme-panel" aria-label="Signature Edition report theme">
          <div>
            <span className="eyebrow">Signature Edition theme</span>
            <h3>Choose report presentation for this export session.</h3>
            <p>
              Theme changes only affect typography, colors, headers, cover styling, spacing, and footer treatment.
              Report content and calculations remain identical.
            </p>
          </div>
          <div className="report-theme-grid" role="radiogroup" aria-label="Report theme">
            {reportThemeOptions.map((theme) => (
              <label
                className={reportThemeId === theme.id ? "report-theme-card selected" : "report-theme-card"}
                key={theme.id}
              >
                <input
                  type="radio"
                  name="report-theme"
                  value={theme.id}
                  checked={reportThemeId === theme.id}
                  onChange={() => setReportThemeId(theme.id)}
                />
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </label>
            ))}
          </div>
        </div>
        <div className="report-export-grid">
          {[
            {
              title: "Authority-ready Petition Dossier",
              detail: "Cover page, executive summary, details, dashboard, location summary, register, authority package, letter, certificate, and annexures.",
              icon: FileCheck2,
              action: downloadPetitionDossier,
              button: "Download PDF"
            },
            {
              title: "Supporter Register",
              detail: "Formal wide-table register with supporter identity, location, status, source, notes, and page numbering inside the dossier.",
              icon: Users,
              action: downloadPetitionDossier,
              button: "Download register"
            },
            {
              title: "Executive Summary",
              detail: "One-page authority and leadership summary included in the dossier with progress, routing, location, and readiness.",
              icon: BookOpen,
              action: downloadPetitionDossier,
              button: "Download summary"
            },
            {
              title: "Raw Data Export",
              detail: "CSV remains available for spreadsheet analysis, backup, and custom reporting.",
              icon: Download,
              action: () => exportCsv(activeCampaign, campaignSigners),
              button: "Download CSV"
            },
            {
              title: "Print / PDF",
              detail: "Use browser print for the current reports page, or use the dossier PDF for authority-ready formatting.",
              icon: Printer,
              action: () => window.print(),
              button: "Print page"
            },
            {
              title: "Copy Cover Letter",
              detail: "Copy a professional neutral cover letter for Word, email, or an authority portal.",
              icon: ClipboardCopy,
              action: copyCoverLetter,
              button: "Copy letter"
            }
          ].map((item) => (
            <article className="report-export-card" key={item.title}>
              <item.icon size={22} />
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <button className="secondary-button" type="button" onClick={item.action}>
                {item.button}
              </button>
            </article>
          ))}
        </div>
        {reportExportMessage && <p className="success-message">{reportExportMessage}</p>}
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={downloadPetitionDossier}
          >
            <FileText size={18} /> Download petition dossier
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => exportCsv(activeCampaign, campaignSigners)}
          >
            <Download size={18} /> Download CSV
          </button>
          <button className="secondary-button" type="button" onClick={copyCoverLetter}>
            <ClipboardCopy size={18} /> Copy cover letter
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
