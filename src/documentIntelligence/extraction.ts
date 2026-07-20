import { scoreDocumentFieldConfidence } from "./confidence.ts";
import type {
  DocumentExtractionContext,
  DocumentFieldName,
  DocumentFields,
  DocumentFieldSources
} from "./types.ts";
import {
  isSafeLocationValue,
  isSafePersonName,
  normalizeExtractedTextValue,
  normalizeIndianMobileCandidate
} from "./validation.ts";

export interface StructuredExtractionResult {
  fields: DocumentFields;
  fieldConfidence: Record<DocumentFieldName, number>;
  fieldSource: DocumentFieldSources;
  warnings: string[];
  candidateCounts: Record<DocumentFieldName, number>;
  rejectedCandidates: Partial<Record<DocumentFieldName, string[]>>;
}

const fieldNames: DocumentFieldName[] = ["name", "mobile", "village", "district", "state"];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalizeExtractedTextValue).filter(Boolean))];
}

function comparisonValue(value: string): string {
  return value
    .toLocaleLowerCase("en-IN")
    .replace(/0/g, "o")
    .replace(/[1|]/g, "i")
    .replace(/5/g, "s")
    .replace(/[^a-z]/g, "");
}

function editDistance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
    let diagonal = rows[0];
    rows[0] = rightIndex;
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const previous = rows[leftIndex];
      rows[leftIndex] = Math.min(
        rows[leftIndex] + 1,
        rows[leftIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return rows[left.length];
}

function matchReferenceValue(value: string, references: string[]): string[] {
  const candidate = comparisonValue(value.replace(/\b(state|district|dist)\b/gi, ""));
  if (!candidate) return [];
  return references.filter((reference) => {
    const normalizedReference = comparisonValue(reference);
    if (candidate === normalizedReference) return true;
    if (normalizedReference.length < 6 || Math.abs(candidate.length - normalizedReference.length) > 1) return false;
    return editDistance(candidate, normalizedReference) <= 1;
  });
}

function labelledValues(
  text: string,
  field: DocumentFieldName,
  context: DocumentExtractionContext
): string[] {
  const labels = unique(context.languagePacks.flatMap((pack) => pack.labels[field] ?? []))
    .sort((left, right) => right.length - left.length);
  const values: string[] = [];
  for (const line of text.split("\n")) {
    for (const label of labels) {
      const match = line.match(new RegExp(`^[ \\t]*${escapeRegExp(label)}[ \\t]*[:\\-][ \\t]*(.+)$`, "i"));
      if (match?.[1]) {
        values.push(match[1]);
        break;
      }
    }
  }
  return unique(values);
}

function collectMobileCandidates(text: string): string[] {
  const candidates: string[] = [];
  const expression = /(?:^|[^\d])((?:\+?91[\s().-]*)?[6-9](?:[\s().-]*\d){9})(?!\d)/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    const normalized = normalizeIndianMobileCandidate(match[1]);
    if (normalized) candidates.push(normalized);
  }
  return unique(candidates);
}

function collectStandaloneReferenceMatches(lines: string[], references: string[]): string[] {
  const matches: string[] = [];
  for (const line of lines) {
    const cleanLine = normalizeExtractedTextValue(line.replace(/\b(state|district|dist)\b/gi, ""));
    const lineMatches = matchReferenceValue(cleanLine, references);
    if (lineMatches.length === 1) matches.push(lineMatches[0]);
  }
  return unique(matches);
}

function hasLabelDelimiter(line: string, context: DocumentExtractionContext): boolean {
  const allLabels = context.languagePacks.flatMap((pack) =>
    fieldNames.flatMap((field) => pack.labels[field] ?? [])
  );
  return allLabels.some((label) => new RegExp(`^[ \\t]*${escapeRegExp(label)}[ \\t]*[:\\-]`, "i").test(line));
}

