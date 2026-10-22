import { englishDocumentLanguagePack } from "./languages.ts";
import { logDocumentIntelligenceStage } from "./diagnostics.ts";
import { analyzeDocumentImageQuality } from "./imageQuality.ts";
import { analyzeDocument } from "./pipeline.ts";
import { tesseractOcrProvider } from "./providers/tesseract.ts";
import {
  createCanonicalIndiaDocumentReferenceData,
  createIndiaDocumentReferenceData
} from "./references/india.ts";
import type { CanonicalLocationCatalogReader } from "../businessOs/location/ui/CanonicalLocationUiModel.ts";
import {
  getCameraRecommendationReasons,
  scoreOcrCandidate,
  shouldRecommendDocumentCamera,
  type BusinessOsDocumentAnalysis
} from "./selection.ts";
import { generateOcrImageVariants } from "./variants.ts";

export const DOCUMENT_CAMERA_RECOMMENDATION_MESSAGE =
  "Document quality is too low for reliable automatic extraction.";

export async function analyzeBusinessOsDocument(
  image: Blob,
  diagnosticId: string,
  canonicalLocationReader?: CanonicalLocationCatalogReader
): Promise<BusinessOsDocumentAnalysis> {
  let referenceData = createIndiaDocumentReferenceData();
  if (canonicalLocationReader) {
    try {
      referenceData = (await createCanonicalIndiaDocumentReferenceData(canonicalLocationReader)).referenceData;
    } catch (error) {
      logDocumentIntelligenceStage(diagnosticId, "Canonical OCR vocabulary unavailable; using compatibility vocabulary", {
        error: error instanceof Error ? error.message : "Unknown canonical catalog error"
      });
    }
  }
  const imageQuality = await analyzeDocumentImageQuality(image);
  const variants = await generateOcrImageVariants(image, imageQuality);
  const candidates = [];
  for (const variant of variants) {
    const output = await analyzeDocument(variant.image, {
      diagnosticId,
      provider: tesseractOcrProvider,
      languages: ["eng"],
      languagePacks: [englishDocumentLanguagePack],
      referenceData
    });
    candidates.push({ output, score: scoreOcrCandidate(variant.id, output) });
  }
  candidates.sort((left, right) => right.score.score - left.score.score);
  const selected = candidates[0];
  const cameraRecommendationReasons = getCameraRecommendationReasons(
    selected.output,
    imageQuality,
    selected.score
  );
  const cameraRecommended = shouldRecommendDocumentCamera(selected.output, imageQuality, selected.score);
  logDocumentIntelligenceStage(diagnosticId, "Best OCR variant selected", {
    imageQuality,
    selectedVariant: selected.score.variantId,
    candidateScores: candidates.map((candidate) => candidate.score),
    cameraRecommended,
    cameraRecommendationReasons
  });
  return {
    ...selected.output,
    imageQuality,
    selectedVariant: selected.score.variantId,
    candidateScores: candidates.map((candidate) => candidate.score),
    automaticExtractionSufficient: !cameraRecommended,
    cameraRecommended,
    cameraRecommendationReasons
  };
}
