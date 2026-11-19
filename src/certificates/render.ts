import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { Language } from "../i18n";
import { GSAA_CERTIFICATE_ARTWORK_EXCLUSIONS, resolveCollisionSafeCertificatePlacement } from "./layout";
import { GSAA_CERTIFICATE_ARTWORK, type CertificateTextPlacement, type ParticipationCertificate } from "./types";

type CertificateTextRole =
  | "heading"
  | "intro"
  | "name"
  | "acknowledgement"
  | "campaignLabel"
  | "campaign"
  | "date"
  | "certificateId"
  | "issuer"
  | "qrHeading"
  | "qrInstructions"
  | "slogan"
  | "footer";

const FONT_FAMILIES: Record<Language, string> = {
  en: "VoiceUp Noto Sans",
  hi: "VoiceUp Noto Devanagari",
  or: "VoiceUp Noto Oriya"
};

export const CERTIFICATE_TEXT_LINE_LIMITS: Record<CertificateTextRole, number> = {
  heading: 2,
  intro: 2,
  name: 2,
  acknowledgement: 2,
  campaignLabel: 1,
  campaign: 2,
  date: 2,
  certificateId: 2,
  issuer: 3,
  qrHeading: 2,
  qrInstructions: 3,
  slogan: 2,
  footer: 2
};

export const CERTIFICATE_TEXT_REGION_HEIGHTS: Record<CertificateTextRole, number> = {
  heading: 4,
  intro: 2.8,
  name: 5.5,
  acknowledgement: 4,
  campaignLabel: 2.2,
  campaign: 5,
  date: 4,
  certificateId: 4,
  issuer: 5,
  qrHeading: 3.5,
  qrInstructions: 6,
  slogan: 3.5,
  footer: 3
};

export const CERTIFICATE_MIN_READABLE_FONT_SIZES: Record<CertificateTextRole, number> = {
  heading: 18,
  intro: 10,
  name: 22,
  acknowledgement: 11,
  campaignLabel: 9,
  campaign: 14,
  date: 10,
  certificateId: 9,
  issuer: 8,
  qrHeading: 9,
  qrInstructions: 7,
  slogan: 9,
  footer: 7
};

let fontPromise: Promise<void> | null = null;

async function ensureFonts() {
  if (!fontPromise) {
    fontPromise = Promise.all([
      new FontFace("VoiceUp Noto Sans", "url(/fonts/NotoSans.ttf)").load(),
      new FontFace("VoiceUp Noto Devanagari", "url(/fonts/NotoSansDevanagari.ttf)").load(),
      new FontFace("VoiceUp Noto Oriya", "url(/fonts/NotoSansOriya.ttf)").load()
    ]).then((fonts) => { fonts.forEach((font) => document.fonts.add(font)); });
  }
  await fontPromise;
}

async function loadImage(url: string) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error("certificate_artwork_unavailable");
  const objectUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return image;
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawTextBlock(
  context: CanvasRenderingContext2D,
  value: string,
  item: CertificateTextPlacement,
  role: CertificateTextRole,
  canvas: HTMLCanvasElement,
  artworkWidth: number,
  languageFamily: string
) {
  const boxLeft = canvas.width * (item.x - item.width / 2) / 100;
  const boxRight = canvas.width * (item.x + item.width / 2) / 100;
  const maxWidth = boxRight - boxLeft;
  const centerY = canvas.height * item.y / 100;
  const scale = canvas.width / artworkWidth;
  const initialFontSize = item.fontSize * scale;
  const minimumFontSize = Math.min(initialFontSize, CERTIFICATE_MIN_READABLE_FONT_SIZES[role] * scale);
  const maxLines = CERTIFICATE_TEXT_LINE_LIMITS[role];
  const maxHeight = canvas.height * item.height / 100;
  let fontSize = initialFontSize;
  let lines: string[] = [];

  context.save();
  const family = item.fontFamily === "serif"
    ? `"${languageFamily}", Georgia, serif`
    : item.fontFamily === "sans-serif"
      ? `"${languageFamily}", Arial, sans-serif`
      : `"${languageFamily}", sans-serif`;
  const fontWeight = item.fontWeight === "bold" ? 700 : 400;
  context.fillStyle = item.color;
  context.textAlign = item.align;
  context.textBaseline = "middle";
  context.shadowColor = "rgba(255,255,255,.96)";
  context.shadowBlur = 3 * scale;
  context.shadowOffsetY = scale;

  do {
    context.font = `${fontWeight} ${fontSize}px ${family}`;
    lines = wrapText(context, value, maxWidth);
    if (lines.length <= maxLines && lines.length * fontSize * 1.24 <= maxHeight) break;
    fontSize -= Math.max(scale, 1);
  } while (fontSize > minimumFontSize);

  // Never discard issued wording. Exceptional long content may step below the
  // preferred readable floor only as far as required to stay inside its box.
  if (lines.length > maxLines || lines.length * fontSize * 1.24 > maxHeight) {
    fontSize = Math.max(6 * scale, Math.min(minimumFontSize, maxHeight / Math.max(lines.length * 1.18, 1)));
    context.font = `${fontWeight} ${fontSize}px ${family}`;
    lines = wrapText(context, value, maxWidth);
  }

  const drawX = item.align === "left"
    ? boxLeft
    : item.align === "right"
      ? boxRight
      : canvas.width * item.x / 100;
  const lineHeight = fontSize * 1.24;
  lines.forEach((line, index) => {
    const lineY = centerY + (index - (lines.length - 1) / 2) * lineHeight;
    context.fillText(line, drawX, lineY, maxWidth);
  });
  context.restore();
}

