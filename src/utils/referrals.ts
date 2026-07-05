import type { Campaign, Organization, Signer } from "../types";
import { getCampaignPublicUrl } from "./campaign";

export const REFERRAL_SHARE_POINTS = 1;
export const REFERRAL_SIGNATURE_POINTS = 10;

export interface ReferralLeader {
  code: string;
  label: string;
  location: string;
  referredSignatures: number;
  points: number;
}

export function normalizeReferralCode(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

export function createReferralCode(campaignId: string, seed: string): string {
  const normalizedSeed = `${campaignId}:${seed}`.trim() || `${campaignId}:supporter`;
  let hash = 0;
  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash = (hash * 31 + normalizedSeed.charCodeAt(index)) >>> 0;
  }
  return `VU-${hash.toString(36).toUpperCase().padStart(6, "0").slice(0, 6)}`;
}

export function getSupporterReferralCode(signer: Signer): string {
  return normalizeReferralCode(
    signer.referralCode || createReferralCode(signer.campaignId, signer.phone || signer.email || signer.name || signer.id)
  );
}

export function getCampaignReferralUrl(
  organization: Organization | undefined,
  campaign: Pick<Campaign, "slug">,
  referralCode?: string
): string {
  const publicUrl = getCampaignPublicUrl(organization, campaign);
  const normalizedReferral = normalizeReferralCode(referralCode);
  return normalizedReferral ? `${publicUrl}?ref=${encodeURIComponent(normalizedReferral)}` : publicUrl;
}

export function maskPhone(phone: string | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 6) return digits ? "******" : "";
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
}

export function getSafeReferrerLabel(signer: Signer | undefined): string {
  if (!signer) return "";
  const maskedPhone = maskPhone(signer.phone);
  const firstName = signer.name.trim().split(/\s+/)[0];
  if (firstName && maskedPhone) return `${firstName} (${maskedPhone})`;
  return firstName || maskedPhone || "a supporter";
}

export function findReferrer(
  campaignSigners: Signer[],
  campaignId: string,
  referralInput: string | undefined
): Signer | undefined {
  const normalizedInput = normalizeReferralCode(referralInput);
  const phoneInput = (referralInput ?? "").replace(/\D/g, "");
  if (!normalizedInput && !phoneInput) return undefined;

  return campaignSigners.find((signer) => {
    if (signer.campaignId !== campaignId) return false;
    const signerCode = getSupporterReferralCode(signer);
    const signerPhone = signer.phone.replace(/\D/g, "");
    return (
      signerCode === normalizedInput ||
      Boolean(phoneInput && signerPhone && signerPhone === phoneInput) ||
      normalizeReferralCode(signer.name) === normalizedInput
    );
  });
}

