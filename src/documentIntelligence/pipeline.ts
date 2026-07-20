import { fieldDiagnosticSummary, logDocumentIntelligenceStage } from "./diagnostics.ts";
import { extractStructuredDocumentFields } from "./extraction.ts";
import { normalizeDocumentText } from "./normalization.ts";
import type {
  DocumentIntelligenceOutput,
  DocumentLanguagePack,
  DocumentReferenceData,
  OcrProvider
} from "./types.ts";

export interface AnalyzeDocumentOptions {
  diagnosticId: string;
  provider: OcrProvider;
  languages: string[];
  languagePacks: DocumentLanguagePack[];
  referenceData: DocumentReferenceData;
}

export async function analyzeDocument(
  image: Blob,
  options: AnalyzeDocumentOptions
): Promise<DocumentIntelligenceOutput> {
  const startedAt = new Date();
  const startedTime = Date.now();
  logDocumentIntelligenceStage(options.diagnosticId, "3. OCR engine name", {
    providerId: options.provider.id,
    providerName: options.provider.displayName,
    languages: options.languages
  });
  logDocumentIntelligenceStage(options.diagnosticId, "4. OCR execution started", {
    providerId: options.provider.id
  });

  let providerResult;
  try {
    providerResult = await options.provider.recognize({ image, languages: options.languages });
    logDocumentIntelligenceStage(options.diagnosticId, "5. OCR execution completed", { succeeded: true });
  } catch (error) {
    logDocumentIntelligenceStage(options.diagnosticId, "5. OCR execution completed", {
      succeeded: false,
      error: error instanceof Error ? error.message : "Unknown OCR provider error"
    });
    throw error;
  }

  const normalized = normalizeDocumentText(providerResult.rawText, options.languagePacks);
  const extraction = extractStructuredDocumentFields(normalized.normalizedText, {
    languagePacks: options.languagePacks,
    referenceData: options.referenceData,
    providerConfidence: providerResult.confidence
  });
  const completedAt = new Date();
  const output: DocumentIntelligenceOutput = {
    rawText: providerResult.rawText,
    normalizedText: normalized.normalizedText,
    fields: extraction.fields,
    fieldConfidence: extraction.fieldConfidence,
    fieldSource: extraction.fieldSource,
    warnings: extraction.warnings,
    diagnostics: {
      diagnosticId: options.diagnosticId,
      providerId: options.provider.id,
      providerName: options.provider.displayName,
      providerConfidence: providerResult.confidence,
      languages: options.languages,
      normalizationChanges: normalized.changes,
      candidateCounts: extraction.candidateCounts,
      rejectedCandidates: extraction.rejectedCandidates,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Date.now() - startedTime,
      providerDiagnostics: providerResult.providerDiagnostics
    }
  };

  logDocumentIntelligenceStage(options.diagnosticId, "6. Raw OCR text (first 500 characters)", {
    rawText: output.rawText.slice(0, 500),
    rawTextLength: output.rawText.length
  });
  logDocumentIntelligenceStage(options.diagnosticId, "7. OCR confidence", {
    confidence: output.diagnostics.providerConfidence
  });
  logDocumentIntelligenceStage(options.diagnosticId, "8-9. Parsed fields and extraction reasons", {
    fields: fieldDiagnosticSummary(output),
    warnings: output.warnings
  });
  return output;
}
