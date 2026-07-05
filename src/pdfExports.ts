import { jsPDF } from "jspdf";
import type { AuthorityRule, Campaign, Signer } from "./types";
import {
  getCampaignMetrics,
  groupSignersByDay,
  groupSignersByLocation,
  groupSignersByWeek
} from "./lib";

export function exportPdf(campaign: Campaign, signers: Signer[], authority: AuthorityRule | undefined) {
  const metrics = getCampaignMetrics(campaign, signers);
  const daily = groupSignersByDay(signers);
  const weekly = groupSignersByWeek(signers);
  const byState = groupSignersByLocation(signers, "state");
  const byDistrict = groupSignersByLocation(signers, "district");
  const byBlock = groupSignersByLocation(signers, "block");
  const byPanchayat = groupSignersByLocation(signers, "panchayat");
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Campaign Status Report", 14, 20);
  doc.setFontSize(12);
  doc.text(`Campaign: ${campaign.title}`, 14, 32);
  doc.text(`Status: ${campaign.status}`, 14, 40);
  doc.text(`Location: ${[campaign.panchayat, campaign.block, campaign.district, campaign.state].filter(Boolean).join(", ")}`, 14, 48);
  doc.text(`Local detail / PIN: ${campaign.location} ${campaign.postalCode}`, 14, 56);
  doc.text(`Verified signatures: ${metrics.verified} / ${campaign.goal} (${metrics.progress}%)`, 14, 64);
  doc.text(`Online: ${metrics.online} | Scanned: ${metrics.scanned} | Pending review: ${metrics.pending}`, 14, 72);

  if (authority) {
    doc.text(`Suggested authority: ${authority.name}`, 14, 84);
    doc.text(`Department: ${authority.department}`, 14, 92);
    doc.text(`Submission: ${authority.submissionMethod} - ${authority.email}`, 14, 100);
  }

  doc.text("Daily totals", 14, 116);
  let y = 124;
  Object.entries(daily).forEach(([day, count]) => {
    doc.text(`${day}: ${count}`, 18, y);
    y += 8;
  });

  y += 4;
  doc.text("Weekly totals", 14, y);
  y += 8;
  Object.entries(weekly).forEach(([week, count]) => {
    doc.text(`${week}: ${count}`, 18, y);
    y += 8;
  });

  y = writePdfSection(doc, "State totals", byState, y + 8);
  y = writePdfSection(doc, "District totals", byDistrict, y + 8);
  y = writePdfSection(doc, "Block totals", byBlock, y + 8);
  writePdfSection(doc, "Gram Panchayat / Ward totals", byPanchayat, y + 8);

  doc.save(`${campaign.slug}-campaign-report.pdf`);
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

function writePdfSection(doc: jsPDF, title: string, data: Record<string, number>, startY: number) {
  let y = startY;
  if (y > 260) {
    doc.addPage();
    y = 20;
  }
  doc.text(title, 14, y);
  y += 8;
  Object.entries(data).forEach(([label, count]) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(`${label}: ${count}`, 18, y);
    y += 8;
  });
  return y;
}
