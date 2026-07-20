import { analyzeDocumentPixels, type DocumentImageQuality } from "./quality.ts";

export async function analyzeDocumentImageQuality(image: Blob): Promise<DocumentImageQuality> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return {
      width: 0,
      height: 0,
      blurScore: 0,
      brightness: 0,
      brightnessScore: 0,
      contrast: 0,
      contrastScore: 0,
      resolutionScore: 0,
      pageCoverage: 0,
      pageInsideFrame: false,
      documentDetected: false,
      skewDegrees: 0,
      glareRatio: 0,
      overallScore: 0,
      status: "document_not_detected",
      warnings: ["Browser image analysis is unavailable."]
    };
  }
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(bitmap.width * scale));
    canvas.height = Math.max(2, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image quality canvas is unavailable.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const sampled = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = analyzeDocumentPixels(sampled);
    return {
      ...result,
      width: bitmap.width,
      height: bitmap.height,
      resolutionScore: Math.round(Math.min(1, Math.min(bitmap.width / 1200, bitmap.height / 900)) * 100)
    };
  } finally {
    bitmap.close();
  }
}
