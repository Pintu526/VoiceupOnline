const MAX_DOCUMENT_IMAGE_DIMENSION = 2400;
const DOCUMENT_JPEG_QUALITY = 0.9;

export interface DocumentImagePreprocessor {
  readonly id: string;
  preprocess(file: File, rotationDegrees?: number): Promise<File>;
}

export async function preprocessDocumentImage(file: File, rotationDegrees = 0): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;

  const image = await createImageBitmap(file);
  try {
    const normalizedRotation = ((rotationDegrees % 360) + 360) % 360;
    const scale = Math.min(1, MAX_DOCUMENT_IMAGE_DIMENSION / Math.max(image.width, image.height));
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
      canvas.toBlob(resolve, "image/jpeg", DOCUMENT_JPEG_QUALITY)
    );
    if (!blob) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "document";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified
    });
  } finally {
    image.close();
  }
}

export const browserDocumentImagePreprocessor: DocumentImagePreprocessor = {
  id: "browser-canvas-v1",
  preprocess: preprocessDocumentImage
};

