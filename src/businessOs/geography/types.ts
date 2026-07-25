export const geographyLevels = [
  "country",
  "state",
  "district",
  "block",
  "local_body",
  "village",
  "ward"
] as const;

export type GeographyLevel = (typeof geographyLevels)[number];

export type GeographyEntityKind =
  | "country"
  | "state"
  | "union_territory"
  | "district"
  | "development_block"
  | "subdistrict"
  | "taluk"
  | "tehsil"
  | "gram_panchayat"
  | "municipality"
  | "municipal_corporation"
  | "town_panchayat"
  | "other_local_body"
  | "village"
  | "ward";

export interface GeographyNode {
  id: string;
  code?: string;
  sourceId?: string;
  countryCode: string;
  parentId?: string;
  ancestorIds: string[];
  level: GeographyLevel;
  kind: GeographyEntityKind;
  name: string;
  localNames?: Record<string, string>;
  aliases?: string[];
  active: boolean;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GeographyLevelTerminology {
  singular: string;
  plural: string;
  alternatives?: string[];
}

export interface GeographyLevelDefinition {
  level: GeographyLevel;
  parentLevels: GeographyLevel[];
  acceptedKinds: GeographyEntityKind[];
  terminology: GeographyLevelTerminology;
  optional?: boolean;
}

export interface AdministrativeHierarchyConfig {
  countryCode: string;
  countryName: string;
  rootId: string;
  levels: GeographyLevelDefinition[];
}

export interface GeographyDataSource {
  id: string;
  name: string;
  publisher: string;
  homepage: string;
  downloadPage?: string;
  licenseName: string;
  licenseUrl?: string;
  attribution: string;
  authoritative: boolean;
  updateCadence?: string;
}

export type GeographyCoverageStatus = "complete" | "partial" | "planned" | "unknown";

export interface GeographyCoverage {
  level: GeographyLevel;
  status: GeographyCoverageStatus;
  recordCount: number;
  note?: string;
}

export interface GeographyDataset {
  schemaVersion: 1;
  datasetVersion: string;
  generatedAt?: string;
  countryCode: string;
  source: GeographyDataSource;
  coverage: GeographyCoverage[];
  nodes: GeographyNode[];
}

export interface GeographyDatasetLoader {
  readonly id: string;
  load(countryCode: string, signal?: AbortSignal): Promise<GeographyDataset>;
}

export interface GeographySearchQuery {
  text?: string;
  countryCode?: string;
  levels?: GeographyLevel[];
  kinds?: GeographyEntityKind[];
  parentId?: string;
  ancestorId?: string;
  includeInactive?: boolean;
  limit?: number;
}

export interface GeographySearchResult {
  node: GeographyNode;
  score: number;
  matchedOn: "name" | "alias" | "local_name" | "code" | "filter";
  path: GeographyNode[];
}

export interface GeographyCoordinates {
  latitude: number;
  longitude: number;
}

export interface GPSReading extends GeographyCoordinates {
  accuracyMeters: number;
  capturedAt: string;
}

export interface GPSRequestOptions {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

export interface GPSAdapter {
  readonly id: string;
  isAvailable(): boolean;
  requestPosition(options?: GPSRequestOptions): Promise<GPSReading>;
}

export interface SuggestedGeography {
  country?: string;
  state?: string;
  district?: string;
  block?: string;
  localBody?: string;
  municipality?: string;
  panchayat?: string;
  village?: string;
  ward?: string;
  postalCode?: string;
}

export interface AddressLookupSuggestion {
  hierarchy: SuggestedGeography;
  formattedAddress?: string;
  confidence?: number;
  providerReference?: string;
}

export interface AddressLookupOptions {
  countryCode?: string;
  locale?: string;
  signal?: AbortSignal;
}

export interface AddressLookupAdapter {
  readonly id: string;
  reverseLookup(
    coordinates: GeographyCoordinates,
    options?: AddressLookupOptions
  ): Promise<AddressLookupSuggestion[]>;
}

export interface GeographyConfirmationCandidate {
  accuracyMeters: number;
  capturedAt: string;
  suggestion: AddressLookupSuggestion;
  matchedPath: GeographyNode[];
  requiresUserConfirmation: true;
}

export interface GeographyTreeNode {
  node: GeographyNode;
  children: GeographyTreeNode[];
}
