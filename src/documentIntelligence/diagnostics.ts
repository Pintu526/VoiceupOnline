import type { DocumentFieldName, DocumentIntelligenceOutput } from "./types.ts";

export const DOCUMENT_INTELLIGENCE_DIAGNOSTIC_PREFIX = "[BUSINESS OS DOCUMENT INTELLIGENCE]";
export const FIELD_COLLECTION_TRACE_PREFIX = "[FIELD COLLECTION TRACE]";

export function createDocumentDiagnosticId(fileName: string, now = Date.now()): string {
  const safeName = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "image";
  return `document-${now}-${safeName}`;
}

export function logDocumentIntelligenceStage(
  diagnosticId: string,
  stage: string,
  details: Record<string, unknown>
): void {
  console.debug(DOCUMENT_INTELLIGENCE_DIAGNOSTIC_PREFIX, {
    diagnosticId,
    stage,
    timestamp: new Date().toISOString(),
    ...details
  });
}

export function logFieldCollectionTrace(
  stage: string,
  details: Record<string, unknown>
): void {
  if (!import.meta.env?.DEV) return;
  console.debug(FIELD_COLLECTION_TRACE_PREFIX, {
    stage,
    timestamp: new Date().toISOString(),
    ...details
  });
}

export function fieldDiagnosticSummary(output: DocumentIntelligenceOutput): Record<
  DocumentFieldName,
  { value: string; confidence: number; source: string; reason: string }
> {
  return Object.fromEntries((Object.keys(output.fields) as DocumentFieldName[]).map((field) => [field, {
    value: output.fields[field],
    confidence: output.fieldConfidence[field],
    source: output.fieldSource[field].type,
    reason: output.fieldSource[field].reason
  }])) as Record<DocumentFieldName, { value: string; confidence: number; source: string; reason: string }>;
}
