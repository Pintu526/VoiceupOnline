import type { Language } from "../i18n";

export interface CertificateArtwork {
  url: string;
  storagePath: string;
  sha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
}

export interface CertificateLocalizedWording {
  heading: string;
  intro: string;
  acknowledgement: string;
  campaignLabel: string;
  participationDateLabel: string;
  certificateIdLabel: string;
  issuerLabel: string;
  issuerTitle: string;
  qrHeading: string;
  qrInstructions: string;
  slogan: string;
  footer: string;
}

export type CertificateWording = Record<Language, CertificateLocalizedWording>;

export interface CertificateIssuer {
  name: string;
  title: string;
}

export type CertificateFontFamily = "language-default" | "sans-serif" | "serif";
export type CertificateFontWeight = "regular" | "bold";

export interface CertificateTextPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  align: "left" | "center" | "right";
  fontFamily: CertificateFontFamily;
  fontWeight: CertificateFontWeight;
  color: string;
}

export interface CertificateQrPlacement {
  x: number;
  y: number;
  width: number;
}

export interface CertificatePlacement {
  layoutVersion: number;
  heading: CertificateTextPlacement;
  intro: CertificateTextPlacement;
  name: CertificateTextPlacement;
  acknowledgement: CertificateTextPlacement;
  campaignLabel: CertificateTextPlacement;
  campaign: CertificateTextPlacement;
  date: CertificateTextPlacement;
  certificateId: CertificateTextPlacement;
  issuer: CertificateTextPlacement;
  qrHeading: CertificateTextPlacement;
  qrInstructions: CertificateTextPlacement;
  slogan: CertificateTextPlacement;
  footer: CertificateTextPlacement;
  qr: CertificateQrPlacement;
}

export interface CampaignCertificateSettings {
  workspaceId: string;
  campaignId: string;
  campaignSlug: string;
  certificatesEnabled: boolean;
  artwork: CertificateArtwork | null;
  wording: CertificateWording;
  issuer: CertificateIssuer;
  placement: CertificatePlacement;
  configurationVersion: number;
  updatedAt: string | null;
}

export interface ParticipationCertificate {
  id: string;
  certificateId: string;
  campaignId: string;
  campaignSlug: string;
  campaignName: string;
  supporterDisplayName: string;
  participationDate: string;
  issuedAt: string;
  status: "valid" | "revoked";
  language: Language;
  configurationVersion: number;
  verificationReference: string;
  verificationPath: string;
  artwork: CertificateArtwork;
  wording: CertificateWording;
  issuer: CertificateIssuer;
  placement: CertificatePlacement;
  revokedAt: string | null;
  revocationReason: string | null;
}

export interface PublicCertificateVerification {
  status: "valid" | "revoked" | "not_found";
  certificateId?: string;
  campaignName?: string;
  campaignSlug?: string;
  participationDate?: string;
  issuedAt?: string;
  revokedAt?: string | null;
}

