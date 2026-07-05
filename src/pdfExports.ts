import { jsPDF } from "jspdf";
import type { AuthorityRule, Campaign, IntegrationSettings, Organization, Signer } from "./types";
import {
  getCampaignMetrics,
  groupSignersByDay,
  groupSignersByLocation,
  groupSignersByWeek
} from "./lib";
import {
  getCampaignAdminUrl,
  getCampaignGoalValue,
  getCampaignPublicUrl,
  getLocationGovernance,
  getLocationRestrictionMessage
} from "./utils/campaign";

interface PetitionReportOptions {
  organization?: Organization;
  integrations?: IntegrationSettings;
}

interface ReportContext {
  campaign: Campaign;
  signers: Signer[];
  authority?: AuthorityRule;
  organization?: Organization;
  integrations?: IntegrationSettings;
  reportId: string;
  generatedAt: Date;
  publicUrl: string;
  adminUrl: string;
  metrics: ReturnType<typeof getCampaignMetrics>;
  dailyTotals: Record<string, number>;
  weeklyTotals: Record<string, number>;
  stateTotals: Record<string, number>;
  districtTotals: Record<string, number>;
  blockTotals: Record<string, number>;
  panchayatTotals: Record<string, number>;
  villageTotals: Record<string, number>;
  healthScore: number;
  communicationReadyCount: number;
  fieldReadyCount: number;
}

type TableColumn<T> = {
  label: string;
  width: number;
  value: (item: T, index: number) => string;
};

const PAGE_MARGIN = 14;
const BRAND_BLUE = "#173EA5";
const BRAND_INK = "#0F172A";
const BRAND_MUTED = "#64748B";
const BRAND_LINE = "#D8E0F0";
const BRAND_SOFT = "#EEF4FF";
const BRAND_GREEN = "#0E7554";

export function exportPdf(
  campaign: Campaign,
  signers: Signer[],
  authority: AuthorityRule | undefined,
  options: PetitionReportOptions = {}
) {
  const context = createReportContext(campaign, signers, authority, options);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  drawCoverPage(doc, context);
  addPortraitPage(doc, context);
  drawExecutiveSummary(doc, context);
  addPortraitPage(doc, context);
  drawCampaignDetails(doc, context);
  addPortraitPage(doc, context);
  drawStatisticsDashboard(doc, context);
  addPortraitPage(doc, context);
  drawLocationSummary(doc, context);
  drawSupporterRegister(doc, context);
  addPortraitPage(doc, context);
  drawAuthorityPackage(doc, context);
  addPortraitPage(doc, context);
  drawCoverLetterPage(doc, context);
  addPortraitPage(doc, context);
  drawCertificatePage(doc, context);
  addPortraitPage(doc, context);
  drawAnnexures(doc, context);

  addFootersAndWatermarks(doc, context);
  doc.save(`${safeFileName(campaign.slug || campaign.title)}-petition-dossier.pdf`);
}

export function exportSignerAppealPdf(campaign: Campaign, signer: Signer, authority: AuthorityRule | undefined) {
  const doc = new jsPDF();
  const authorityName = authority?.name ?? "Selected authority";
  const authorityPosition = authority?.position || authority?.department || "";
  const authorityAddress = authority?.address || "Address not configured";

  doc.setFontSize(18);
  doc.text("Individual Campaign Appeal", 14, 20);
  doc.setFontSize(12);
  doc.text(`Campaign: ${campaign.title}`, 14, 34);
  doc.text(`Signer: ${signer.name}`, 14, 44);
  doc.text(`Phone: ${signer.phone}`, 14, 52);
  doc.text(`WhatsApp: ${signer.whatsappNumber || signer.phone || "Not provided"}`, 14, 60);
  doc.text(`Telegram: ${signer.telegramHandle || "Not provided"}`, 14, 68);
  doc.text(`OTP verified: ${signer.otpVerified ? "Yes" : "No"}`, 14, 76);
  doc.text(`Selected authority: ${signer.selectedAuthorityName || authorityName}`, 14, 84);
  doc.text(`Location: ${[signer.panchayat, signer.block, signer.district, signer.state].filter(Boolean).join(", ")}`, 14, 92);
  doc.text(`PIN: ${signer.postalCode}`, 14, 100);

  doc.text("To", 14, 116);
  doc.text(authorityName, 14, 124);
  if (authorityPosition) doc.text(authorityPosition, 14, 132);
  doc.text(authorityAddress, 14, authorityPosition ? 140 : 132);

  doc.text("Appeal / Cause", 14, 148);
  const appealLines = doc.splitTextToSize(campaign.appealContent || campaign.description, 180);
  doc.text(appealLines, 14, 158);

  doc.text(`Signed at: ${new Date(signer.signedAt).toLocaleString()}`, 14, 260);
  doc.save(`${campaign.slug}-${signer.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-appeal.pdf`);
}

export function buildCoverLetterText(
  campaign: Campaign,
  signers: Signer[],
  authority: AuthorityRule | undefined,
  options: PetitionReportOptions = {}
) {
  const context = createReportContext(campaign, signers, authority, options);
  return getCoverLetterText(context);
}

