import { getSupporterAuthClient } from "../supporterAuth.ts";
import {
  DEFAULT_CERTIFICATE_PLACEMENT,
  GSAA_CERTIFICATE_ARTWORK,
  createDefaultCertificateSettings,
  isKnownLegacyCertificatePlacement,
  normalizeCertificateWording,
  resolveCertificateArtwork,
  type CampaignCertificateSettings,
  type CertificateArtwork,
  type CertificateIssuer,
  type CertificatePlacement,
  type CertificateTextPlacement,
  type CertificateWording,
  type ParticipationCertificate,
  type PublicCertificateVerification
} from "./types.ts";
import type { Language } from "../i18n";

interface CertificateClient {
  functions: {
    invoke<T>(name: string, options: { body: Record<string, unknown> }): Promise<{
      data: T | null;
      error: { message?: string } | null;
    }>;
  };
  storage: {
    from(bucket: string): {
      uploadToSignedUrl(path: string, token: string, file: File, options: {
        contentType: string;
        cacheControl: string;
      }): Promise<{ error: { message?: string } | null }>;
    };
  };
}

export class CertificateApiError extends Error {
  readonly code: string;

  constructor(code: string, message = "Certificate request failed.") {
    super(message);
    this.name = "CertificateApiError";
    this.code = code;
  }
}

function client(): CertificateClient {
  return getSupporterAuthClient() as unknown as CertificateClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, number(value, fallback)));
}

function language(value: unknown): Language {
  return value === "hi" || value === "or" ? value : "en";
}

function validIssuedDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/u.test(value) && !Number.isNaN(Date.parse(value));
}

function parseArtwork(value: unknown): CertificateArtwork | null {
  if (!isRecord(value)) return null;
  const mimeType = text(value.mimeType);
  const artwork: CertificateArtwork = {
    url: text(value.url),
    storagePath: text(value.storagePath),
    sha256: text(value.sha256),
    mimeType: mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png",
    width: number(value.width, 0),
    height: number(value.height, 0)
  };
  return artwork.url && artwork.sha256 && artwork.width > 0 && artwork.height > 0 ? artwork : null;
}

function parseWording(value: unknown, legacyIssuerTitle = ""): CertificateWording {
  return normalizeCertificateWording(value, legacyIssuerTitle);
}

function parseTextPlacement(value: unknown, fallback: CertificateTextPlacement): CertificateTextPlacement {
  const item = isRecord(value) ? value : {};
  const align = item.align === "left" || item.align === "right" ? item.align : "center";
  const width = boundedNumber(item.width, fallback.width, 5, 90);
  const height = boundedNumber(item.height, fallback.height, 1, 30);
  const fontFamily = item.fontFamily === "sans-serif" || item.fontFamily === "serif"
    ? item.fontFamily
    : "language-default";
  const color = typeof item.color === "string" && /^#[0-9a-f]{6}$/iu.test(item.color)
    ? item.color.toLowerCase()
    : fallback.color;
  return {
    x: boundedNumber(item.x, fallback.x, width / 2, 100 - width / 2),
    y: boundedNumber(item.y, fallback.y, height / 2, 100 - height / 2),
    width,
    height,
    fontSize: boundedNumber(item.fontSize, fallback.fontSize, 6, 72),
    align,
    fontFamily,
    fontWeight: item.fontWeight === "bold" ? "bold" : "regular",
    color
  };
}