export const DEFAULT_CERTIFICATE_WORDING: CertificateWording = {
  en: {
    heading: "Certificate of Participation",
    intro: "This is to certify that",
    acknowledgement: "has actively participated in and supported this campaign",
    campaignLabel: "Campaign",
    participationDateLabel: "Participation Date",
    certificateIdLabel: "Certificate ID",
    issuerLabel: "Issued by",
    issuerTitle: "Campaign Issuer",
    qrHeading: "Verify & Share",
    qrInstructions: "Scan this QR code to verify the certificate",
    slogan: "Together, every voice creates change",
    footer: "Powered by VoiceUp Campaign Management"
  },
  hi: {
    heading: "सहभागिता प्रमाणपत्र",
    intro: "यह प्रमाणित किया जाता है कि",
    acknowledgement: "ने इस अभियान में सक्रिय रूप से भाग लिया और समर्थन किया",
    campaignLabel: "अभियान",
    participationDateLabel: "सहभागिता दिनांक",
    certificateIdLabel: "प्रमाणपत्र आईडी",
    issuerLabel: "जारीकर्ता",
    issuerTitle: "अभियान जारीकर्ता",
    qrHeading: "सत्यापित करें और साझा करें",
    qrInstructions: "प्रमाणपत्र सत्यापित करने के लिए QR कोड स्कैन करें",
    slogan: "मिलकर, हर आवाज़ बदलाव लाती है",
    footer: "VoiceUp Campaign Management द्वारा संचालित"
  },
  or: {
    heading: "ଅଂଶଗ୍ରହଣ ପ୍ରମାଣପତ୍ର",
    intro: "ଏହା ଦ୍ୱାରା ପ୍ରମାଣିତ କରାଯାଉଛି ଯେ",
    acknowledgement: "ଏହି ଅଭିଯାନରେ ସକ୍ରିୟ ଭାବେ ଅଂଶଗ୍ରହଣ ଏବଂ ସମର୍ଥନ କରିଛନ୍ତି",
    campaignLabel: "ଅଭିଯାନ",
    participationDateLabel: "ଅଂଶଗ୍ରହଣ ତାରିଖ",
    certificateIdLabel: "ପ୍ରମାଣପତ୍ର ଆଇଡି",
    issuerLabel: "ଜାରିକର୍ତ୍ତା",
    issuerTitle: "ଅଭିଯାନ ଜାରିକର୍ତ୍ତା",
    qrHeading: "ଯାଞ୍ଚ ଓ ସେୟାର କରନ୍ତୁ",
    qrInstructions: "ପ୍ରମାଣପତ୍ର ଯାଞ୍ଚ ପାଇଁ QR କୋଡ୍ ସ୍କାନ୍ କରନ୍ତୁ",
    slogan: "ମିଳିତ ଭାବେ, ପ୍ରତ୍ୟେକ ସ୍ୱର ପରିବର୍ତ୍ତନ ଆଣେ",
    footer: "VoiceUp Campaign Management ଦ୍ୱାରା ପରିଚାଳିତ"
  }
};

export const CERTIFICATE_WORDING_FIELDS = [
  "heading",
  "intro",
  "acknowledgement",
  "campaignLabel",
  "participationDateLabel",
  "certificateIdLabel",
  "issuerLabel",
  "issuerTitle",
  "qrHeading",
  "qrInstructions",
  "slogan",
  "footer"
] as const satisfies readonly (keyof CertificateLocalizedWording)[];

export function normalizeCertificateWording(value: unknown, legacyIssuerTitle = ""): CertificateWording {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<Language, unknown>>
    : {};
  return (Object.keys(DEFAULT_CERTIFICATE_WORDING) as Language[]).reduce((result, language) => {
    const localized = source[language] && typeof source[language] === "object" && !Array.isArray(source[language])
      ? source[language] as Partial<Record<keyof CertificateLocalizedWording, unknown>>
      : {};
    result[language] = CERTIFICATE_WORDING_FIELDS.reduce((wording, field) => {
      const candidate = typeof localized[field] === "string" ? localized[field].trim() : "";
      const legacyTitle = field === "issuerTitle"
        && legacyIssuerTitle.trim()
        && legacyIssuerTitle.trim() !== DEFAULT_CERTIFICATE_WORDING.en.issuerTitle
        ? legacyIssuerTitle.trim()
        : "";
      wording[field] = candidate || legacyTitle || DEFAULT_CERTIFICATE_WORDING[language][field];
      return wording;
    }, {} as CertificateLocalizedWording);
    return result;
  }, {} as CertificateWording);
}