export function getReferralLeaderboard(campaignSigners: Signer[]): ReferralLeader[] {
  const counts = campaignSigners.reduce<Record<string, number>>((accumulator, signer) => {
    const referredBy = normalizeReferralCode(signer.referredBy || signer.referredByPhoneOrCode);
    if (!referredBy) return accumulator;
    accumulator[referredBy] = (accumulator[referredBy] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([code, referredSignatures]) => {
      const referrer = campaignSigners.find((signer) => getSupporterReferralCode(signer) === code);
      return {
        code,
        label: referrer ? getSafeReferrerLabel(referrer) : code,
        location: referrer
          ? [referrer.panchayat, referrer.block, referrer.district, referrer.state].filter(Boolean).join(", ") ||
            "Location not captured"
          : "Manual or external referral",
        referredSignatures,
        points: referredSignatures * REFERRAL_SIGNATURE_POINTS
      };
    })
    .sort((left, right) => right.points - left.points);
}

export function getReferralBadge(points: number): string {
  if (points >= 100) return "Movement Ambassador";
  if (points >= 70) return "District Champion";
  if (points >= 40) return "Top Referrer";
  if (points >= 15) return "Community Promoter";
  return "Campaign Starter";
}

export function getProfessionalShareMessages(campaign: Campaign, referralUrl: string) {
  const summary = campaign.description || campaign.appealContent || "A public campaign that needs your support.";
  return {
    whatsapp: `Join me in supporting this campaign: ${campaign.title}
Together, our voices can create change.
Sign here: ${referralUrl}`,
    emailSubject: `Support this public campaign: ${campaign.title}`,
    emailBody: `Dear friend,
I have supported this campaign and invite you to add your voice.
Campaign: ${campaign.title}
Purpose: ${summary}
Sign here: ${referralUrl}
Thank you.`,
    social: `Add your voice to ${campaign.title}. Sign and share: ${referralUrl}`,
    instagramCaption: `Add your voice to ${campaign.title}. Scan the QR poster or use the link in my message: ${referralUrl}`
  };
}

export function createQrCells(value: string, size = 17): boolean[] {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const cells: boolean[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const finder =
        isFinderCell(row, column, 0, 0) ||
        isFinderCell(row, column, 0, size - 7) ||
        isFinderCell(row, column, size - 7, 0);
      const valueBit = ((hash >>> ((row + column) % 24)) + row * 7 + column * 13) % 5 < 2;
      cells.push(finder || valueBit);
    }
  }
  return cells;
}

export function downloadQrPosterSvg(options: {
  campaign: Campaign;
  organizationName: string;
  url: string;
  referralCode?: string;
}) {
  const svg = buildPosterSvg(options);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${options.campaign.slug || "campaign"}-qr-poster.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildPosterSvg({
  campaign,
  organizationName,
  url,
  referralCode
}: {
  campaign: Campaign;
  organizationName: string;
  url: string;
  referralCode?: string;
}) {
  const cells = createQrCells(url, 17);
  const cellSize = 14;
  const qrOffsetX = 81;
  const qrOffsetY = 292;
  const cellRects = cells
    .map((active, index) => {
      if (!active) return "";
      const row = Math.floor(index / 17);
      const column = index % 17;
      return `<rect x="${qrOffsetX + column * cellSize}" y="${qrOffsetY + row * cellSize}" width="10" height="10" rx="1" fill="#071f4e"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="620" viewBox="0 0 400 620">
  <rect width="400" height="620" fill="#f8fafc"/>
  <rect x="24" y="24" width="352" height="572" rx="24" fill="#ffffff" stroke="#d7dce6"/>
  <text x="48" y="76" font-family="Inter, Arial" font-size="13" font-weight="700" fill="#0f7a3b">${escapeSvg(organizationName || "Voiceup")}</text>
  <text x="48" y="122" font-family="Inter, Arial" font-size="28" font-weight="800" fill="#071f4e">${escapeSvg(campaign.title).slice(0, 42)}</text>
  <text x="48" y="156" font-family="Inter, Arial" font-size="14" fill="#475569">${escapeSvg(campaign.description).slice(0, 94)}</text>
  <rect x="62" y="274" width="276" height="276" rx="20" fill="#eef3ff"/>
  ${cellRects}
  <text x="200" y="236" text-anchor="middle" font-family="Inter, Arial" font-size="22" font-weight="800" fill="#123a8c">Scan to sign</text>
  <text x="200" y="566" text-anchor="middle" font-family="Inter, Arial" font-size="12" fill="#475569">${escapeSvg(url).slice(0, 58)}</text>
  <text x="48" y="584" font-family="Inter, Arial" font-size="11" fill="#667085">${escapeSvg(campaign.category)}${referralCode ? ` - Referral ${escapeSvg(referralCode)}` : ""}</text>
  <text x="352" y="584" text-anchor="end" font-family="Inter, Arial" font-size="11" font-weight="800" fill="#123a8c">Voiceup</text>
</svg>`;
}

function isFinderCell(row: number, column: number, startRow: number, startColumn: number): boolean {
  const within = row >= startRow && row < startRow + 7 && column >= startColumn && column < startColumn + 7;
  if (!within) return false;
  const localRow = row - startRow;
  const localColumn = column - startColumn;
  return (
    localRow === 0 ||
    localRow === 6 ||
    localColumn === 0 ||
    localColumn === 6 ||
    (localRow >= 2 && localRow <= 4 && localColumn >= 2 && localColumn <= 4)
  );
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