function createReportContext(
  campaign: Campaign,
  signers: Signer[],
  authority: AuthorityRule | undefined,
  options: PetitionReportOptions
): ReportContext {
  const metrics = getCampaignMetrics(campaign, signers);
  const dailyTotals = groupSignersByDay(signers);
  const weeklyTotals = groupSignersByWeek(signers);
  const stateTotals = groupSignersByLocation(signers, "state");
  const districtTotals = groupSignersByLocation(signers, "district");
  const blockTotals = groupSignersByLocation(signers, "block");
  const panchayatTotals = groupSignersByLocation(signers, "panchayat");
  const villageTotals = groupBy(signers, () => "Not available");
  const generatedAt = new Date();
  const reportId = `VUP-${campaign.id.slice(-6).toUpperCase()}-${generatedAt.getTime().toString(36).toUpperCase()}`;
  const publicUrl = getCampaignPublicUrl(options.organization, campaign);
  const adminUrl = getCampaignAdminUrl(options.organization, campaign);
  const communicationReadyCount = signers.filter((signer) => signer.phone || signer.email).length;
  const fieldReadyCount = signers.filter((signer) => signer.source === "scan" || signer.source === "field").length;

  return {
    campaign,
    signers,
    authority,
    organization: options.organization,
    integrations: options.integrations,
    reportId,
    generatedAt,
    publicUrl,
    adminUrl,
    metrics,
    dailyTotals,
    weeklyTotals,
    stateTotals,
    districtTotals,
    blockTotals,
    panchayatTotals,
    villageTotals,
    healthScore: getHealthScore(campaign, signers, authority, metrics),
    communicationReadyCount,
    fieldReadyCount
  };
}

