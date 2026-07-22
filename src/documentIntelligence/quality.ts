export type DocumentQualityStatus = "document_not_detected" | "poor" | "almost_ready" | "ready";

export interface DocumentPoint {
  x: number;
  y: number;
}

export interface DocumentCorners {
  topLeft: DocumentPoint;
  topRight: DocumentPoint;
  bottomRight: DocumentPoint;
  bottomLeft: DocumentPoint;
}

export interface DocumentImageQuality {
  width: number;
  height: number;
  blurScore: number;
  brightness: number;
  brightnessScore: number;
  contrast: number;
  contrastScore: number;
  resolutionScore: number;
  pageCoverage: number;
  pageInsideFrame: boolean;
  documentDetected: boolean;
  skewDegrees: number;
  glareRatio: number;
  overallScore: number;
  status: DocumentQualityStatus;
  corners?: DocumentCorners;
  warnings: string[];
}

export interface RgbaPixelSource {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

function average(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function findStrongestBoundary(values: number[], start: number, end: number): { index: number; strength: number } {
  let index = start;
  let strength = 0;
  for (let cursor = Math.max(1, start); cursor <= Math.min(values.length - 1, end); cursor += 1) {
    const difference = Math.abs(values[cursor] - values[cursor - 1]);
    if (difference > strength) {
      strength = difference;
      index = cursor;
    }
  }
  return { index, strength };
}

function linearFit(samples: Array<{ input: number; output: number }>): { slope: number; intercept: number } | null {
  if (samples.length < 4) return null;
  const inputMean = average(samples.map((sample) => sample.input));
  const outputMean = average(samples.map((sample) => sample.output));
  let numerator = 0;
  let denominator = 0;
  for (const sample of samples) {
    const inputOffset = sample.input - inputMean;
    numerator += inputOffset * (sample.output - outputMean);
    denominator += inputOffset * inputOffset;
  }
  if (denominator === 0) return null;
  const slope = numerator / denominator;
  return { slope, intercept: outputMean - slope * inputMean };
}

function strongestRowEdge(
  luminance: Float32Array,
  width: number,
  y: number,
  start: number,
  end: number
): { index: number; strength: number } {
  let index = start;
  let strength = 0;
  for (let x = Math.max(1, start); x <= Math.min(width - 1, end); x += 1) {
    const difference = Math.abs(luminance[y * width + x] - luminance[y * width + x - 1]);
    if (difference > strength) {
      strength = difference;
      index = x;
    }
  }
  return { index, strength };
}

function strongestColumnEdge(
  luminance: Float32Array,
  width: number,
  height: number,
  x: number,
  start: number,
  end: number
): { index: number; strength: number } {
  let index = start;
  let strength = 0;
  for (let y = Math.max(1, start); y <= Math.min(height - 1, end); y += 1) {
    const difference = Math.abs(luminance[y * width + x] - luminance[(y - 1) * width + x]);
    if (difference > strength) {
      strength = difference;
      index = y;
    }
  }
  return { index, strength };
}

export function classifyDocumentQuality(
  quality: Pick<DocumentImageQuality, "documentDetected" | "overallScore">,
  steady = true
): DocumentQualityStatus {
  if (!quality.documentDetected) return "document_not_detected";
  if (quality.overallScore < 55) return "poor";
  if (quality.overallScore < 75 || !steady) return "almost_ready";
  return "ready";
}

export function analyzeDocumentPixels(source: RgbaPixelSource): DocumentImageQuality {
  const { width, height, data } = source;
  if (width < 2 || height < 2 || data.length < width * height * 4) {
    return {
      width,
      height,
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
      warnings: ["Image data is unavailable."]
    };
  }

  const luminance = new Float32Array(width * height);
  const columnMeans = new Array<number>(width).fill(0);
  const rowMeans = new Array<number>(height).fill(0);
  let sum = 0;
  let squareSum = 0;
  let glarePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      luminance[y * width + x] = value;
      columnMeans[x] += value / height;
      rowMeans[y] += value / width;
      sum += value;
      squareSum += value * value;
      if (value >= 250) glarePixels += 1;
    }
  }