function parsePlacement(value: unknown, upgradeKnownLegacyLayout = false): CertificatePlacement {
  const item = isRecord(value) ? value : {};
  if (upgradeKnownLegacyLayout && isKnownLegacyCertificatePlacement(item)) {
    return DEFAULT_CERTIFICATE_PLACEMENT;
  }
  const qr = isRecord(item.qr) ? item.qr : {};
  const qrWidth = boundedNumber(qr.width, DEFAULT_CERTIFICATE_PLACEMENT.qr.width, 4, 24);
  return {
    layoutVersion: number(item.layoutVersion, DEFAULT_CERTIFICATE_PLACEMENT.layoutVersion),
    heading: parseTextPlacement(item.heading, DEFAULT_CERTIFICATE_PLACEMENT.heading),
    intro: parseTextPlacement(item.intro, DEFAULT_CERTIFICATE_PLACEMENT.intro),
    name: parseTextPlacement(item.name, DEFAULT_CERTIFICATE_PLACEMENT.name),
    acknowledgement: parseTextPlacement(item.acknowledgement, DEFAULT_CERTIFICATE_PLACEMENT.acknowledgement),
    campaignLabel: parseTextPlacement(item.campaignLabel, DEFAULT_CERTIFICATE_PLACEMENT.campaignLabel),
    campaign: parseTextPlacement(item.campaign, DEFAULT_CERTIFICATE_PLACEMENT.campaign),
    date: parseTextPlacement(item.date, DEFAULT_CERTIFICATE_PLACEMENT.date),
    certificateId: parseTextPlacement(item.certificateId, DEFAULT_CERTIFICATE_PLACEMENT.certificateId),
    issuer: parseTextPlacement(item.issuer, DEFAULT_CERTIFICATE_PLACEMENT.issuer),
    qrHeading: parseTextPlacement(item.qrHeading, DEFAULT_CERTIFICATE_PLACEMENT.qrHeading),
    qrInstructions: parseTextPlacement(item.qrInstructions, DEFAULT_CERTIFICATE_PLACEMENT.qrInstructions),
    slogan: parseTextPlacement(item.slogan, DEFAULT_CERTIFICATE_PLACEMENT.slogan),
    footer: parseTextPlacement(item.footer, DEFAULT_CERTIFICATE_PLACEMENT.footer),
    qr: {
      x: boundedNumber(qr.x, DEFAULT_CERTIFICATE_PLACEMENT.qr.x, 0, 100 - qrWidth),
      y: boundedNumber(qr.y, DEFAULT_CERTIFICATE_PLACEMENT.qr.y, 0, 100 - qrWidth),
      width: qrWidth
    }
  };
}

function parseIssuer(value: unknown): CertificateIssuer {
  const item = isRecord(value) ? value : {};
  return {
    name: text(item.name) || "Campaign Administration",
    title: text(item.title) || "Campaign Issuer"
  };
}

function parseSettings(value: unknown, scope: {
  workspaceId: string;
  campaignId: string;
  campaignSlug: string;
}): CampaignCertificateSettings {
  if (!isRecord(value)) return createDefaultCertificateSettings(scope);
  const configurationVersion = number(value.configurationVersion, 0);
  const campaignSlug = text(value.campaignSlug) || scope.campaignSlug;
  const artwork = resolveCertificateArtwork(campaignSlug, parseArtwork(value.artwork), configurationVersion === 0);
  const issuer = parseIssuer(value.issuer);
  const usesGsaaBundledArtwork = artwork?.sha256 === GSAA_CERTIFICATE_ARTWORK.sha256
    && artwork.storagePath === GSAA_CERTIFICATE_ARTWORK.storagePath;
  return {
    workspaceId: text(value.workspaceId) || scope.workspaceId,
    campaignId: text(value.campaignId) || scope.campaignId,
    campaignSlug,
    certificatesEnabled: value.certificatesEnabled === true,
    artwork,
    wording: parseWording(value.wording, issuer.title),
    issuer,
    placement: parsePlacement(value.placement, usesGsaaBundledArtwork),
    configurationVersion,
    updatedAt: text(value.updatedAt) || null
  };
}

function parseCertificate(value: unknown): ParticipationCertificate | null {
  if (!isRecord(value)) return null;
  const campaignSlug = text(value.campaignSlug);
  const artwork = resolveCertificateArtwork(campaignSlug, parseArtwork(value.artwork));
  const id = text(value.id);
  const certificateId = text(value.certificateId);
  const campaignName = text(value.campaignName).trim();
  const supporterDisplayName = text(value.supporterDisplayName).trim();
  const participationDate = text(value.participationDate);
  const issuedAt = text(value.issuedAt);
  const verificationReference = text(value.verificationReference);
  const verificationPath = text(value.verificationPath);
  if (
    !artwork || !id || !/^VUC-[A-F0-9]{20}$/u.test(certificateId)
    || !campaignSlug || !campaignName || !supporterDisplayName
    || !validIssuedDate(participationDate) || !validIssuedDate(issuedAt)
    || !/^[0-9a-f]{64}$/u.test(verificationReference)
    || verificationPath !== `/certificates/verify/${certificateId}?ref=${verificationReference}`
  ) return null;
  const issuer = parseIssuer(value.issuer);
  return {
    id,
    certificateId,
    campaignId: text(value.campaignId),
    campaignSlug,
    campaignName,
    supporterDisplayName,
    participationDate,
    issuedAt,
    status: value.status === "revoked" ? "revoked" : "valid",
    language: language(value.language),
    configurationVersion: number(value.configurationVersion, 0),
    verificationReference,
    verificationPath,
    artwork,
    wording: parseWording(value.wording, issuer.title),
    issuer,
    placement: parsePlacement(value.placement),
    revokedAt: text(value.revokedAt) || null,
    revocationReason: text(value.revocationReason) || null
  };
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke<T & { error?: string; code?: string }>(
    "voiceup-certificates",
    { body }
  );
  if (error || !data || data.error) {
    throw new CertificateApiError(data?.code ?? "certificate_unavailable", data?.error ?? error?.message);
  }
  return data;
}