function drawCoverPage(doc: jsPDF, context: ReportContext) {
  const { campaign, metrics } = context;
  drawBrandHeader(doc, "Authority-ready Petition Dossier", "Generated by Voiceup.live");
  drawBanner(doc, campaign, 14, 34, 182, 42);

  doc.setTextColor(BRAND_INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(25);
  writeWrappedText(doc, campaign.title, 14, 92, 176, 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(BRAND_MUTED);
  writeWrappedText(doc, campaign.description || "Not configured", 14, 111, 176, 6);

  drawPill(doc, campaign.status, 14, 132, 28);
  drawPill(doc, campaign.category || "Not configured", 46, 132, 42);
  drawPill(doc, `/${campaign.slug || "not-configured"}`, 92, 132, 76);

  drawMetricRow(doc, 14, 150, [
    ["Total supporters", metrics.total.toLocaleString()],
    ["Verified", metrics.verified.toLocaleString()],
    ["Pending", metrics.pending.toLocaleString()],
    ["Health score", `${context.healthScore}/100`]
  ]);

  drawKeyValueBlock(doc, 14, 190, 88, [
    ["Organization", context.organization?.name || "Not configured"],
    ["Organization logo", "Not configured"],
    ["Prepared date", formatDateTime(context.generatedAt)],
    ["Report version", "Voiceup Petition Dossier v1.0"]
  ]);

  drawKeyValueBlock(doc, 108, 190, 88, [
    ["Selected authority", context.authority?.name || "Not configured"],
    ["Authority department", context.authority?.department || "Not configured"],
    ["Public campaign URL", context.publicUrl],
    ["Report ID", context.reportId]
  ]);

  drawQrBlock(doc, 148, 34, 44, context.publicUrl, "Public campaign QR");
}

function drawExecutiveSummary(doc: jsPDF, context: ReportContext) {
  const { campaign, metrics } = context;
  drawPageTitle(doc, "Executive Summary", "One-page overview for authority, media, and leadership review.");

  const summaryItems: Array<[string, string]> = [
    ["Campaign purpose", campaign.description || "Not configured"],
    ["Problem statement", findSectionText(campaign.appealContent, "Problem statement") || campaign.description || "Not configured"],
    ["Objectives", findSectionText(campaign.appealContent, "Objectives") || "Not configured"],
    ["Current progress", `${metrics.verified.toLocaleString()} verified supporters toward ${getCampaignGoalValue(campaign).toLocaleString()} target (${metrics.progress}%).`],
    ["Supporter summary", `${metrics.total.toLocaleString()} total records; ${metrics.pending.toLocaleString()} pending; ${metrics.duplicates.toLocaleString()} duplicate/review records.`],
    ["Location coverage", `${Object.keys(context.stateTotals).length} state(s), ${Object.keys(context.districtTotals).length} district(s), ${Object.keys(context.blockTotals).length} block(s), ${Object.keys(context.panchayatTotals).length} panchayat/ward bucket(s).`],
    ["Authority routing status", context.authority ? `${context.authority.name}, ${context.authority.position || context.authority.department}` : "Not configured"],
    ["Communication readiness", getCommunicationReadiness(context)],
    ["Volunteer/field readiness", `${context.fieldReadyCount.toLocaleString()} paper/scanned/manual supporter record(s).`],
    ["Generated timestamp", formatDateTime(context.generatedAt)]
  ];

  writeSummaryCards(doc, summaryItems, 20);
}

function drawCampaignDetails(doc: jsPDF, context: ReportContext) {
  const { campaign } = context;
  drawPageTitle(doc, "Campaign Details", "Source campaign content, public links, governance, and signing configuration.");

  let y = 30;
  y = writeSectionText(doc, "Description", campaign.description || "Not configured", y);
  y = writeSectionText(doc, "Appeal content", campaign.appealContent || "Not configured", y + 4);
  y = writeSectionText(doc, "Expected outcome", findSectionText(campaign.appealContent, "Expected outcome") || "Not configured", y + 4);

  drawKeyValueBlock(doc, 14, y + 6, 88, [
    ["Tags", findSectionText(campaign.appealContent, "Suggested tags") || "Not configured"],
    ["Required supporter fields", campaign.requiredFields?.join(", ") || "Not configured"],
    ["Timeline", `${safe(campaign.startDate)} to ${safe(campaign.endDate)}`],
    ["Location restriction", getLocationRestrictionMessage(campaign, context.organization) || "Not configured"]
  ]);
  drawKeyValueBlock(doc, 108, y + 6, 88, [
    ["Public URL", context.publicUrl],
    ["Campaign admin URL", context.adminUrl],
    ["Location governance", getGovernanceLabel(context.organization)],
    ["QR label", campaign.qrLabel || "Not configured"]
  ]);
  drawQrBlock(doc, 150, y + 72, 40, context.publicUrl, "QR preview");
}

function drawStatisticsDashboard(doc: jsPDF, context: ReportContext) {
  const { metrics } = context;
  drawPageTitle(doc, "Statistics Dashboard", "Infographic-style readout from existing supporter, scan, authority, and communication data.");

  const rejected = context.signers.filter((signer) => signer.status === "rejected").length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayGrowth = context.dailyTotals[todayKey] ?? 0;
  const manual = context.signers.filter((signer) => signer.source === "field").length;

  drawMetricGrid(doc, 14, 30, [
    ["Total supporters", metrics.total],
    ["Verified", metrics.verified],
    ["Pending", metrics.pending],
    ["Rejected", rejected],
    ["Online signatures", metrics.online],
    ["Paper/scanned/manual", metrics.scanned + manual],
    ["Today's growth", todayGrowth],
    ["Health score", context.healthScore]
  ]);

  const topLocations = topEntries(context.districtTotals, 5);
  const weakLocations = weakEntries(context.districtTotals, context.signers.length, 5);

  drawRankedList(doc, "Top locations", topLocations, 14, 118, 82, metrics.total);
  drawRankedList(doc, "Weak locations", weakLocations, 108, 118, 82, metrics.total);

  drawKeyValueBlock(doc, 14, 210, 182, [
    ["Authority readiness", context.authority ? "Ready" : "Not configured"],
    ["Communication readiness", getCommunicationReadiness(context)],
    ["Campaign health score", `${context.healthScore}/100`],
    ["Field readiness", `${context.fieldReadyCount.toLocaleString()} paper/scanned/manual supporter record(s)`]
  ]);
}

function drawLocationSummary(doc: jsPDF, context: ReportContext) {
  drawPageTitle(doc, "Location Summary", "Grouped participation by available geography fields.");
  let y = 30;
  y = writeLocationTable(doc, "State", context.stateTotals, context.metrics.total, y);
  y = writeLocationTable(doc, "District", context.districtTotals, context.metrics.total, y + 8);
  y = writeLocationTable(doc, "Block", context.blockTotals, context.metrics.total, y + 8);
  y = writeLocationTable(doc, "Panchayat / Ward", context.panchayatTotals, context.metrics.total, y + 8);
  writeLocationTable(doc, "Village", context.villageTotals, context.metrics.total, y + 8);
}

function drawSupporterRegister(doc: jsPDF, context: ReportContext) {
  doc.addPage("a4", "landscape");
  drawPageTitle(doc, "Supporter Register", "Formal printable support register from existing supporter records.");

  const columns: TableColumn<Signer>[] = [
    { label: "S.No", width: 8, value: (_signer, index) => String(index + 1) },
    { label: "Name", width: 22, value: (signer) => safe(signer.name) },
    { label: "Phone", width: 18, value: (signer) => safe(signer.phone) },
    { label: "Email", width: 24, value: (signer) => safe(signer.email) },
    { label: "State", width: 15, value: (signer) => safe(signer.state) },
    { label: "District", width: 17, value: (signer) => safe(signer.district) },
    { label: "Block", width: 17, value: (signer) => safe(signer.block) },
    { label: "Panchayat/Ward", width: 21, value: (signer) => safe(signer.panchayat) },
    { label: "Village", width: 15, value: () => "Not available" },
    { label: "Occupation", width: 17, value: () => "Not available" },
    { label: "Date", width: 17, value: (signer) => formatDate(signer.signedAt) },
    { label: "Status", width: 14, value: (signer) => signer.status },
    { label: "Source", width: 14, value: (signer) => signer.source },
    { label: "Volunteer/Source", width: 18, value: (signer) => signer.scanFileName || signer.source },
    { label: "Notes", width: 20, value: (signer) => signer.reviewerNote || "Not available" }
  ];

  drawWideTable(doc, context.signers, columns, 30);
}

function drawAuthorityPackage(doc: jsPDF, context: ReportContext) {
  const { authority, campaign, metrics } = context;
  drawPageTitle(doc, "Authority Package", "Submission-ready authority context and checklist.");

  drawKeyValueBlock(doc, 14, 30, 182, [
    ["Authority name", authority?.name || "Not configured"],
    ["Designation", authority?.position || "Not configured"],
    ["Department", authority?.department || "Not configured"],
    ["Office/location", authority?.address || authority?.district || "Not configured"],
    ["Email", authority?.email || "Not configured"],
    ["Phone", authority?.phone || "Not configured"],
    ["Campaign summary", campaign.description || "Not configured"],
    ["Total supporters", metrics.total.toLocaleString()],
    ["Verified supporters", metrics.verified.toLocaleString()]
  ]);

  writeChecklist(doc, 14, 145, [
    "Campaign cover letter attached",
    "Executive summary attached",
    "Supporter register attached",
    "Location summary attached",
    "Consent and privacy notes attached",
    "Authority response/follow-up method recorded"
  ]);

  doc.setDrawColor(BRAND_LINE);
  doc.roundedRect(118, 150, 74, 38, 3, 3);
  doc.setTextColor(BRAND_MUTED);
  doc.setFontSize(9);
  doc.text("Official seal / receiving signature", 123, 166);
  doc.line(123, 178, 184, 178);
  doc.text("Date and acknowledgement", 123, 184);
}

function drawCoverLetterPage(doc: jsPDF, context: ReportContext) {
  drawPageTitle(doc, "Auto Cover Letter", "Editable and printable neutral submission letter.");
  const lines = doc.splitTextToSize(getCoverLetterText(context), 178);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(BRAND_INK);
  doc.text(lines, 16, 34, { lineHeightFactor: 1.45 });
}

function drawCertificatePage(doc: jsPDF, context: ReportContext) {
  drawBrandHeader(doc, "Certified Campaign Support Report", "Generated by Voiceup.live");
  doc.setDrawColor(BRAND_BLUE);
  doc.setLineWidth(1);
  doc.roundedRect(20, 42, 170, 180, 4, 4);
  doc.setDrawColor(BRAND_LINE);
  doc.roundedRect(26, 48, 158, 168, 4, 4);

  doc.setTextColor(BRAND_BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("Certified Campaign", 105, 80, { align: "center" });
  doc.text("Support Report", 105, 91, { align: "center" });

  doc.setTextColor(BRAND_INK);
  doc.setFontSize(16);
  doc.text(context.campaign.title, 105, 116, { align: "center", maxWidth: 130 });

  drawMetricRow(doc, 34, 140, [
    ["Verified supporters", context.metrics.verified.toLocaleString()],
    ["Generated", formatDate(context.generatedAt.toISOString())],
    ["Report ID", context.reportId],
    ["Verification", context.publicUrl]
  ]);

  drawQrBlock(doc, 82, 178, 46, context.publicUrl, "QR verification link");
}

function drawAnnexures(doc: jsPDF, context: ReportContext) {
  drawPageTitle(doc, "Attachments and Annexures", "Notes included to avoid overstating provider-ready workflows.");
  const annexures = [
    ["Consent statement", context.campaign.consentText || "Not configured"],
    ["Privacy statement", "Supporter details in this report should be used only for campaign submission, verification, and lawful follow-up by the campaign owner."],
    ["Verification method", "Verified means the supporter record is marked verified in Voiceup or carries existing OTP verification data. Provider delivery is not implied."],
    ["Field collection note", context.fieldReadyCount > 0 ? `${context.fieldReadyCount.toLocaleString()} record(s) came from paper/scanned/manual collection sources.` : "No paper/scanned/manual supporter records are available for this report."],
    ["Communication readiness note", getCommunicationReadiness(context)],
    ["Report generation metadata", `Report ID ${context.reportId}; generated ${formatDateTime(context.generatedAt)}; campaign slug /${context.campaign.slug || "not-configured"}.`],
    ["Provider-ready disclaimer", "Provider-ready integrations are not proof of delivery unless a configured provider has actually sent the message, email, call, payment request, or authority submission."]
  ];

  let y = 30;
  annexures.forEach(([title, text]) => {
    y = writeSectionText(doc, title, text, y);
    y += 4;
  });
}

function getCoverLetterText(context: ReportContext) {
  const authorityName = context.authority?.name || "Selected Authority";
  const authorityDesignation = context.authority?.position || context.authority?.department || "Authority";
  const requestedAction =
    findSectionText(context.campaign.appealContent, "Expected outcome") ||
    context.campaign.appealContent ||
    context.campaign.description ||
    "Requested action is described in the attached campaign dossier.";

  return [
    `To: ${authorityName}`,
    authorityDesignation,
    context.authority?.address || "Office address: Not configured",
    "",
    `Subject: Submission of citizen petition for ${context.campaign.title}`,
    "",
    `Respected ${authorityDesignation},`,
    "",
    `On behalf of ${context.organization?.name || "the campaign organization"}, we submit this citizen petition regarding ${context.campaign.title}.`,
    "",
    context.campaign.description || "Campaign summary is not configured.",
    "",
    `As of ${formatDateTime(context.generatedAt)}, this campaign has collected ${context.metrics.total.toLocaleString()} supporter record(s), including ${context.metrics.verified.toLocaleString()} verified supporter record(s).`,
    "",
    `Requested action: ${requestedAction}`,
    "",
    "Attachments:",
    "1. Authority-ready petition dossier",
    "2. Executive summary",
    "3. Location summary",
    "4. Supporter register",
    "5. Consent, privacy, and verification notes",
    "",
    "We request your kind review and appropriate action as per applicable law, public policy, and departmental process.",
    "",
    "Respectfully submitted,",
    context.organization?.name || "Campaign owner",
    "Generated by Voiceup.live"
  ].join("\n");
}

function drawBrandHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(BRAND_BLUE);
  doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor("#FFFFFF");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Voiceup.live", 14, 10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, 14, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, 196, 14, { align: "right" });
}

function drawPageTitle(doc: jsPDF, title: string, subtitle: string) {
  doc.setTextColor(BRAND_INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(BRAND_MUTED);
  doc.text(subtitle, 14, 25);
}

function drawBanner(doc: jsPDF, campaign: Campaign, x: number, y: number, width: number, height: number) {
  doc.setFillColor(BRAND_SOFT);
  doc.roundedRect(x, y, width, height, 4, 4, "F");
  doc.setDrawColor(BRAND_LINE);
  doc.roundedRect(x, y, width, height, 4, 4);

  if (campaign.heroImage && campaign.heroImage.startsWith("data:image/")) {
    try {
      doc.addImage(campaign.heroImage, "JPEG", x, y, width, height);
      return;
    } catch {
      // Fall through to configured fallback.
    }
  }

  doc.setTextColor(BRAND_MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(campaign.heroImage ? "Campaign banner configured" : "Campaign banner not configured", x + 8, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(campaign.heroImage ? "Image URL stored in campaign media." : "Upload a banner to include campaign media.", x + 8, y + 27);
}

function drawPill(doc: jsPDF, label: string, x: number, y: number, width: number) {
  doc.setFillColor(BRAND_SOFT);
  doc.setDrawColor(BRAND_LINE);
  doc.roundedRect(x, y, width, 8, 4, 4, "FD");
  doc.setTextColor(BRAND_BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(clip(label, 26), x + 4, y + 5.5);
}

function drawMetricRow(doc: jsPDF, x: number, y: number, metrics: Array<[string, string]>) {
  const width = 42;
  metrics.forEach(([label, value], index) => {
    const left = x + index * 46;
    doc.setFillColor("#FFFFFF");
    doc.setDrawColor(BRAND_LINE);
    doc.roundedRect(left, y, width, 25, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND_INK);
    doc.setFontSize(13);
    doc.text(clip(value, 16), left + 4, y + 10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND_MUTED);
    doc.setFontSize(7.5);
    doc.text(clip(label, 24), left + 4, y + 18);
  });
}

function drawMetricGrid(doc: jsPDF, x: number, y: number, metrics: Array<[string, number | string]>) {
  metrics.forEach(([label, value], index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const left = x + col * 46;
    const top = y + row * 34;
    doc.setFillColor(index % 2 === 0 ? BRAND_SOFT : "#FFFFFF");
    doc.setDrawColor(BRAND_LINE);
    doc.roundedRect(left, top, 42, 26, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(BRAND_INK);
    doc.setFontSize(14);
    doc.text(typeof value === "number" ? value.toLocaleString() : value, left + 4, top + 10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND_MUTED);
    doc.setFontSize(7.5);
    doc.text(clip(label, 24), left + 4, top + 18);
  });
}

function drawKeyValueBlock(doc: jsPDF, x: number, y: number, width: number, rows: Array<[string, string]>) {
  const rowHeight = 12;
  doc.setDrawColor(BRAND_LINE);
  doc.roundedRect(x, y, width, rows.length * rowHeight + 5, 3, 3);
  rows.forEach(([label, value], index) => {
    const top = y + 5 + index * rowHeight;
    if (index > 0) {
      doc.setDrawColor(BRAND_LINE);
      doc.line(x, top - 3, x + width, top - 3);
    }
    doc.setTextColor(BRAND_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label, x + 4, top);
    doc.setTextColor(BRAND_INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(value || "Not configured", width - 8).slice(0, 2), x + 4, top + 5);
  });
}

function drawQrBlock(doc: jsPDF, x: number, y: number, size: number, url: string, label: string) {
  doc.setFillColor("#FFFFFF");
  doc.setDrawColor(BRAND_LINE);
  doc.roundedRect(x, y, size, size, 3, 3, "FD");
  const qrMatrix = createQrMatrix(url);
  if (qrMatrix) {
    drawQrMatrix(doc, x + 4, y + 4, size - 8, qrMatrix);
  } else {
    drawDeterministicMatrix(doc, x + 4, y + 4, size - 8, url);
  }
  doc.setTextColor(BRAND_MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(label, x, y + size + 6);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(url, size + 18).slice(0, 2), x, y + size + 11);
}

function drawQrMatrix(doc: jsPDF, x: number, y: number, size: number, matrix: boolean[][]) {
  const cell = size / matrix.length;
  doc.setFillColor(BRAND_INK);
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, colIndex) => {
      if (dark) doc.rect(x + colIndex * cell, y + rowIndex * cell, cell * 1.02, cell * 1.02, "F");
    });
  });
}

function drawDeterministicMatrix(doc: jsPDF, x: number, y: number, size: number, seed: string) {
  const cells = 21;
  const cell = size / cells;
  const hash = hashString(seed);
  doc.setFillColor(BRAND_INK);
  drawFinder(doc, x, y, cell);
  drawFinder(doc, x + cell * 14, y, cell);
  drawFinder(doc, x, y + cell * 14, cell);
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      if (isFinderArea(row, col)) continue;
      const value = (hash + row * 31 + col * 17 + row * col * 7) % 11;
      if (value === 0 || value === 2 || value === 5 || value === 7) {
        doc.rect(x + col * cell, y + row * cell, cell * 0.85, cell * 0.85, "F");
      }
    }
  }
}

function drawFinder(doc: jsPDF, x: number, y: number, cell: number) {
  doc.rect(x, y, cell * 7, cell * 7, "F");
  doc.setFillColor("#FFFFFF");
  doc.rect(x + cell, y + cell, cell * 5, cell * 5, "F");
  doc.setFillColor(BRAND_INK);
  doc.rect(x + cell * 2, y + cell * 2, cell * 3, cell * 3, "F");
}

function isFinderArea(row: number, col: number) {
  return (
    (row < 8 && col < 8) ||
    (row < 8 && col > 12) ||
    (row > 12 && col < 8)
  );
}

function createQrMatrix(value: string) {
  const version = 5;
  const size = 21 + (version - 1) * 4;
  const dataCodewords = 108;
  const errorCodewords = 26;
  const bytes = Array.from(value).map((char) => char.charCodeAt(0) & 0xff);
  if (bytes.length > 106) return null;

  const dataBits: number[] = [];
  appendBits(dataBits, 0b0100, 4);
  appendBits(dataBits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(dataBits, byte, 8));
  const capacityBits = dataCodewords * 8;
  appendBits(dataBits, 0, Math.min(4, capacityBits - dataBits.length));
  while (dataBits.length % 8 !== 0) dataBits.push(0);
  const data: number[] = [];
  for (let index = 0; index < dataBits.length; index += 8) {
    data.push(bitsToByte(dataBits.slice(index, index + 8)));
  }
  for (let pad = 0; data.length < dataCodewords; pad += 1) {
    data.push(pad % 2 === 0 ? 0xec : 0x11);
  }

  const error = reedSolomonRemainder(data, errorCodewords);
  const codewords = [...data, ...error];
  const modules = makeMatrix(size, false);
  const reserved = makeMatrix(size, false);

  drawQrFunctionPatterns(modules, reserved, version);
  drawFormatBits(modules, reserved, 0);
  placeQrData(modules, reserved, codewords, 0);
  return modules;
}

function appendBits(bits: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
}

function bitsToByte(bits: number[]) {
  return bits.reduce((value, bit) => (value << 1) | bit, 0);
}

function makeMatrix(size: number, value: boolean) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => value));
}