  const pixelCount = width * height;
  const brightness = sum / pixelCount;
  const contrast = Math.sqrt(Math.max(0, squareSum / pixelCount - brightness * brightness));
  let laplacianSum = 0;
  let laplacianSquareSum = 0;
  let laplacianCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = luminance[y * width + x];
      const laplacian =
        luminance[(y - 1) * width + x]
        + luminance[(y + 1) * width + x]
        + luminance[y * width + x - 1]
        + luminance[y * width + x + 1]
        - 4 * center;
      laplacianSum += laplacian;
      laplacianSquareSum += laplacian * laplacian;
      laplacianCount += 1;
    }
  }
  const laplacianMean = laplacianCount ? laplacianSum / laplacianCount : 0;
  const laplacianVariance = laplacianCount
    ? Math.max(0, laplacianSquareSum / laplacianCount - laplacianMean * laplacianMean)
    : 0;

  const left = findStrongestBoundary(columnMeans, 1, Math.floor(width * 0.42));
  const right = findStrongestBoundary(columnMeans, Math.ceil(width * 0.58), width - 1);
  const top = findStrongestBoundary(rowMeans, 1, Math.floor(height * 0.42));
  const bottom = findStrongestBoundary(rowMeans, Math.ceil(height * 0.58), height - 1);
  const edgeStrength = average([left.strength, right.strength, top.strength, bottom.strength]);
  const detectedWidth = Math.max(0, right.index - left.index);
  const detectedHeight = Math.max(0, bottom.index - top.index);
  const pageCoverage = detectedWidth * detectedHeight / pixelCount;
  const documentDetected = edgeStrength >= 7 && pageCoverage >= 0.2;
  const rowStep = Math.max(1, Math.floor(detectedHeight / 60));
  const columnStep = Math.max(1, Math.floor(detectedWidth / 60));
  const leftSamples: Array<{ input: number; output: number }> = [];
  const rightSamples: Array<{ input: number; output: number }> = [];
  for (let y = top.index; y <= bottom.index; y += rowStep) {
    const leftEdge = strongestRowEdge(luminance, width, y, 1, Math.floor(width * 0.48));
    const rightEdge = strongestRowEdge(luminance, width, y, Math.ceil(width * 0.52), width - 1);
    if (leftEdge.strength >= 7) leftSamples.push({ input: y, output: leftEdge.index });
    if (rightEdge.strength >= 7) rightSamples.push({ input: y, output: rightEdge.index });
  }
  const topSamples: Array<{ input: number; output: number }> = [];
  const bottomSamples: Array<{ input: number; output: number }> = [];
  for (let x = left.index; x <= right.index; x += columnStep) {
    const topEdge = strongestColumnEdge(luminance, width, height, x, 1, Math.floor(height * 0.48));
    const bottomEdge = strongestColumnEdge(luminance, width, height, x, Math.ceil(height * 0.52), height - 1);
    if (topEdge.strength >= 7) topSamples.push({ input: x, output: topEdge.index });
    if (bottomEdge.strength >= 7) bottomSamples.push({ input: x, output: bottomEdge.index });
  }
  const leftFit = linearFit(leftSamples);
  const rightFit = linearFit(rightSamples);
  const topFit = linearFit(topSamples);
  const bottomFit = linearFit(bottomSamples);
  const leftAt = (y: number) => leftFit ? leftFit.slope * y + leftFit.intercept : left.index;
  const rightAt = (y: number) => rightFit ? rightFit.slope * y + rightFit.intercept : right.index;
  const topAt = (x: number) => topFit ? topFit.slope * x + topFit.intercept : top.index;
  const bottomAt = (x: number) => bottomFit ? bottomFit.slope * x + bottomFit.intercept : bottom.index;
  const topLeftX = clamp(leftAt(top.index), 0, width - 1);
  const topRightX = clamp(rightAt(top.index), 0, width - 1);
  const bottomLeftX = clamp(leftAt(bottom.index), 0, width - 1);
  const bottomRightX = clamp(rightAt(bottom.index), 0, width - 1);
  const topLeftY = clamp(topAt(topLeftX), 0, height - 1);
  const topRightY = clamp(topAt(topRightX), 0, height - 1);
  const bottomLeftY = clamp(bottomAt(bottomLeftX), 0, height - 1);
  const bottomRightY = clamp(bottomAt(bottomRightX), 0, height - 1);
  const corners = documentDetected ? {
    topLeft: { x: topLeftX / width, y: topLeftY / height },
    topRight: { x: topRightX / width, y: topRightY / height },
    bottomRight: { x: bottomRightX / width, y: bottomRightY / height },
    bottomLeft: { x: bottomLeftX / width, y: bottomLeftY / height }
  } : undefined;
  const pageInsideFrame = Boolean(documentDetected && corners
    && Math.min(corners.topLeft.x, corners.bottomLeft.x) >= 0.015
    && Math.min(corners.topLeft.y, corners.topRight.y) >= 0.015
    && Math.max(corners.topRight.x, corners.bottomRight.x) <= 0.985
    && Math.max(corners.bottomLeft.y, corners.bottomRight.y) <= 0.985
    && pageCoverage <= 0.94);
  const skewDegrees = documentDetected
    ? Math.atan2(topRightY - topLeftY, Math.max(1, topRightX - topLeftX)) * 180 / Math.PI
    : 0;

  const blurScore = Math.round(clamp(laplacianVariance / 700) * 100);
  const brightnessScore = Math.round(clamp(1 - Math.abs(brightness - 150) / 125) * 100);
  const contrastScore = Math.round(clamp(contrast / 58) * 100);
  const resolutionScore = Math.round(clamp(Math.min(width / 900, height / 650)) * 100);
  const coverageScore = documentDetected
    ? Math.round(clamp(1 - Math.abs(pageCoverage - 0.65) / 0.65) * 100)
    : 0;
  const glareRatio = glarePixels / pixelCount;
  const glarePenalty = clamp((glareRatio - 0.08) / 0.22) * 25;
  const framePenalty = pageInsideFrame ? 0 : 12;
  const overallScore = Math.round(clamp((
    blurScore * 0.24
    + brightnessScore * 0.17
    + contrastScore * 0.2
    + resolutionScore * 0.15
    + coverageScore * 0.24
    - glarePenalty
    - framePenalty
  ) / 100) * 100);
  const warnings: string[] = [];
  if (!documentDetected) warnings.push("Document not detected.");
  if (blurScore < 55) warnings.push("Image is blurred.");
  if (brightness < 65) warnings.push("Image is too dark.");
  if (brightness > 225) warnings.push("Image is too bright.");
  if (contrastScore < 40) warnings.push("Image contrast is too low.");
  if (resolutionScore < 60) warnings.push("Image resolution is too low.");
  if (documentDetected && !pageInsideFrame) warnings.push("Keep the complete page inside the guide.");
  if (glareRatio > 0.12) warnings.push("Glare is covering the page.");
  const preliminary = { documentDetected, overallScore };

  return {
    width,
    height,
    blurScore,
    brightness: Math.round(brightness),
    brightnessScore,
    contrast: Math.round(contrast * 10) / 10,
    contrastScore,
    resolutionScore,
    pageCoverage: Math.round(pageCoverage * 1000) / 1000,
    pageInsideFrame,
    documentDetected,
    skewDegrees: Math.round(skewDegrees * 10) / 10,
    glareRatio: Math.round(glareRatio * 1000) / 1000,
    overallScore,
    status: classifyDocumentQuality(preliminary),
    corners,
    warnings
  };
}

export function calculateFrameMotion(previous: RgbaPixelSource | null, current: RgbaPixelSource): number {
  if (!previous || previous.width !== current.width || previous.height !== current.height) return Number.POSITIVE_INFINITY;
  const pixels = current.width * current.height;
  const step = Math.max(1, Math.floor(pixels / 5000));
  let difference = 0;
  let samples = 0;
  for (let pixel = 0; pixel < pixels; pixel += step) {
    const offset = pixel * 4;
    const previousLuma = previous.data[offset] * 0.299 + previous.data[offset + 1] * 0.587 + previous.data[offset + 2] * 0.114;
    const currentLuma = current.data[offset] * 0.299 + current.data[offset + 1] * 0.587 + current.data[offset + 2] * 0.114;
    difference += Math.abs(previousLuma - currentLuma);
    samples += 1;
  }
  return samples ? difference / samples : Number.POSITIVE_INFINITY;
}

export function canCaptureDocument(quality: DocumentImageQuality, steady: boolean): boolean {
  return classifyDocumentQuality(quality, steady) === "ready";
}
