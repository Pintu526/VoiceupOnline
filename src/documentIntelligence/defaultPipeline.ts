import { englishDocumentLanguagePack } from "./languages.ts";
import { analyzeDocument } from "./pipeline.ts";
import { tesseractOcrProvider } from "./providers/tesseract.ts";
import { createIndiaDocumentReferenceData } from "./references/india.ts";

export function analyzeBusinessOsDocument(image: Blob, diagnosticId: string) {
  return analyzeDocument(image, {
    diagnosticId,
    provider: tesseractOcrProvider,
    languages: ["eng"],
    languagePacks: [englishDocumentLanguagePack],
    referenceData: createIndiaDocumentReferenceData()
  });
}

