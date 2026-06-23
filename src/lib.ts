import { jsPDF } from "jspdf";
import type { AuthorityRule, Campaign, ScanReviewItem, Signer } from "./types";

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function getCampaignSigners(campaignId: string, signers: Signer[]) {
  return signers.filter((signer) => signer.campaignId === campaignId);
}

export function getCampaignMetrics(campaign: Campaign, signers: Signer[]) {
  const campaignSigners = getCampaignSigners(campaign.id, signers);
  const verified = campaignSigners.filter((signer) => signer.status === "verified").length;
  const pending = campaignSigners.filter((signer) => signer.status === "pending").length;
  const duplicates = campaignSigners.filter((signer) => signer.status === "duplicate").length;
  const online = campaignSigners.filter((signer) => signer.source === "online").length;
  const scanned = campaignSigners.filter((signer) => signer.source === "scan").length;
  const progress = Math.min(Math.round((verified / campaign.goal) * 100), 100);

  return {
    total: campaignSigners.length,
    verified,
    pending,
    duplicates,
    online,
    scanned,
    progress
  };
}

export function groupSignersByDay(signers: Signer[]) {
  return signers.reduce<Record<string, number>>((accumulator, signer) => {
    const day = signer.signedAt.slice(0, 10);
    accumulator[day] = (accumulator[day] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function groupSignersByWeek(signers: Signer[]) {
  return signers.reduce<Record<string, number>>((accumulator, signer) => {
    const date = new Date(signer.signedAt);
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDays = Math.floor((date.getTime() - firstDayOfYear.getTime()) / 86400000);
    const week = Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
    const key = `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function groupSignersByLocation(
  signers: Signer[],
  level: "state" | "district" | "block" | "panchayat"
) {
  return signers.reduce<Record<string, number>>((accumulator, signer) => {
    const label = signer[level]?.trim() || "Not captured";
    accumulator[label] = (accumulator[label] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function detectDuplicate(candidate: Pick<Signer, "email" | "phone" | "name">, signers: Signer[]) {
  const email = candidate.email.trim().toLowerCase();
  const phone = normalizePhone(candidate.phone);
  const name = candidate.name.trim().toLowerCase();

  return signers.find((signer) => {
    const signerEmail = signer.email.trim().toLowerCase();
    const signerPhone = normalizePhone(signer.phone);
    const signerName = signer.name.trim().toLowerCase();

    return Boolean(
      (email && signerEmail === email) ||
        (phone && signerPhone === phone) ||
        (name && signerName === name && candidate.phone && signerPhone === phone)
    );
  });
}

export function matchAuthority(campaign: Campaign, authorities: AuthorityRule[]) {
  const normalizedLocation = [
    campaign.location,
    campaign.panchayat,
    campaign.block,
    campaign.district,
    campaign.state
  ]
    .join(" ")
    .toLowerCase();
  const matches = authorities
    .map((authority) => {
      let score = authority.confidence;
      if (authority.category === campaign.category) score += 15;
      if (authority.category === "Any") score += 5;
      if (authority.locationKeyword && normalizedLocation.includes(authority.locationKeyword.toLowerCase())) {
        score += 12;
      }
      if (authority.postalPrefix && campaign.postalCode.startsWith(authority.postalPrefix)) {
        score += 10;
      }
      return { authority, score: Math.min(score, 100) };
    })
    .sort((first, second) => second.score - first.score);

  return matches[0];
}

export function parseSignerFromText(text: string) {
  const valueFor = (labels: string[]) => {
    for (const label of labels) {
      const expression = new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, "i");
      const match = text.match(expression);
      if (match?.[1]) {
        return match[1].split(/\n|\r/)[0].trim();
      }
    }
    return "";
  };

  return {
    name: valueFor(["name", "full name", "signer"]),
    email: valueFor(["email", "e-mail"]),
    phone: valueFor(["phone", "mobile", "contact"]),
    whatsappNumber: valueFor(["whatsapp", "whatsapp number"]),
    telegramHandle: valueFor(["telegram", "telegram handle"]),
    otpVerified: false,
    state: valueFor(["state"]),
    district: valueFor(["district"]),
    block: valueFor(["block", "taluk", "tehsil"]),
    panchayat: valueFor(["panchayat", "gram panchayat", "ward", "village"]),
    address: valueFor(["address", "location"]),
    postalCode: valueFor(["postal code", "postcode", "pin", "zip"]),
    comment: valueFor(["comment", "message", "reason"]) || "Imported from scanned hard copy."
  };
}

export function createScanReviewItem(
  campaignId: string,
  fileName: string,
  extractedText: string
): ScanReviewItem {
  return {
    id: createId("scan"),
    campaignId,
    fileName,
    extractedText,
    parsedSigner: parseSignerFromText(extractedText),
    status: "Needs review",
    createdAt: new Date().toISOString()
  };
}

export function exportCsv(campaign: Campaign, signers: Signer[]) {
  const rows = [
    [
      "Campaign",
      "Name",
      "Email",
      "Phone",
      "WhatsApp",
      "Telegram",
      "OTP Verified",
      "State",
      "District",
      "Block",
      "Gram Panchayat / Ward",
      "Address",
      "PIN Code",
      "Source",
      "Status",
      "Signed At",
      "Comment"
    ],
    ...signers.map((signer) => [
      campaign.title,
      signer.name,
      signer.email,
      signer.phone,
      signer.whatsappNumber,
      signer.telegramHandle,
      signer.otpVerified ? "Yes" : "No",
      signer.state,
      signer.district,
      signer.block,
      signer.panchayat,
      signer.address,
      signer.postalCode,
      signer.source,
      signer.status,
      signer.signedAt,
      signer.comment
    ])
  ];

  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  downloadBlob(`${campaign.slug}-signers.csv`, csv, "text/csv;charset=utf-8");
}

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
  doc.text(`Location: ${[signer.panchayat, signer.block, signer.district, signer.state].filter(Boolean).join(", ")}`, 14, 84);
  doc.text(`PIN: ${signer.postalCode}`, 14, 92);

  doc.text("To", 14, 108);
  doc.text(authorityName, 14, 116);
  if (authorityPosition) doc.text(authorityPosition, 14, 124);
  doc.text(authorityAddress, 14, authorityPosition ? 132 : 124);

  doc.text("Appeal / Cause", 14, 148);
  const appealLines = doc.splitTextToSize(campaign.appealContent || campaign.description, 180);
  doc.text(appealLines, 14, 158);

  doc.text(`Signed at: ${new Date(signer.signedAt).toLocaleString()}`, 14, 260);
  doc.save(`${campaign.slug}-${signer.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-appeal.pdf`);
}

export function makePublicSigner(
  campaignId: string,
  values: Pick<
    Signer,
    | "name"
    | "email"
    | "phone"
    | "whatsappNumber"
    | "telegramHandle"
    | "otpVerified"
    | "state"
    | "district"
    | "block"
    | "panchayat"
    | "address"
    | "postalCode"
    | "comment"
  >,
  signers: Signer[]
): Signer {
  const duplicate = detectDuplicate(values, signers);
  return {
    id: createId("sig"),
    campaignId,
    ...values,
    source: "online",
    status: duplicate ? "duplicate" : "verified",
    signedAt: new Date().toISOString(),
    reviewerNote: duplicate ? `Possible duplicate of ${duplicate.name}` : undefined
  };
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

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

function escapeCsvValue(value: string | number) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function downloadBlob(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