export async function readCampaignCertificateSettings(scope: {
  workspaceId: string;
  campaignId: string;
  campaignSlug: string;
}): Promise<CampaignCertificateSettings> {
  const data = await invoke<{ settings: unknown }>({ action: "admin-read", ...scope });
  return parseSettings(data.settings, scope);
}

export async function saveCampaignCertificateSettings(
  settings: CampaignCertificateSettings
): Promise<CampaignCertificateSettings> {
  const normalizedSettings = {
    ...settings,
    wording: normalizeCertificateWording(settings.wording, settings.issuer.title),
    placement: parsePlacement(settings.placement)
  };
  const data = await invoke<{ settings: unknown }>({
    action: "admin-save",
    workspaceId: settings.workspaceId,
    campaignId: settings.campaignId,
    campaignSlug: settings.campaignSlug,
    settings: normalizedSettings
  });
  return parseSettings(data.settings, normalizedSettings);
}

async function fileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadCertificateArtwork(
  scope: { workspaceId: string; campaignId: string; campaignSlug: string },
  file: File
): Promise<CertificateArtwork> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size <= 0 || file.size > 12 * 1024 * 1024) {
    throw new CertificateApiError("invalid_artwork", "Choose a PNG, JPEG or WebP image up to 12 MB.");
  }
  const dimensions = await imageDimensions(file);
  if (dimensions.width < 600 || dimensions.height < 400) {
    throw new CertificateApiError("invalid_artwork", "Certificate artwork must be at least 600 × 400 pixels.");
  }
  const upload = await invoke<{ bucket: string; path: string; token: string; publicUrl: string }>({
    action: "admin-create-upload",
    ...scope,
    fileName: file.name,
    mimeType: file.type,
    size: file.size
  });
  const result = await client().storage.from(upload.bucket).uploadToSignedUrl(
    upload.path,
    upload.token,
    file,
    { contentType: file.type, cacheControl: "31536000" }
  );
  if (result.error) throw new CertificateApiError("upload_failed", result.error.message);
  return {
    url: upload.publicUrl,
    storagePath: upload.path,
    sha256: await fileSha256(file),
    mimeType: file.type as CertificateArtwork["mimeType"],
    ...dimensions
  };
}

export async function issueOwnedCertificate(accountId: string, selectedLanguage: Language) {
  const data = await invoke<{ certificate: unknown }>({
    action: "issue",
    accountId,
    language: selectedLanguage
  });
  const certificate = parseCertificate(data.certificate);
  if (!certificate) throw new CertificateApiError("certificate_invalid_response");
  return certificate;
}

export async function listOwnedCertificates(): Promise<ParticipationCertificate[]> {
  const data = await invoke<{ certificates: unknown }>({ action: "list" });
  return Array.isArray(data.certificates)
    ? data.certificates.map(parseCertificate).filter((item): item is ParticipationCertificate => Boolean(item))
    : [];
}

export async function verifyPublicCertificate(
  certificateId: string,
  verificationReference: string
): Promise<PublicCertificateVerification> {
  const data = await invoke<PublicCertificateVerification>({
    action: "verify",
    certificateId,
    verificationReference
  });
  return data.status === "valid" || data.status === "revoked" ? data : { status: "not_found" };
}

export function certificateVerificationUrl(certificate: ParticipationCertificate): string {
  return new URL(certificate.verificationPath, window.location.origin).toString();
}
