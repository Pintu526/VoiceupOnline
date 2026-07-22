export type DocumentFieldName = "name" | "mobile" | "village" | "district" | "state";

export type DocumentFieldSourceType =
  | "labelled"
  | "unlabelled_line"
  | "pattern"
  | "reference"
  | "none";

export interface DocumentFields {
  name: string;
  mobile: string;
  village: string;
  district: string;
  state: string;
}

export interface DocumentFieldSource {
  type: DocumentFieldSourceType;
  reason: string;
  matchedText?: string;
}

export type DocumentFieldConfidence = Record<DocumentFieldName, number>;
export type DocumentFieldSources = Record<DocumentFieldName, DocumentFieldSource>;

export interface DocumentReferenceData {
  states: Record<string, string[]>;
  districtsByState: Record<string, string[]>;
}

export interface DocumentLanguagePack {
  code: "en" | "hi" | "or";
  labels: Partial<Record<DocumentFieldName, string[]>>;
  labelCorrections: Record<string, string>;
}

export interface OcrProviderInput {
  image: Blob;
  languages: string[];
}

export interface OcrProviderResult {
  rawText: string;
  confidence: number | null;
  providerDiagnostics?: Record<string, unknown>;
}

export interface OcrProvider {
  readonly id: string;
  readonly displayName: string;
  recognize(input: OcrProviderInput): Promise<OcrProviderResult>;
}

export interface DocumentIntelligenceDiagnostics {
  diagnosticId: string;
  providerId: string;
  providerName: string;
  providerConfidence: number | null;
  languages: string[];
  normalizationChanges: string[];
  candidateCounts: Record<DocumentFieldName, number>;
  rejectedCandidates: Partial<Record<DocumentFieldName, string[]>>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  providerDiagnostics?: Record<string, unknown>;
}

export interface DocumentIntelligenceOutput {
  rawText: string;
  normalizedText: string;
  fields: DocumentFields;
  fieldConfidence: DocumentFieldConfidence;
  fieldSource: DocumentFieldSources;
  warnings: string[];
  diagnostics: DocumentIntelligenceDiagnostics;
}

export interface DocumentExtractionContext {
  languagePacks: DocumentLanguagePack[];
  referenceData: DocumentReferenceData;
  providerConfidence: number | null;
}