export async function renderCertificateCanvas(certificate: ParticipationCertificate, language: Language, verificationUrl: string) {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  canvas.width = 2400;
  canvas.height = Math.round(canvas.width * certificate.artwork.height / certificate.artwork.width);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("certificate_canvas_unavailable");
  context.drawImage(await loadImage(certificate.artwork.url), 0, 0, canvas.width, canvas.height);

  // Keep the immutable issued placement as the source of truth. The shared
  // collision resolver only packs overlapping legacy regions at render time,
  // so preview, PDF and print remain compatible without replacing snapshots.
  const usesExactGsaaArtwork = certificate.artwork.sha256 === GSAA_CERTIFICATE_ARTWORK.sha256
    && certificate.artwork.storagePath === GSAA_CERTIFICATE_ARTWORK.storagePath;
  const placement = resolveCollisionSafeCertificatePlacement(
    certificate.placement,
    certificate.artwork.width / certificate.artwork.height,
    usesExactGsaaArtwork ? GSAA_CERTIFICATE_ARTWORK_EXCLUSIONS : []
  ).placement;
  const wording = certificate.wording[language];
  const family = FONT_FAMILIES[language];
  const locale = language === "or" ? "or-IN" : language === "hi" ? "hi-IN" : "en-IN";
  const date = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", year: "numeric" })
    .format(new Date(certificate.participationDate));
  const draw = (value: string, placement: CertificateTextPlacement, role: CertificateTextRole) =>
    drawTextBlock(context, value, placement, role, canvas, certificate.artwork.width, family);

  draw(wording.heading, placement.heading, "heading");
  draw(wording.intro, placement.intro, "intro");
  draw(certificate.supporterDisplayName, placement.name, "name");
  draw(wording.acknowledgement, placement.acknowledgement, "acknowledgement");
  draw(wording.campaignLabel, placement.campaignLabel, "campaignLabel");
  draw(certificate.campaignName, placement.campaign, "campaign");
  draw(`${wording.participationDateLabel}: ${date}`, placement.date, "date");
  draw(`${wording.certificateIdLabel}: ${certificate.certificateId}`, placement.certificateId, "certificateId");
  draw(`${wording.issuerLabel}: ${certificate.issuer.name} — ${certificate.issuer.title}`, placement.issuer, "issuer");
  draw(wording.qrHeading, placement.qrHeading, "qrHeading");
  draw(wording.qrInstructions, placement.qrInstructions, "qrInstructions");
  draw(wording.slogan, placement.slogan, "slogan");
  draw(wording.footer, placement.footer, "footer");

  const qrSize = canvas.width * placement.qr.width / 100;
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, verificationUrl, {
    width: Math.round(qrSize),
    margin: 4,
    errorCorrectionLevel: "Q",
    color: { dark: "#071f4e", light: "#ffffff" }
  });
  context.drawImage(
    qrCanvas,
    canvas.width * placement.qr.x / 100,
    canvas.height * placement.qr.y / 100,
    qrSize,
    qrSize
  );

  if (certificate.status === "revoked") {
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-Math.PI / 8);
    context.font = "700 180px sans-serif";
    context.fillStyle = "rgba(150,0,0,.5)";
    context.textAlign = "center";
    context.fillText(language === "hi" ? "निरस्त" : language === "or" ? "ରଦ୍ଦ" : "REVOKED", 0, 0);
    context.restore();
  }
  return canvas;
}

export async function downloadCertificatePdf(certificate: ParticipationCertificate, language: Language, verificationUrl: string) {
  const canvas = await renderCertificateCanvas(certificate, language, verificationUrl);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 7;
  const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
  pdf.save(`${certificate.campaignSlug}-${certificate.certificateId}.pdf`);
}

export async function printCertificate(certificate: ParticipationCertificate, language: Language, verificationUrl: string) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) throw new Error("certificate_print_blocked");
  const dataUrl = (await renderCertificateCanvas(certificate, language, verificationUrl)).toDataURL("image/png");
  printWindow.document.write(`<!doctype html><html><head><title>${certificate.certificateId}</title><style>@page{size:A4 landscape;margin:7mm}html,body{margin:0;height:100%;display:grid;place-items:center}img{max-width:100%;max-height:100%}</style></head><body><img src="${dataUrl}" onload="window.print()" alt="Certificate"></body></html>`);
  printWindow.document.close();
}

