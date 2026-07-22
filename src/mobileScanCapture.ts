export const MAX_SCAN_IMAGE_BYTES = 12 * 1024 * 1024;
export { preprocessDocumentImage as compressScanImage } from "./documentIntelligence/preprocessing.ts";

export function validateScanImageFile(file: Pick<File, "size" | "type">) {
  if (!file.type.startsWith("image/")) return "unsupported_type" as const;
  if (file.size > MAX_SCAN_IMAGE_BYTES) return "file_too_large" as const;
  return null;
}

export function buildPrivateScanStoragePath(
  campaignId: string,
  batchId: string,
  scanItemId: string,
  fileName: string,
  timestamp = Date.now()
) {
  const safeSegment = (value: string, fallback: string) =>
    value.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || fallback;
  return [
    safeSegment(campaignId, "campaign"),
    safeSegment(batchId, "batch"),
    safeSegment(scanItemId, "scan"),
    `${timestamp}-${safeSegment(fileName, "paper-signature.jpg")}`
  ].join("/");
}
