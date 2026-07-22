import type { DocumentImageQuality } from "./quality.ts";

export type OcrImageVariantId =
  | "original"
  | "grayscale"
  | "contrast_enhanced"
  | "sharpened"
  | "adaptive_threshold"
  | "inverted_threshold";

export interface OcrImageVariant {
  id: OcrImageVariantId;
  image: Blob;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Unable to create OCR image variant.")),
    "image/png"
  ));
}

function grayscalePixels(imageData: ImageData): Uint8ClampedArray {
  const grayscale = new Uint8ClampedArray(imageData.width * imageData.height);
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4;
    grayscale[pixel] = Math.round(
      imageData.data[offset] * 0.299
      + imageData.data[offset + 1] * 0.587
      + imageData.data[offset + 2] * 0.114
    );
  }
  return grayscale;
}

function writeGrayscale(imageData: ImageData, grayscale: ArrayLike<number>): void {
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4;
    const value = grayscale[pixel];
    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
  }
}

function contrastEnhanced(grayscale: Uint8ClampedArray): Uint8ClampedArray {
  let minimum = 255;
  let maximum = 0;
  for (const value of grayscale) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const range = Math.max(1, maximum - minimum);
  return grayscale.map((value) => Math.max(0, Math.min(255, Math.round((value - minimum) * 255 / range))));
}

function sharpen(grayscale: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(grayscale);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const value = grayscale[index] * 5
        - grayscale[index - 1]
        - grayscale[index + 1]
        - grayscale[index - width]
        - grayscale[index + width];
      output[index] = Math.max(0, Math.min(255, value));
    }
  }
  return output;
}

function adaptiveThreshold(
  grayscale: Uint8ClampedArray,
  width: number,
  height: number,
  inverted: boolean
): Uint8ClampedArray {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += grayscale[(y - 1) * width + x - 1];
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum;
    }
  }
  const radius = Math.max(8, Math.round(Math.min(width, height) * 0.018));
  const output = new Uint8ClampedArray(grayscale.length);
  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      const stride = width + 1;
      const sum = integral[(bottom + 1) * stride + right + 1]
        - integral[top * stride + right + 1]
        - integral[(bottom + 1) * stride + left]
        + integral[top * stride + left];
      const mean = sum / ((right - left + 1) * (bottom - top + 1));
      const darkInk = grayscale[y * width + x] < mean - 9;
      output[y * width + x] = inverted ? (darkInk ? 255 : 0) : (darkInk ? 0 : 255);
    }
  }
  return output;
}

async function createVariantBlob(
  source: ImageData,
  transform: (grayscale: Uint8ClampedArray) => Uint8ClampedArray
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("OCR variant canvas is unavailable.");
  const copy = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  writeGrayscale(copy, transform(grayscalePixels(source)));
  context.putImageData(copy, 0, 0);
  return canvasToBlob(canvas);
}

export async function generateOcrImageVariants(
  image: Blob,
  quality: DocumentImageQuality
): Promise<OcrImageVariant[]> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return [{ id: "original", image }];
  }
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(bitmap.width * scale));
    canvas.height = Math.max(2, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [{ id: "original", image }];
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const source = context.getImageData(0, 0, canvas.width, canvas.height);
    const grayscale = grayscalePixels(source);
    const variants: OcrImageVariant[] = [
      { id: "original", image },
      { id: "grayscale", image: await createVariantBlob(source, (pixels) => pixels) },
      { id: "contrast_enhanced", image: await createVariantBlob(source, contrastEnhanced) },
      { id: "sharpened", image: await createVariantBlob(source, (pixels) => sharpen(pixels, source.width, source.height)) },
      {
        id: "adaptive_threshold",
        image: await createVariantBlob(source, (pixels) => adaptiveThreshold(pixels, source.width, source.height, false))
      }
    ];
    const darkPixelRatio = grayscale.reduce((count, value) => count + (value < 80 ? 1 : 0), 0) / grayscale.length;
    if (quality.brightness < 105 || darkPixelRatio > 0.58) {
      variants.push({
        id: "inverted_threshold",
        image: await createVariantBlob(source, (pixels) => adaptiveThreshold(pixels, source.width, source.height, true))
      });
    }
    return variants;
  } finally {
    bitmap.close();
  }
}
