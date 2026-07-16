export const MAX_SCAN_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_SCAN_IMAGE_DIMENSION = 2400;
const SCAN_JPEG_QUALITY = 0.9;

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

export async function compressScanImage(file: File, rotationDegrees = 0): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;

  const image = await createImageBitmap(file);
  try {
    const normalizedRotation = ((rotationDegrees % 360) + 360) % 360;
    const scale = Math.min(1, MAX_SCAN_IMAGE_DIMENSION / Math.max(image.width, image.height));
    const sourceWidth = Math.max(1, Math.round(image.width * scale));
    const sourceHeight = Math.max(1, Math.round(image.height * scale));
    const swapDimensions = normalizedRotation === 90 || normalizedRotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swapDimensions ? sourceHeight : sourceWidth;
    canvas.height = swapDimensions ? sourceWidth : sourceHeight;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((normalizedRotation * Math.PI) / 180);
    context.drawImage(image, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", SCAN_JPEG_QUALITY)
    );
    if (!blob) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "paper-signature";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified
    });
  } finally {
    image.close();
  }
}