export function extractStructuredDocumentFields(
  normalizedText: string,
  context: DocumentExtractionContext
): StructuredExtractionResult {
  const fields: DocumentFields = { name: "", mobile: "", village: "", district: "", state: "" };
  const fieldConfidence = { name: 0, mobile: 0, village: 0, district: 0, state: 0 };
  const fieldSource: DocumentFieldSources = Object.fromEntries(fieldNames.map((field) => [field, {
    type: "none",
    reason: normalizedText ? "No unambiguous candidate found." : "OCR text is empty."
  }])) as DocumentFieldSources;
  const candidateCounts = { name: 0, mobile: 0, village: 0, district: 0, state: 0 };
  const rejectedCandidates: Partial<Record<DocumentFieldName, string[]>> = {};
  const warnings: string[] = [];
  const lines = normalizedText.split("\n").map(normalizeExtractedTextValue).filter(Boolean);

  const setField = (
    field: DocumentFieldName,
    value: string,
    type: DocumentFieldSources[DocumentFieldName]["type"],
    reason: string,
    matchedText?: string,
    penalty = 0
  ) => {
    fields[field] = normalizeExtractedTextValue(value);
    fieldSource[field] = { type, reason, ...(matchedText ? { matchedText } : {}) };
    fieldConfidence[field] = scoreDocumentFieldConfidence(type, context.providerConfidence, penalty);
  };

  const labelledStateValues = labelledValues(normalizedText, "state", context);
  const stateReferences = Object.entries(context.referenceData.states).flatMap(([canonical, aliases]) =>
    [canonical, ...aliases].map((alias) => ({ canonical, alias }))
  );
  const labelledStateMatches = unique(labelledStateValues.flatMap((value) => {
    const matches = matchReferenceValue(value, stateReferences.map((item) => item.alias));
    return matches.flatMap((match) => stateReferences.filter((item) => item.alias === match).map((item) => item.canonical));
  }));
  const standaloneStateMatches = unique(lines.flatMap((line) => {
    const matches = matchReferenceValue(line, stateReferences.map((item) => item.alias));
    return matches.flatMap((match) => stateReferences.filter((item) => item.alias === match).map((item) => item.canonical));
  }));
  const stateCandidates = labelledStateValues.length
    ? (labelledStateMatches.length ? labelledStateMatches : labelledStateValues.filter(isSafeLocationValue))
    : standaloneStateMatches;
  candidateCounts.state = unique(stateCandidates).length;
  if (unique(stateCandidates).length === 1) {
    setField(
      "state",
      unique(stateCandidates)[0],
      labelledStateValues.length ? "labelled" : "reference",
      labelledStateValues.length ? "Unique value found beside a supported state label." : "Unique maintained state reference found in OCR text."
    );
  } else if (stateCandidates.length > 1) {
    warnings.push("State is ambiguous; multiple candidates were found.");
    rejectedCandidates.state = unique(stateCandidates);
  }

  const districtReferences = fields.state
    ? context.referenceData.districtsByState[fields.state] ?? []
    : unique(Object.values(context.referenceData.districtsByState).flat());
  const labelledDistrictValues = labelledValues(normalizedText, "district", context);
  const labelledDistrictMatches = unique(labelledDistrictValues.flatMap((value) => matchReferenceValue(value, districtReferences)));
  const standaloneDistrictMatches = collectStandaloneReferenceMatches(lines, districtReferences);
  const districtCandidates = labelledDistrictValues.length
    ? (labelledDistrictMatches.length ? labelledDistrictMatches : labelledDistrictValues.filter(isSafeLocationValue))
    : standaloneDistrictMatches;
  candidateCounts.district = unique(districtCandidates).length;
  if (unique(districtCandidates).length === 1) {
    const referenceMatched = labelledDistrictMatches.length === 1 || !labelledDistrictValues.length;
    setField(
      "district",
      unique(districtCandidates)[0],
      labelledDistrictValues.length ? "labelled" : "reference",
      referenceMatched
        ? "Unique district matched maintained reference data."
        : "Unique value found beside a supported district label; reference match unavailable.",
      undefined,
      referenceMatched ? 0 : 12
    );
  } else if (districtCandidates.length > 1) {
    warnings.push("District is ambiguous; multiple candidates were found.");
    rejectedCandidates.district = unique(districtCandidates);
  }

  const mobileCandidates = collectMobileCandidates(normalizedText);
  candidateCounts.mobile = mobileCandidates.length;
  if (mobileCandidates.length === 1) {
    const labelledMobile = labelledValues(normalizedText, "mobile", context)
      .some((value) => normalizeIndianMobileCandidate(value) === mobileCandidates[0]);
    setField(
      "mobile",
      mobileCandidates[0],
      labelledMobile ? "labelled" : "pattern",
      labelledMobile
        ? "Unique valid Indian mobile found beside a supported label."
        : "Unique valid Indian 10-digit mobile pattern found."
    );
  } else if (mobileCandidates.length > 1) {
    warnings.push("Mobile is ambiguous; multiple valid Indian mobile numbers were found.");
    rejectedCandidates.mobile = mobileCandidates;
  } else if (/\d{6,}/.test(normalizedText)) {
    warnings.push("Numeric text was found, but no valid Indian 10-digit mobile was detected.");
  }

  const labelledNameCandidates = labelledValues(normalizedText, "name", context).filter(isSafePersonName);
  candidateCounts.name = labelledNameCandidates.length;
  if (labelledNameCandidates.length === 1) {
    setField("name", labelledNameCandidates[0], "labelled", "Unique valid name found beside a supported label.");
  } else if (labelledNameCandidates.length > 1) {
    warnings.push("Name is ambiguous; multiple labelled candidates were found.");
    rejectedCandidates.name = labelledNameCandidates;
  }

  const labelledVillageCandidates = labelledValues(normalizedText, "village", context).filter(isSafeLocationValue);
  candidateCounts.village = labelledVillageCandidates.length;
  if (labelledVillageCandidates.length === 1) {
    setField("village", labelledVillageCandidates[0], "labelled", "Unique village found beside a supported label.");
  } else if (labelledVillageCandidates.length > 1) {
    warnings.push("Village is ambiguous; multiple labelled candidates were found.");
    rejectedCandidates.village = labelledVillageCandidates;
  }

  const structuralSignals = [fields.mobile, fields.district, fields.state].filter(Boolean).length;
  const recognizedValues = new Set([
    fields.mobile,
    fields.district.toLocaleLowerCase("en-IN"),
    fields.state.toLocaleLowerCase("en-IN"),
    ...labelledNameCandidates.map((value) => value.toLocaleLowerCase("en-IN")),
    ...labelledVillageCandidates.map((value) => value.toLocaleLowerCase("en-IN"))
  ].filter(Boolean));
  const genericLine = /^(application|registration|supporter|beneficiary|field collection|signature|document|form|date|photo|government)(\s+form)?$/i;
  const unlabelledLines = lines.filter((line) =>
    !hasLabelDelimiter(line, context)
    && !genericLine.test(line)
    && !collectMobileCandidates(line).length
    && !recognizedValues.has(line.toLocaleLowerCase("en-IN"))
  );

  if (!fields.name && structuralSignals >= 2) {
    const nameCandidates = unique(unlabelledLines.filter(isSafePersonName));
    candidateCounts.name += nameCandidates.length;
    if (nameCandidates.length === 1) {
      setField("name", nameCandidates[0], "unlabelled_line", "Only plausible person-name line after excluding recognized structured values.");
      recognizedValues.add(nameCandidates[0].toLocaleLowerCase("en-IN"));
    } else if (nameCandidates.length > 1) {
      warnings.push("Name remains blank because multiple unlabelled name-like lines were found.");
      rejectedCandidates.name = nameCandidates;
    }
  }

  if (!fields.village && structuralSignals >= 2 && fields.name) {
    const villageCandidates = unique(unlabelledLines.filter((line) =>
      !recognizedValues.has(line.toLocaleLowerCase("en-IN")) && isSafeLocationValue(line)
    ));
    candidateCounts.village += villageCandidates.length;
    if (villageCandidates.length === 1) {
      setField("village", villageCandidates[0], "unlabelled_line", "Only remaining safe location line after excluding name, mobile, district, and state.");
    } else if (villageCandidates.length > 1) {
      warnings.push("Village remains blank because multiple unlabelled location-like lines were found.");
      rejectedCandidates.village = villageCandidates;
    }
  }

  if (!normalizedText) warnings.push("OCR returned no text.");
  for (const field of fieldNames) {
    if (!fields[field]) warnings.push(`${field} requires human verification because no unambiguous value was extracted.`);
  }

  return {
    fields,
    fieldConfidence,
    fieldSource,
    warnings: [...new Set(warnings)],
    candidateCounts,
    rejectedCandidates
  };
}