function setQrFunctionModule(modules: boolean[][], reserved: boolean[][], x: number, y: number, dark: boolean) {
  if (y < 0 || y >= modules.length || x < 0 || x >= modules.length) return;
  modules[y][x] = dark;
  reserved[y][x] = true;
}

function drawQrFunctionPatterns(modules: boolean[][], reserved: boolean[][], version: number) {
  const size = modules.length;
  drawQrFinder(modules, reserved, 3, 3);
  drawQrFinder(modules, reserved, size - 4, 3);
  drawQrFinder(modules, reserved, 3, size - 4);

  for (let index = 0; index < size; index += 1) {
    setQrFunctionModule(modules, reserved, 6, index, index % 2 === 0);
    setQrFunctionModule(modules, reserved, index, 6, index % 2 === 0);
  }

  drawQrAlignment(modules, reserved, size - 7, size - 7);
  setQrFunctionModule(modules, reserved, 8, 4 * version + 9, true);

  for (let index = 0; index < 9; index += 1) {
    setQrFunctionModule(modules, reserved, 8, index, false);
    setQrFunctionModule(modules, reserved, index, 8, false);
    setQrFunctionModule(modules, reserved, size - 1 - index, 8, false);
    setQrFunctionModule(modules, reserved, 8, size - 1 - index, false);
  }
}

