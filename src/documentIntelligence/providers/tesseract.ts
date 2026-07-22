import type { OcrProvider } from "../types.ts";

export const tesseractOcrProvider: OcrProvider = {
  id: "tesseract-js",
  displayName: "Tesseract.js",
  async recognize(input) {
    const { recognize } = await import("tesseract.js");
    const language = input.languages.join("+") || "eng";
    const result = await recognize(input.image, language);
    return {
      rawText: result.data.text ?? "",
      confidence: typeof result.data.confidence === "number" ? result.data.confidence : null,
      providerDiagnostics: { language }
    };
  }
};

