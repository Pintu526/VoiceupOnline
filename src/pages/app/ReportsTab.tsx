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
import {
  getCampaignGeographyMode,
  getCampaignLocationLabels
} from "../../utils/campaign";
import { useTranslation } from "../../i18n/useTranslation";

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
  onUpdateSignerStatus
}: ReportsTabProps) {
  const { t } = useTranslation();
  const [reportExportMessage, setReportExportMessage] = useState("");
  const [reportThemeId, setReportThemeId] = useState<ReportThemeId>("government-classic");

  if (!activeCampaign) {
    return (
      <NoCampaignPanel
        title={t("reports.noCampaign.title")}
        description={t("reports.noCampaign.description")}
      />
    );
  }
  const campaign = activeCampaign;
  const isGlobalMode = getCampaignGeographyMode(campaign) === "global";
  const locationLabels = getCampaignLocationLabels(campaign);
  const locationCoverage =
    Object.keys(stateTotals).length +
    Object.keys(districtTotals).length +
    Object.keys(blockTotals).length +
    Object.keys(panchayatTotals).length;
  const verifiedCount = campaignSigners.filter((signer) => signer.status === "verified" || signer.otpVerified).length;
  const communicationReady = campaignSigners.filter((signer) => signer.phone || signer.email).length;
  const authorityReady = authorityMatch ? t("reports.status.ready") : t("reports.status.needsAuthority");
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
  const topLocalAreas = isGlobalMode
    ? Object.entries(panchayatTotals).sort((a, b) => b[1] - a[1]).slice(0, 5)
    : topBlocks;
  const weakLocalAreas = isGlobalMode
    ? Object.entries(panchayatTotals)
        .filter(([, count]) => count <= Math.max(1, Math.floor(campaignSigners.length * 0.05)))
        .sort((a, b) => a[1] - b[1])
        .slice(0, 5)
    : weakBlocks;
  const aiInsights = [
    weakDistricts.length > 0
      ? `${t("reports.insights.prioritize")} ${weakDistricts[0][0]} ${t("reports.insights.fieldOutreach")}`
      : `${locationLabels.district} ${t("reports.insights.coverageBalanced")}`,
    authorityMatch
      ? `${t("reports.insights.authorityReady")} ${authorityMatch.score}% ${t("reports.insights.confidence")}`
      : t("reports.insights.confirmAuthority"),
    communicationReady > 0
      ? `${communicationReady.toLocaleString()} ${t("reports.insights.reachable")}`
      : t("reports.insights.collectContacts"),
    pendingScans > 0
      ? `${t("reports.insights.review")} ${pendingScans.toLocaleString()} ${t("reports.insights.pendingRows")}`
      : t("reports.insights.noPendingRows")
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
      setReportExportMessage(t("reports.exports.coverCopied"));
    } catch {
      setReportExportMessage(t("reports.exports.clipboardBlocked"));
    }
  }

  return (
    <section className="page-stack">
      <Panel title={t("reports.location.title")} icon={<RadioTower />}>
        <div className="national-command-hero">
          <div>
            <span className="eyebrow">{t("reports.location.leadershipVisibility")}</span>
            <h2>{t(isGlobalMode ? "reports.location.globalPerformance" : "reports.location.indiaPerformance")}</h2>
            <p>{t("reports.location.builtFrom")}</p>
          </div>
          <div className="analytics-command-card">
            <span>{t("reports.location.nationalVerified")}</span>
            <strong>{allVerified.toLocaleString()}</strong>
            <small>{signers.length.toLocaleString()} {t("reports.location.totalRecords")}</small>
          </div>
        </div>
        <div className="analytics-command-grid">
          {[
            [t("reports.metrics.campaigns"), campaigns.length, t("reports.metrics.allCampaigns")],
            [
              t(isGlobalMode ? "reports.metrics.regionalCoverage" : "reports.metrics.indiaCoverage"),
              Object.keys(stateTotals).length,
              `${locationLabels.state}s with supporters`
            ],
            [`${locationLabels.district} coverage`, Object.keys(districtTotals).length, `${locationLabels.district}s with supporters`],
            [`${t("reports.metrics.weak")} ${locationLabels.district}s`, weakDistricts.length, `${t("reports.metrics.lowParticipation")} ${locationLabels.district.toLowerCase()}s`],
            [t("reports.metrics.onlineCollection"), onlineCount, t("reports.metrics.onlineSupporters")],
            [t("reports.metrics.paperCollection"), paperCount, t("reports.metrics.scanSupporters")],
            [t("reports.metrics.manualCollection"), manualCount, t("reports.metrics.fieldSupporters")],
            [t("reports.metrics.pendingReview"), pendingScans, t("reports.metrics.scanNeedsReview")]
          ].map(([label, value, detail]) => (
            <div className="analytics-command-card" key={String(label)}>
              <span>{label}</span>
              <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={`${locationLabels.state}, ${locationLabels.district}, ${t("reports.common.and")} ${isGlobalMode ? locationLabels.panchayat : locationLabels.block} ${t("reports.common.progress")}`} icon={<MapPin />}>
        <div className="analytics-progress-grid">
          <div className="analytics-progress-card">
            <span className="eyebrow">{t("reports.common.top")} {locationLabels.state.toLowerCase()}s</span>
            <div className="ranked-list">
              {topStates.length === 0 && <p className="helper-text">{locationLabels.state} {t("reports.location.dataAfterSupporters")}</p>}
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
            <span className="eyebrow">{t("reports.common.top")} {locationLabels.district.toLowerCase()}s</span>
            <div className="ranked-list">
              {topDistricts.length === 0 && <p className="helper-text">{locationLabels.district} {t("reports.location.progressAfterData")}</p>}
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
            <span className="eyebrow">{t("reports.common.top")} {isGlobalMode ? locationLabels.panchayat.toLowerCase() : locationLabels.block.toLowerCase()}s</span>
            <div className="ranked-list">
              {topLocalAreas.length === 0 && (
                <p className="helper-text">
                  {isGlobalMode ? locationLabels.panchayat : locationLabels.block} {t("reports.location.progressAfterData")}
                </p>
              )}
              {topLocalAreas.map(([block, count]) => (
                <div key={block}>
                  <span>{block}</span>
                  <strong>{count.toLocaleString()}</strong>
                  <div className="progress">
                    <div style={{ width: `${Math.min(100, (count / Math.max(...Object.values(isGlobalMode ? panchayatTotals : blockTotals), 1)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="analytics-progress-card">
            <span className="eyebrow">{t("reports.metrics.weak")} {isGlobalMode ? locationLabels.panchayat.toLowerCase() : locationLabels.block.toLowerCase()}s</span>
            <div className="ranked-list weak">
              {weakLocalAreas.length === 0 && <p className="helper-text">{t("reports.location.weakAfterData")}</p>}
              {weakLocalAreas.map(([block, count]) => (
                <div key={block}>
                  <span>{block}</span>
                  <strong>{count.toLocaleString()}</strong>
                  <small>{t("reports.location.needsCoordinator")}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title={t("reports.collection.title")} icon={<RadioTower />}>
        <div className="analytics-progress-grid">
          {[
            [t("reports.collection.online"), onlineCount, t("reports.collection.publicPage")],
            [t("reports.collection.paper"), paperCount, t("reports.collection.scanImport")],
            [t("reports.collection.manual"), manualCount, t("reports.collection.manualEntry")]
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
            <span className="eyebrow">{t("reports.metrics.aiInsights")}</span>
            <strong>{t("reports.status.afterSetup")}</strong>
            {aiInsights.map((insight) => <small key={insight}>{insight}</small>)}
          </div>
        </div>
      </Panel>

      <Panel title={t("reports.analytics.title")} icon={<BarChart3 />}>
        <div className="analytics-command-grid">
          {[
            [t("reports.analytics.nationalOverview"), campaignSigners.length, t("reports.analytics.realRecords")],
            [t("reports.analytics.verifiedSupporters"), verifiedCount, t("reports.analytics.otpApproved")],
            [
              t("reports.analytics.locationCoverage"),
              locationCoverage,
              isGlobalMode
                ? t("reports.analytics.globalBuckets")
                : t("reports.analytics.indiaBuckets")
            ],
            [t("reports.analytics.authorityReadiness"), authorityReady, authorityMatch ? `${authorityMatch.score}% ${t("reports.insights.confidence")}` : t("reports.status.noMatch")],
            [t("reports.analytics.fieldStatus"), campaignSigners.filter((signer) => signer.source === "scan").length, t("reports.analytics.importedScan")],
            [t("reports.analytics.communicationReadiness"), communicationReady, t("reports.analytics.contactAvailable")],
            [t("reports.analytics.volunteerProductivity"), manualCount + paperCount, t("reports.analytics.contributionProxy")],
            [t("reports.metrics.aiInsights"), t("reports.status.afterSetup"), t("reports.analytics.insightsImprove")]
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
            <strong>{t("reports.analytics.exportReady")}</strong>
            <p>{t("reports.analytics.exportReadyHelp")}</p>
          </div>
          <div className="export-ready-card">
            <MapPin size={22} />
            <strong>{t("reports.analytics.distributionInsight")}</strong>
            <p>
              {t("reports.analytics.comparePrefix")}{" "}
              {isGlobalMode
                ? t("reports.analytics.globalCoverage")
                : t("reports.analytics.indiaCoverage")}.
            </p>
          </div>
        </div>
      </Panel>

      <div className="two-column">
        <Panel title={t("reports.trends.supporterGrowth")} icon={<BarChart3 />}>
          <div className="growth-trend-list">
            {Object.entries(dailyTotals).length === 0 && <p className="helper-text">{t("reports.trends.noDaily")}</p>}
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

        <Panel title={`${t("reports.metrics.weak")} ${locationLabels.district} ${t("reports.trends.detection")}`} icon={<MapPin />}>
          <div className="growth-trend-list weak">
            {weakDistricts.length === 0 && <p className="helper-text">{t("reports.location.weakAfterData")}</p>}
            {weakDistricts.map(([district, count]) => (
              <div key={district}>
                <span>{district}</span>
                <strong>{count.toLocaleString()}</strong>
                <small>{t("reports.trends.needsFocusedPush")}</small>
              </div>
            ))}
          </div>
          <span className="eyebrow">{t("reports.common.top")} {locationLabels.district.toLowerCase()}s</span>
          <div className="template-chip-row">
            {topDistricts.map(([district, count]) => <span key={district}>{district}: {count}</span>)}
          </div>
        </Panel>
      </div>

      <Panel title={t("reports.comparison.title")} icon={<Users />}>
        <div className="campaign-comparison-grid">
          {campaignComparison.map(({ campaign, supporters, verified }) => (
            <article className="campaign-comparison-card" key={campaign.id}>
              <span className="eyebrow">{campaign.status}</span>
              <strong>{campaign.title}</strong>
              <small>/{campaign.slug}</small>
              <div className="progress">
                <div style={{ width: `${Math.min(100, (supporters / Math.max(...campaignComparison.map((item) => item.supporters), 1)) * 100)}%` }} />
              </div>
              <p>{supporters.toLocaleString()} {t("reports.common.supporters")} - {verified.toLocaleString()} {t("reports.common.verified")}</p>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title={t("reports.leadership.title")} icon={<RadioTower />}>
        <div className="analytics-command-grid">
          {[
            [t("reports.leadership.authorityTracking"), t("reports.status.afterSetup"), t("reports.leadership.responseHelp")],
            [t("reports.analytics.fieldStatus"), `${approvedScans} ${t("reports.status.approved")} / ${pendingScans} ${t("reports.status.pending")}`, t("reports.leadership.scanData")],
            [t("reports.analytics.communicationReadiness"), communicationReady, t(providerConfigured ? "reports.status.providerConfigured" : "reports.status.setupNeeded")],
            [t("reports.leadership.referralGrowth"), referredSignatures, referralLeaders[0] ? `${t("reports.leadership.topReferrer")}: ${referralLeaders[0].label}` : t("reports.leadership.leaderboardAfterReferrals")],
            [t("reports.leadership.exportable"), t("reports.status.ready"), t("reports.leadership.exportsHelp")],
            [t("reports.metrics.aiInsights"), t("reports.status.afterSetup"), t("reports.analytics.insightsImprove")],
            [t("reports.analytics.volunteerProductivity"), manualCount + paperCount, t("reports.leadership.sourceProxy")]
          ].map(([label, value, detail]) => (
            <div className="analytics-command-card" key={String(label)}>
              <span>{label}</span>
              <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t("reports.exports.title")} icon={<Download />}>
        <div className="report-suite-hero">
          <div>
            <span className="eyebrow">{t("reports.exports.dossier")}</span>
            <h2>{t("reports.exports.premiumPackage")}</h2>
            <p>{t("reports.exports.dataHelp")}</p>
          </div>
          <div className="report-suite-score">
            <strong>{verifiedCount.toLocaleString()}</strong>
            <span>{t("reports.exports.verifiedReady")}</span>
          </div>
        </div>
        <div className="report-theme-panel" aria-label={t("reports.exports.themeAria")}>
          <div>
            <span className="eyebrow">{t("reports.exports.signatureTheme")}</span>
            <h3>{t("reports.exports.choosePresentation")}</h3>
            <p>{t("reports.exports.themeHelp")}</p>
          </div>
          <div className="report-theme-grid" role="radiogroup" aria-label={t("reports.exports.reportTheme")}>
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
                <strong>{t(`reports.themes.${theme.id}.name`)}</strong>
                <small>{t(`reports.themes.${theme.id}.description`)}</small>
              </label>
            ))}
          </div>
        </div>
        <div className="report-export-grid">
          {[
            {
              title: t("reports.exports.dossier"),
              detail: t("reports.exports.dossierDetail"),
              icon: FileCheck2,
              action: downloadPetitionDossier,
              button: t("reports.exports.downloadPdf")
            },
            {
              title: t("reports.exports.supporterRegister"),
              detail: t("reports.exports.registerDetail"),
              icon: Users,
              action: downloadPetitionDossier,
              button: t("reports.exports.downloadRegister")
            },
            {
              title: t("reports.exports.executiveSummary"),
              detail: t("reports.exports.summaryDetail"),
              icon: BookOpen,
              action: downloadPetitionDossier,
              button: t("reports.exports.downloadSummary")
            },
            {
              title: t("reports.exports.rawData"),
              detail: t("reports.exports.rawDetail"),
              icon: Download,
              action: () => exportCsv(activeCampaign, campaignSigners),
              button: t("reports.exports.downloadCsv")
            },
            {
              title: t("reports.exports.printPdf"),
              detail: t("reports.exports.printDetail"),
              icon: Printer,
              action: () => window.print(),
              button: t("reports.exports.printPage")
            },
            {
              title: t("reports.exports.copyCoverLetter"),
              detail: t("reports.exports.copyDetail"),
              icon: ClipboardCopy,
              action: copyCoverLetter,
              button: t("reports.exports.copyLetter")
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
            <FileText size={18} /> {t("reports.exports.downloadDossier")}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => exportCsv(activeCampaign, campaignSigners)}
          >
            <Download size={18} /> {t("reports.exports.downloadCsv")}
          </button>
          <button className="secondary-button" type="button" onClick={copyCoverLetter}>
            <ClipboardCopy size={18} /> {t("reports.exports.copyCoverLetter")}
          </button>
        </div>
        <div className="report-grid">
          <ReportBlock title={t("reports.blocks.daily")} data={dailyTotals} />
          <ReportBlock title={t("reports.blocks.weekly")} data={weeklyTotals} />
          <ReportBlock title={`${locationLabels.state} ${t("reports.common.count")}`} data={stateTotals} />
          <ReportBlock title={`${locationLabels.district} ${t("reports.common.count")}`} data={districtTotals} />
          {!isGlobalMode && <ReportBlock title={`${locationLabels.block} ${t("reports.common.count")}`} data={blockTotals} />}
          <ReportBlock title={`${locationLabels.panchayat} ${t("reports.common.count")}`} data={panchayatTotals} />
        </div>
      </Panel>

      <Panel title={t("reports.register.title")} icon={<Users />}>
        {campaignSigners.length === 0 ? (
          <p>{t("reports.register.empty")}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("reports.register.name")}</th>
                  <th>{t("reports.register.phone")}</th>
                  <th>{t("reports.register.altContacts")}</th>
                  <th>{t("reports.register.otp")}</th>
                  {isGlobalMode && <th>{t("reports.register.country")}</th>}
                  <th>{locationLabels.state}</th>
                  <th>{locationLabels.district}</th>
                  {!isGlobalMode && <th>{locationLabels.block}</th>}
                  <th>{locationLabels.panchayat}</th>
                  <th>{t("reports.register.source")}</th>
                  <th>{t("reports.register.status")}</th>
                  <th>{t("reports.register.signedAt")}</th>
                  <th>{t("reports.register.review")}</th>
                  <th>{t("reports.register.appealPdf")}</th>
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
                    <td>{t(signer.otpVerified ? "reports.status.verified" : "reports.status.notVerified")}</td>
                    {isGlobalMode && <td>{signer.country || t("reports.status.notCaptured")}</td>}
                    <td>{signer.state || t("reports.status.notCaptured")}</td>
                    <td>{signer.district || t("reports.status.notCaptured")}</td>
                    {!isGlobalMode && <td>{signer.block || t("reports.status.notCaptured")}</td>}
                    <td>{signer.panchayat || t("reports.status.notCaptured")}</td>
                    <td>{signer.source}</td>
                    <td>
                      <select
                        value={signer.status}
                        onChange={(e) =>
                          onUpdateSignerStatus(signer.id, e.target.value as Signer["status"])
                        }
                      >
                        <option value="verified">{t("reports.status.verified")}</option>
                        <option value="pending">{t("reports.status.pending")}</option>
                        <option value="duplicate">{t("reports.status.duplicate")}</option>
                        <option value="rejected">{t("reports.status.rejected")}</option>
                      </select>
                    </td>
                    <td>{new Date(signer.signedAt).toLocaleString()}</td>
                    <td>{signer.reviewerNote ?? t("reports.status.ready")}</td>
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
