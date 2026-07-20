import type { DocumentFieldSourceType } from "./types.ts";

const sourceBaseConfidence: Record<DocumentFieldSourceType, number> = {
  labelled: 94,
  reference: 88,
  pattern: 84,
  unlabelled_line: 62,
  none: 0
};

export function scoreDocumentFieldConfidence(
  source: DocumentFieldSourceType,
  providerConfidence: number | null,
  validationPenalty = 0
): number {
  if (source === "none") return 0;
  const providerAdjustment = providerConfidence === null
    ? 0
    : Math.max(-8, Math.min(4, Math.round((providerConfidence - 75) * 0.16)));
  return Math.max(0, Math.min(100, sourceBaseConfidence[source] + providerAdjustment - validationPenalty));
}

