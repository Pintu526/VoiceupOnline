import type { AuthorityRule, Campaign, ScanReviewItem, Signer } from "./types";

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function getCampaignSigners(campaignId: string, signers: Signer[]) {
  return signers.filter((signer) => signer.campaignId === campaignId);
}

export function getValidSignedAt(signer: Pick<Signer, "signedAt">): string | null {
  if (typeof signer.signedAt !== "string") return null;
  const signedAt = signer.signedAt.trim();
  return signedAt && !Number.isNaN(new Date(signedAt).getTime()) ? signedAt : null;
}

export function getCampaignMetrics(campaign: Campaign, signers: Signer[]) {
  const campaignSigners = getCampaignSigners(campaign.id, signers);
  const verified = campaignSigners.filter((signer) => signer.status === "verified").length;
  const pending = campaignSigners.filter((signer) => signer.status === "pending").length;
  const duplicates = campaignSigners.filter((signer) => signer.status === "duplicate").length;
  const online = campaignSigners.filter((signer) => signer.source === "online").length;
  const scanned = campaignSigners.filter((signer) => signer.source === "scan").length;
  const target = campaign.maxSignersAllowed > 0 ? campaign.maxSignersAllowed : campaign.goal;
  const progress = target > 0 ? Math.min(Math.round((verified / target) * 100), 100) : 0;

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
    const signedAt = getValidSignedAt(signer);
    if (!signedAt) return accumulator;
    const day = signedAt.slice(0, 10);
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
  level: "country" | "state" | "district" | "block" | "panchayat"
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
    selectedAuthorityId: "",
    selectedAuthorityName: "",
    country: valueFor(["country", "nation"]),
    state: valueFor(["state"]),
    district: valueFor(["district", "city"]),
    block: valueFor(["block", "taluk", "tehsil", "county", "area"]),
    panchayat: valueFor(["panchayat", "gram panchayat", "ward", "village", "locality"]),
    address: valueFor(["address", "location", "village"]),
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
  const isGlobalMode =
    campaign.geographyMode === "global" ||
    Boolean(campaign.country && campaign.country.trim().toLowerCase() !== "india");
  const labels = isGlobalMode
    ? {
        state: "State / Province / Region",
        district: "City / District",
        block: "Area / County",
        panchayat: "Locality / Ward",
        postalCode: "Postal / ZIP Code"
      }
    : {
        state: "State",
        district: "District",
        block: "Block",
        panchayat: "Gram Panchayat / Ward",
        postalCode: "PIN Code"
      };
  const rows = [
    [
      "Campaign",
      "Name",
      "Email",
      "Phone",
      "WhatsApp",
      "Telegram",
      "OTP Verified",
      "Selected Authority",
      ...(isGlobalMode ? ["Country"] : []),
      labels.state,
      labels.district,
      labels.block,
      labels.panchayat,
      "Address",
      labels.postalCode,
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
      signer.selectedAuthorityName,
      ...(isGlobalMode ? [signer.country ?? ""] : []),
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
    | "selectedAuthorityId"
    | "selectedAuthorityName"
    | "country"
    | "state"
    | "district"
    | "block"
    | "panchayat"
    | "address"
    | "postalCode"
    | "comment"
  > &
    Partial<Pick<Signer, "referralCode" | "referredBy" | "referredByPhoneOrCode" | "referralSource">>,
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

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

function escapeCsvValue(value: string | number | undefined) {
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
