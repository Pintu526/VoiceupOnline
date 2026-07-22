import type { DocumentIntelligenceOutput } from "./types.ts";
import type { DocumentImageQuality } from "./quality.ts";
import type { OcrImageVariantId } from "./variants.ts";

export interface OcrCandidateScore {
  variantId: OcrImageVariantId;
  score: number;
  validMobile: boolean;
  labelledName: boolean;
  usefulTextRatio: number;
  garbageRatio: number;
  providerConfidence: number;
}

export interface BusinessOsDocumentAnalysis extends DocumentIntelligenceOutput {
  imageQuality: DocumentImageQuality;
  selectedVariant: OcrImageVariantId;
  candidateScores: OcrCandidateScore[];
  automaticExtractionSufficient: boolean;
  cameraRecommended: boolean;
  cameraRecommendationReasons: string[];
}

const validIndianMobile = (value: string) => /^[6-9]\d{9}$/.test(value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""));

export function scoreOcrCandidate(
  variantId: OcrImageVariantId,
  output: DocumentIntelligenceOutput
): OcrCandidateScore {
  const compactText = output.rawText.replace(/\s/g, "");
  const usefulCharacters = (compactText.match(/[\p{L}\p{N}]/gu) ?? []).length;
  const garbageCharacters = (compactText.match(/[^\p{L}\p{N}.,:/()\-]/gu) ?? []).length;
  const usefulTextRatio = compactText.length ? usefulCharacters / compactText.length : 0;
  const garbageRatio = compactText.length ? garbageCharacters / compactText.length : 1;
  const validMobile = validIndianMobile(output.fields.mobile);
  const labelledName = output.fieldSource.name.type === "labelled" && output.fieldConfidence.name >= 60;
  const providerConfidence = Math.max(0, Math.min(100, output.diagnostics.providerConfidence ?? 0));
  const score = Math.round(
    (validMobile ? 30 : 0)
    + (labelledName ? 25 : output.fields.name && output.fieldConfidence.name >= 60 ? 15 : 0)
    + usefulTextRatio * 15
    + providerConfidence * 0.2
    + (1 - garbageRatio) * 10
  );
  return {
    variantId,
    score,
    validMobile,
    labelledName,
    usefulTextRatio: Math.round(usefulTextRatio * 1000) / 1000,
    garbageRatio: Math.round(garbageRatio * 1000) / 1000,
    providerConfidence
  };
}

export function getCameraRecommendationReasons(
  output: DocumentIntelligenceOutput,
  quality: DocumentImageQuality,
  candidateScore: OcrCandidateScore
): string[] {
  const reasons: string[] = [];
  if (!candidateScore.validMobile) reasons.push("No valid Indian mobile number was detected.");
  if (!output.fields.name || output.fieldConfidence.name < 60) reasons.push("No usable name candidate was detected.");
  if (quality.overallScore < 45) reasons.push("Overall document quality is below the reliable extraction threshold.");
  if (candidateScore.score < 55) reasons.push("OCR result confidence is below the reliable extraction threshold.");
  return reasons;
}

export function shouldRecommendDocumentCamera(
  output: DocumentIntelligenceOutput,
  quality: DocumentImageQuality,
  candidateScore: OcrCandidateScore
): boolean {
  return getCameraRecommendationReasons(output, quality, candidateScore).length > 0;
}