export const DEFAULT_CERTIFICATE_PLACEMENT: CertificatePlacement = {
  layoutVersion: 2,
  heading: { x: 50, y: 31.3, width: 48, height: 4.8, fontSize: 32, align: "center", fontFamily: "language-default", fontWeight: "bold", color: "#6f210f" },
  intro: { x: 50, y: 36, width: 46, height: 3, fontSize: 15, align: "center", fontFamily: "language-default", fontWeight: "regular", color: "#4c351c" },
  name: { x: 50, y: 41.5, width: 50, height: 6.8, fontSize: 40, align: "center", fontFamily: "language-default", fontWeight: "bold", color: "#9a1b12" },
  acknowledgement: { x: 50, y: 52.4, width: 50, height: 4.4, fontSize: 16, align: "center", fontFamily: "language-default", fontWeight: "regular", color: "#4c351c" },
  campaignLabel: { x: 50, y: 60.7, width: 36, height: 2.6, fontSize: 12, align: "center", fontFamily: "language-default", fontWeight: "bold", color: "#76511c" },
  campaign: { x: 50, y: 65.1, width: 48, height: 5.6, fontSize: 25, align: "center", fontFamily: "language-default", fontWeight: "bold", color: "#772014" },
  date: { x: 21, y: 75.8, width: 27, height: 3.8, fontSize: 14, align: "left", fontFamily: "language-default", fontWeight: "regular", color: "#34220f" },
  certificateId: { x: 21, y: 80.6, width: 27, height: 3.8, fontSize: 13, align: "left", fontFamily: "language-default", fontWeight: "regular", color: "#34220f" },
  issuer: { x: 21, y: 85.8, width: 27, height: 5.2, fontSize: 12, align: "left", fontFamily: "language-default", fontWeight: "regular", color: "#34220f" },
  qrHeading: { x: 86.7, y: 75.8, width: 16, height: 3.4, fontSize: 12, align: "center", fontFamily: "language-default", fontWeight: "bold", color: "#34220f" },
  qrInstructions: { x: 86.7, y: 82, width: 16.5, height: 6.2, fontSize: 10, align: "center", fontFamily: "language-default", fontWeight: "regular", color: "#34220f" },
  slogan: { x: 50, y: 70.1, width: 48, height: 3.2, fontSize: 13, align: "center", fontFamily: "language-default", fontWeight: "bold", color: "#6f210f" },
  footer: { x: 50, y: 95.1, width: 25, height: 2.6, fontSize: 11, align: "center", fontFamily: "language-default", fontWeight: "bold", color: "#ffffff" },
  qr: { x: 65.3, y: 73.8, width: 10.8 }
};

type LegacyPlacementDefinition = {
  text: Partial<Record<keyof Omit<CertificatePlacement, "layoutVersion" | "qr">, Pick<CertificateTextPlacement, "x" | "y" | "width" | "fontSize" | "align">>>;
  qr: CertificateQrPlacement;
  requiredMissing: readonly (keyof CertificatePlacement)[];
};

const LEGACY_PLACEMENT_DEFINITIONS: readonly LegacyPlacementDefinition[] = [
  {
    text: {
      heading: { x: 50, y: 32.5, width: 42, fontSize: 27, align: "center" },
      name: { x: 50, y: 39.5, width: 43, fontSize: 34, align: "center" },
      acknowledgement: { x: 50, y: 47.5, width: 48, fontSize: 15, align: "center" },
      campaign: { x: 50, y: 55.5, width: 44, fontSize: 25, align: "center" },
      date: { x: 22, y: 78.5, width: 25, fontSize: 14, align: "left" },
      certificateId: { x: 22, y: 83, width: 25, fontSize: 14, align: "left" },
      issuer: { x: 87, y: 82, width: 17, fontSize: 11, align: "left" }
    },
    qr: { x: 68.5, y: 74.5, width: 9 },
    requiredMissing: ["intro", "campaignLabel", "qrHeading", "qrInstructions", "slogan", "footer"]
  },
  {
    text: {
      heading: { x: 50, y: 31.5, width: 44, fontSize: 23, align: "center" },
      intro: { x: 50, y: 35.6, width: 42, fontSize: 10, align: "center" },
      name: { x: 50, y: 40.5, width: 43, fontSize: 27, align: "center" },
      acknowledgement: { x: 50, y: 48.3, width: 46, fontSize: 11, align: "center" },
      campaignLabel: { x: 50, y: 52.1, width: 34, fontSize: 9.5, align: "center" },
      campaign: { x: 50, y: 56.5, width: 44, fontSize: 18, align: "center" },
      date: { x: 21.5, y: 76.4, width: 25, fontSize: 12, align: "left" },
      certificateId: { x: 21.5, y: 81.3, width: 25, fontSize: 12, align: "left" },
      issuer: { x: 21.5, y: 86.6, width: 25, fontSize: 11, align: "left" },
      qrHeading: { x: 87, y: 76.3, width: 16, fontSize: 11, align: "center" },
      qrInstructions: { x: 87, y: 82, width: 16.5, fontSize: 9, align: "center" },
      slogan: { x: 50, y: 64.2, width: 48, fontSize: 11, align: "center" },
      footer: { x: 50, y: 95.1, width: 25, fontSize: 10, align: "center" }
    },
    qr: { x: 68.2, y: 74.7, width: 10 },
    requiredMissing: []
  }
];

function placementNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = Number((value as Record<string, unknown>)[key]);
  return Number.isFinite(candidate) ? candidate : null;
}

function near(actual: number | null, expected: number): boolean {
  return actual !== null && Math.abs(actual - expected) < 0.001;
}

export function isKnownLegacyCertificatePlacement(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const placement = value as Record<string, unknown>;
  if (Number(placement.layoutVersion ?? 0) >= DEFAULT_CERTIFICATE_PLACEMENT.layoutVersion) return false;
  return LEGACY_PLACEMENT_DEFINITIONS.some((definition) => {
    if (definition.requiredMissing.some((key) => placement[key] !== undefined)) return false;
    const textMatches = Object.entries(definition.text).every(([key, expected]) => {
      const actual = placement[key];
      if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
      const record = actual as Record<string, unknown>;
      return near(placementNumber(record, "x"), expected.x)
        && near(placementNumber(record, "y"), expected.y)
        && near(placementNumber(record, "width"), expected.width)
        && near(placementNumber(record, "fontSize"), expected.fontSize)
        && record.align === expected.align;
    });
    return textMatches
      && near(placementNumber(placement.qr, "x"), definition.qr.x)
      && near(placementNumber(placement.qr, "y"), definition.qr.y)
      && near(placementNumber(placement.qr, "width"), definition.qr.width);
  });
}

export const GSAA_CERTIFICATE_ARTWORK: CertificateArtwork = {
  url: "/brands/gau-samman/gau-samman-participation-certificate-dynamic-background.png",
  storagePath: "bundled/gau-samman/gau-samman-participation-certificate-dynamic-background.png",
  sha256: "1f6280d98519a2d2f000d78867c54159e04746e0773c317a6bee4b9fb53e1d83",
  mimeType: "image/png",
  width: 1536,
  height: 1024
};

export const LEGACY_GSAA_CERTIFICATE_ARTWORK: CertificateArtwork = {
  url: "/brands/gau-samman/gau-samman-participation-certificate-master.png",
  storagePath: "bundled/gau-samman/gau-samman-participation-certificate-master.png",
  sha256: "980adc4313c889b2a920c2ef827e409fd69c507b47035a985dd9242f3ae94725",
  mimeType: "image/png",
  width: 1536,
  height: 1024
};

export function resolveCertificateArtwork(
  campaignSlug: string,
  artwork: CertificateArtwork | null,
  applyCampaignDefault = false
): CertificateArtwork | null {
  if (campaignSlug !== "gau-samman-ahvaan-abhiyan") return artwork;
  if (!artwork) return applyCampaignDefault ? GSAA_CERTIFICATE_ARTWORK : null;
  const isLegacyBundledMaster = artwork.url === LEGACY_GSAA_CERTIFICATE_ARTWORK.url
    && artwork.storagePath === LEGACY_GSAA_CERTIFICATE_ARTWORK.storagePath
    && artwork.sha256 === LEGACY_GSAA_CERTIFICATE_ARTWORK.sha256
    && artwork.width === LEGACY_GSAA_CERTIFICATE_ARTWORK.width
    && artwork.height === LEGACY_GSAA_CERTIFICATE_ARTWORK.height;
  return isLegacyBundledMaster ? GSAA_CERTIFICATE_ARTWORK : artwork;
}

export function createDefaultCertificateSettings(input: {
  workspaceId: string;
  campaignId: string;
  campaignSlug: string;
}): CampaignCertificateSettings {
  return {
    ...input,
    certificatesEnabled: false,
    artwork: resolveCertificateArtwork(input.campaignSlug, null, true),
    wording: normalizeCertificateWording(DEFAULT_CERTIFICATE_WORDING),
    issuer: { name: "Campaign Administration", title: "Campaign Issuer" },
    placement: DEFAULT_CERTIFICATE_PLACEMENT,
    configurationVersion: 0,
    updatedAt: null
  };
}