function drawQrFinder(modules: boolean[][], reserved: boolean[][], centerX: number, centerY: number) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      const dark = distance !== 2 && distance !== 4;
      setQrFunctionModule(modules, reserved, centerX + dx, centerY + dy, dark);
    }
  }
}

function drawQrAlignment(modules: boolean[][], reserved: boolean[][], centerX: number, centerY: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      setQrFunctionModule(modules, reserved, centerX + dx, centerY + dy, dark);
    }
  }
}

function drawFormatBits(modules: boolean[][], reserved: boolean[][], mask: number) {
  const size = modules.length;
  const errorCorrectionBits = 1;
  const data = (errorCorrectionBits << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const getBit = (index: number) => ((bits >>> index) & 1) !== 0;

  for (let index = 0; index <= 5; index += 1) setQrFunctionModule(modules, reserved, 8, index, getBit(index));
  setQrFunctionModule(modules, reserved, 8, 7, getBit(6));
  setQrFunctionModule(modules, reserved, 8, 8, getBit(7));
  setQrFunctionModule(modules, reserved, 7, 8, getBit(8));
  for (let index = 9; index < 15; index += 1) setQrFunctionModule(modules, reserved, 14 - index, 8, getBit(index));
  for (let index = 0; index < 8; index += 1) setQrFunctionModule(modules, reserved, size - 1 - index, 8, getBit(index));
  for (let index = 8; index < 15; index += 1) setQrFunctionModule(modules, reserved, 8, size - 15 + index, getBit(index));
  setQrFunctionModule(modules, reserved, 8, size - 8, true);
}

function placeQrData(modules: boolean[][], reserved: boolean[][], codewords: number[], mask: number) {
  const size = modules.length;
  const bits = codewords.flatMap((codeword) => {
    const next: number[] = [];
    appendBits(next, codeword, 8);
    return next;
  });
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) continue;
        let dark = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        bitIndex += 1;
        if (getMaskBit(mask, x, y)) dark = !dark;
        modules[y][x] = dark;
      }
    }
    upward = !upward;
  }
}

