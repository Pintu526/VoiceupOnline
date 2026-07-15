import QRCode from "qrcode";

export const QR_ERROR_CORRECTION_LEVEL = "Q" as const;
export const QR_QUIET_ZONE_MODULES = 4;
export const QR_DISPLAY_SIZE_DESKTOP = 220;
export const QR_DISPLAY_SIZE_MOBILE = 180;
export const QR_EXPORT_SIZE = 1024;

export interface QrMatrix {
  cells: boolean[];
  size: number;
}

export function isValidQrDestination(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function createQrMatrix(value: string): QrMatrix | null {
  if (!isValidQrDestination(value)) return null;
  const qr = QRCode.create(value, { errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL });
  return {
    cells: Array.from(qr.modules.data, (cell) => Boolean(cell)),
    size: qr.modules.size
  };
}

export function createQrSvgFragment(
  value: string,
  x: number,
  y: number,
  size: number,
  foreground = "#071f4e",
  background = "#ffffff"
): string {
  const matrix = createQrMatrix(value);
  if (!matrix) return "";
  const totalModules = matrix.size + QR_QUIET_ZONE_MODULES * 2;
  const moduleSize = size / totalModules;
  const rects = matrix.cells
    .map((dark, index) => {
      if (!dark) return "";
      const row = Math.floor(index / matrix.size);
      const column = index % matrix.size;
      return `<rect x="${x + (column + QR_QUIET_ZONE_MODULES) * moduleSize}" y="${y + (row + QR_QUIET_ZONE_MODULES) * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`;
    })
    .join("");
  return `<g shape-rendering="crispEdges"><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${background}"/><g fill="${foreground}">${rects}</g></g>`;
}

export function createStandaloneQrSvg(value: string, size = QR_EXPORT_SIZE): string {
  const fragment = createQrSvgFragment(value, 0, 0, size);
  if (!fragment) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">${fragment}</svg>`;
}

export async function downloadQrPng(value: string, fileName: string): Promise<boolean> {
  if (!isValidQrDestination(value) || typeof document === "undefined") return false;
  const dataUrl = await QRCode.toDataURL(value, {
    color: { dark: "#071f4e", light: "#ffffff" },
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: QR_QUIET_ZONE_MODULES,
    width: QR_EXPORT_SIZE
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
  return true;
}
