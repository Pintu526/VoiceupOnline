import type { DocumentCorners } from "../documentIntelligence/quality.ts";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function reduceShadows(imageData: ImageData): void {
  const tileSize = 48;
  const { width, height, data } = imageData;
  for (let tileY = 0; tileY < height; tileY += tileSize) {
    for (let tileX = 0; tileX < width; tileX += tileSize) {
      const right = Math.min(width, tileX + tileSize);
      const bottom = Math.min(height, tileY + tileSize);
      let luminanceTotal = 0;
      let pixels = 0;
      for (let y = tileY; y < bottom; y += 1) {
        for (let x = tileX; x < right; x += 1) {
          const offset = (y * width + x) * 4;
          luminanceTotal += data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
          pixels += 1;
        }
      }
      const mean = pixels ? luminanceTotal / pixels : 180;
      const gain = clamp(178 / Math.max(60, mean), 0.82, 1.28);
      for (let y = tileY; y < bottom; y += 1) {
        for (let x = tileX; x < right; x += 1) {
          const offset = (y * width + x) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            data[offset + channel] = clamp((data[offset + channel] - 128) * 1.08 + 128, 0, 255) * gain;
          }
        }
      }
    }
  }
}

export function perspectiveCorrectImageData(
  source: ImageData,
  corners: DocumentCorners,
  maximumDimension = 1800
): ImageData {
  const points = {
    topLeft: { x: corners.topLeft.x * source.width, y: corners.topLeft.y * source.height },
    topRight: { x: corners.topRight.x * source.width, y: corners.topRight.y * source.height },
    bottomRight: { x: corners.bottomRight.x * source.width, y: corners.bottomRight.y * source.height },
    bottomLeft: { x: corners.bottomLeft.x * source.width, y: corners.bottomLeft.y * source.height }
  };
  const estimatedWidth = Math.max(
    distance(points.topLeft, points.topRight),
    distance(points.bottomLeft, points.bottomRight)
  );
  const estimatedHeight = Math.max(
    distance(points.topLeft, points.bottomLeft),
    distance(points.topRight, points.bottomRight)
  );
  const scale = Math.min(1, maximumDimension / Math.max(estimatedWidth, estimatedHeight));
  const width = Math.max(2, Math.round(estimatedWidth * scale));
  const height = Math.max(2, Math.round(estimatedHeight * scale));
  const output = new ImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const vertical = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const horizontal = width === 1 ? 0 : x / (width - 1);
      const topX = points.topLeft.x + (points.topRight.x - points.topLeft.x) * horizontal;
      const topY = points.topLeft.y + (points.topRight.y - points.topLeft.y) * horizontal;
      const bottomX = points.bottomLeft.x + (points.bottomRight.x - points.bottomLeft.x) * horizontal;
      const bottomY = points.bottomLeft.y + (points.bottomRight.y - points.bottomLeft.y) * horizontal;
      const sourceX = clamp(Math.round(topX + (bottomX - topX) * vertical), 0, source.width - 1);
      const sourceY = clamp(Math.round(topY + (bottomY - topY) * vertical), 0, source.height - 1);
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const outputOffset = (y * width + x) * 4;
      output.data[outputOffset] = source.data[sourceOffset];
      output.data[outputOffset + 1] = source.data[sourceOffset + 1];
      output.data[outputOffset + 2] = source.data[sourceOffset + 2];
      output.data[outputOffset + 3] = 255;
    }
  }
  reduceShadows(output);
  return output;
}

export async function captureCorrectedDocumentFrame(
  video: HTMLVideoElement,
  corners: DocumentCorners
): Promise<File> {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = video.videoWidth;
  sourceCanvas.height = video.videoHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("Camera capture canvas is unavailable.");
  sourceContext.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const corrected = perspectiveCorrectImageData(
    sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height),
    corners
  );
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = corrected.width;
  outputCanvas.height = corrected.height;
  outputCanvas.getContext("2d")?.putImageData(corrected, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => outputCanvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("Unable to encode the corrected document image.");
  return new File([blob], `voiceup-document-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}