function getMaskBit(mask: number, x: number, y: number) {
  if (mask === 0) return (x + y) % 2 === 0;
  return false;
}

function reedSolomonRemainder(data: number[], degree: number) {
  const divisor = reedSolomonDivisor(degree);
  const result = Array.from({ length: degree }, () => 0);
  data.forEach((byte) => {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[degree - 1] = 0;
    divisor.forEach((coefficient, index) => {
      result[index] ^= gfMultiply(coefficient, factor);
    });
  });
  return result;
}

function reedSolomonDivisor(degree: number) {
  const result = Array.from({ length: degree }, () => 0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let coefficient = 0; coefficient < degree; coefficient += 1) {
      result[coefficient] = gfMultiply(result[coefficient], root);
      if (coefficient + 1 < degree) result[coefficient] ^= result[coefficient + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function gfMultiply(first: number, second: number) {
  let x = first;
  let y = second;
  let result = 0;
  while (y !== 0) {
    if (y & 1) result ^= x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
    y >>>= 1;
  }
  return result;
}

function writeSummaryCards(doc: jsPDF, rows: Array<[string, string]>, startY: number) {
  let y = startY + 10;
  rows.forEach(([title, body]) => {
    if (y > 254) {
      doc.addPage();
      drawPageTitle(doc, "Executive Summary", "Continued.");
      y = 30;
    }
    doc.setFillColor("#FFFFFF");
    doc.setDrawColor(BRAND_LINE);
    doc.roundedRect(14, y, 182, 18, 3, 3, "FD");
    doc.setTextColor(BRAND_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(title, 18, y + 6);
    doc.setTextColor(BRAND_INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(body, 130).slice(0, 2), 62, y + 6);
    y += 22;
  });
}

function writeSectionText(doc: jsPDF, title: string, text: string, startY: number) {
  let y = startY;
  if (y > 245) {
    doc.addPage();
    drawPageTitle(doc, title, "Continued.");
    y = 30;
  }
  doc.setTextColor(BRAND_BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, 14, y);
  doc.setTextColor(BRAND_INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(text || "Not configured", 182);
  doc.text(lines, 14, y + 7, { lineHeightFactor: 1.35 });
  return y + 9 + lines.length * 4.5;
}

function writeWrappedText(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight: number) {
  const lines = doc.splitTextToSize(text || "Not configured", width);
  doc.text(lines, x, y, { lineHeightFactor: lineHeight / 5 });
}

function writeLocationTable(
  doc: jsPDF,
  title: string,
  data: Record<string, number>,
  total: number,
  startY: number
) {
  let y = startY;
  if (y > 242) {
    doc.addPage();
    drawPageTitle(doc, "Location Summary", "Continued.");
    y = 30;
  }

  doc.setTextColor(BRAND_BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`${title} summary`, 14, y);
  y += 6;

  const rows = topEntries(data, 12);
  if (rows.length === 0) rows.push(["Not available", 0]);

  drawSimpleTable(doc, y, ["Location", "Count", "Share"], rows.map(([label, count]) => [
    label,
    count.toLocaleString(),
    total > 0 ? `${Math.round((count / total) * 100)}%` : "0%"
  ]));
  return y + 10 + rows.length * 8;
}

function drawSimpleTable(doc: jsPDF, y: number, headers: string[], rows: string[][]) {
  const widths = [112, 30, 30];
  let x = 14;
  doc.setFillColor(BRAND_BLUE);
  doc.setTextColor("#FFFFFF");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  headers.forEach((header, index) => {
    doc.rect(x, y, widths[index], 7, "F");
    doc.text(header, x + 3, y + 4.8);
    x += widths[index];
  });

  rows.forEach((row, rowIndex) => {
    x = 14;
    const top = y + 7 + rowIndex * 7;
    doc.setFillColor(rowIndex % 2 === 0 ? "#FFFFFF" : BRAND_SOFT);
    doc.setTextColor(BRAND_INK);
    doc.setFont("helvetica", "normal");
    row.forEach((cell, index) => {
      doc.rect(x, top, widths[index], 7, "F");
      doc.text(clip(cell, index === 0 ? 70 : 12), x + 3, top + 4.8);
      x += widths[index];
    });
  });
}

function drawWideTable<T>(doc: jsPDF, rows: T[], columns: TableColumn<T>[], startY: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY;
  const left = 8;
  const rowHeight = 8;

  const drawHeader = () => {
    let x = left;
    doc.setFillColor(BRAND_BLUE);
    doc.setTextColor("#FFFFFF");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    columns.forEach((column) => {
      doc.rect(x, y, column.width, 7, "F");
      doc.text(clip(column.label, Math.max(6, column.width / 1.5)), x + 1.5, y + 4.8);
      x += column.width;
    });
    y += 7;
  };

  if (rows.length === 0) {
    doc.setTextColor(BRAND_MUTED);
    doc.setFontSize(10);
    doc.text("No supporter records are available for this campaign.", left, y);
    return;
  }

  drawHeader();
  rows.forEach((row, rowIndex) => {
    if (y > pageHeight - 18) {
      doc.addPage("a4", "landscape");
      drawPageTitle(doc, "Supporter Register", "Continued.");
      y = 30;
      drawHeader();
    }
    let x = left;
    doc.setFillColor(rowIndex % 2 === 0 ? "#FFFFFF" : BRAND_SOFT);
    doc.setTextColor(BRAND_INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    columns.forEach((column) => {
      doc.rect(x, y, column.width, rowHeight, "F");
      doc.text(clip(column.value(row, rowIndex), Math.max(6, column.width / 1.2)), x + 1.5, y + 5);
      x += column.width;
    });
    y += rowHeight;
  });
}

function drawRankedList(
  doc: jsPDF,
  title: string,
  rows: Array<[string, number]>,
  x: number,
  y: number,
  width: number,
  total: number
) {
  doc.setTextColor(BRAND_BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, x, y);
  let top = y + 8;
  const listRows = rows.length ? rows : [["Not available", 0] as [string, number]];
  listRows.forEach(([label, count]) => {
    doc.setTextColor(BRAND_INK);
    doc.setFontSize(8);
    doc.text(clip(label, 36), x, top);
    doc.text(count.toLocaleString(), x + width - 16, top, { align: "right" });
    doc.setFillColor(BRAND_SOFT);
    doc.rect(x, top + 2, width, 3, "F");
    doc.setFillColor(BRAND_GREEN);
    doc.rect(x, top + 2, total > 0 ? Math.min(width, (count / total) * width) : 0, 3, "F");
    top += 12;
  });
}

function writeChecklist(doc: jsPDF, x: number, y: number, items: string[]) {
  doc.setTextColor(BRAND_BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Submission checklist", x, y);
  let top = y + 10;
  items.forEach((item) => {
    doc.setDrawColor(BRAND_LINE);
    doc.rect(x, top - 4, 4, 4);
    doc.setTextColor(BRAND_INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(item, x + 8, top);
    top += 9;
  });
}

function addPortraitPage(doc: jsPDF, _context: ReportContext) {
  doc.addPage("a4", "portrait");
}

function addFootersAndWatermarks(doc: jsPDF, context: ReportContext) {
  const totalPages = doc.getNumberOfPages();
  const watermark = getWatermark(context.campaign);

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    doc.setTextColor("#E2E8F0");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(width > height ? 44 : 52);
    doc.text(watermark, width / 2, height / 2, { align: "center", angle: -28 });

    doc.setDrawColor(BRAND_LINE);
    doc.line(PAGE_MARGIN, height - 13, width - PAGE_MARGIN, height - 13);
    doc.setTextColor(BRAND_MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`Generated by Voiceup.live | Report ID ${context.reportId}`, PAGE_MARGIN, height - 8);
    doc.text(`Prepared On ${formatDateTime(context.generatedAt)} | Page ${page} of ${totalPages}`, width - PAGE_MARGIN, height - 8, {
      align: "right"
    });
  }
}

function getWatermark(campaign: Campaign) {
  if (campaign.status === "Published") return "FINAL";
  if (campaign.status === "Closed" || campaign.status === "Paused") return "CONFIDENTIAL";
  return "DRAFT";
}

function getHealthScore(
  campaign: Campaign,
  signers: Signer[],
  authority: AuthorityRule | undefined,
  metrics: ReturnType<typeof getCampaignMetrics>
) {
  const locationReady = Boolean(campaign.state || campaign.district || campaign.block || campaign.panchayat);
  const score =
    (campaign.title.trim().length >= 12 ? 12 : 0) +
    (campaign.description.trim().length >= 80 ? 14 : 0) +
    (campaign.appealContent.trim().length >= 120 ? 14 : 0) +
    (campaign.heroImage ? 10 : 0) +
    (authority ? 14 : 0) +
    (locationReady ? 10 : 0) +
    (getCampaignGoalValue(campaign) > 0 ? 8 : 0) +
    (campaign.requiredFields?.length ? 6 : 0) +
    (metrics.verified > 0 ? 8 : 0) +
    (signers.some((signer) => signer.source === "scan" || signer.source === "field") ? 4 : 0);
  return Math.min(100, score);
}

function getCommunicationReadiness(context: ReportContext) {
  const providers = [
    context.integrations?.whatsappProvider,
    context.integrations?.smsProvider,
    context.integrations?.emailProvider
  ].filter((provider) => provider && provider !== "Not configured");
  const providerStatus = providers.length ? `${providers.join(", ")} configured` : "Provider-ready only";
  return `${context.communicationReadyCount.toLocaleString()} supporter record(s) have phone or email. ${providerStatus}; no delivery is proven by this report.`;
}

function getGovernanceLabel(organization?: Organization) {
  if (!organization) return "Not configured";
  const governance = getLocationGovernance(organization);
  const parts = [governance.panchayat, governance.block, governance.district, governance.state].filter(Boolean);
  return `${governance.lockLevel || "none"}${parts.length ? ` - ${parts.join(", ")}` : ""}`;
}

function findSectionText(text: string, label: string) {
  if (!text) return "";
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedLabel}:\\s*([\\s\\S]*?)(?:\\n\\n[A-Z][A-Za-z /]+:|$)`, "i");
  return text.match(pattern)?.[1]?.trim() ?? "";
}

function topEntries(data: Record<string, number>, limit: number) {
  return Object.entries(data)
    .sort((first, second) => second[1] - first[1])
    .slice(0, limit);
}

function weakEntries(data: Record<string, number>, total: number, limit: number) {
  return Object.entries(data)
    .filter(([, count]) => count <= Math.max(1, Math.floor(total * 0.08)))
    .sort((first, second) => first[1] - second[1])
    .slice(0, limit);
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((accumulator, item) => {
    const key = getKey(item).trim() || "Not available";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

function safe(value: string | number | undefined | null) {
  const text = String(value ?? "").trim();
  return text || "Not available";
}

function clip(value: string | number, maxLength: number) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}.`;
}

function safeFileName(value: string) {
  return (value || "campaign-report").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function formatDate(value: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatDateTime(value: Date) {
  return value.toLocaleString();
}

function hashString(value: string) {
  return value.split("").reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0;
  }, 2166136261);
}
