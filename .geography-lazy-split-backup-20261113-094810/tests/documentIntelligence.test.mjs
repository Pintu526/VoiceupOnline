import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDocument,
  createDocumentLanguageRegistry,
  createIndiaDocumentReferenceData,
  englishDocumentLanguagePack,
  extractStructuredDocumentFields,
  normalizeDocumentText
} from "../src/documentIntelligence/index.ts";

const referenceData = createIndiaDocumentReferenceData();

function extract(rawText, providerConfidence = 82) {
  const normalized = normalizeDocumentText(rawText, [englishDocumentLanguagePack]);
  return {
    normalized,
    result: extractStructuredDocumentFields(normalized.normalizedText, {
      languagePacks: [englishDocumentLanguagePack],
      referenceData,
      providerConfidence
    })
  };
}

test("labelled clean form extracts every requested field with labelled confidence", () => {
  const { result } = extract(
    "Name: Asha Das\nMobile: 9876543210\nVillage: Khandagiri\nDistrict: Khordha\nState: Odisha"
  );
  assert.deepEqual(result.fields, {
    name: "Asha Das",
    mobile: "9876543210",
    village: "Khandagiri",
    district: "Khordha",
    state: "Odisha"
  });
  assert.equal(Object.values(result.fieldConfidence).every((score) => score >= 80), true);
  assert.equal(result.fieldSource.name.type, "labelled");
});

test("unlabelled form uses unique structural signals without inventing values", () => {
  const { result } = extract("Asha Das\n9876543210\nKhandagiri\nKhordha\nOdisha");
  assert.deepEqual(result.fields, {
    name: "Asha Das",
    mobile: "9876543210",
    village: "Khandagiri",
    district: "Khordha",
    state: "Odisha"
  });
  assert.equal(result.fieldSource.name.type, "unlabelled_line");
  assert.equal(result.fieldSource.village.type, "unlabelled_line");
});

test("noisy OCR corrects common English label errors and conservative reference noise", () => {
  const { normalized, result } = extract(
    "Narne - Asha Das\nMoblle - 98765 43210\nVillagc - Khandagiri\nDistrlct - Kh0rdha\nStatc - 0disha"
  );
  assert.match(normalized.normalizedText, /^name - Asha Das/m);
  assert.ok(normalized.changes.includes("corrected_label:moblle->mobile"));
  assert.equal(result.fields.district, "Khordha");
  assert.equal(result.fields.state, "Odisha");
  assert.equal(result.fields.mobile, "9876543210");
});

test("missing labels still permit only unambiguous patterns and maintained references", () => {
  const { result } = extract("Contact sheet\n9876543210\nDistrict office Khordha\nOdisha");
  assert.equal(result.fields.mobile, "9876543210");
  assert.equal(result.fields.state, "Odisha");
  assert.equal(result.fields.name, "");
  assert.equal(result.fieldSource.name.type, "none");
});

test("multiple phone numbers are ambiguous and remain blank", () => {
  const { result } = extract("Name: Asha Das\nMobile: 9876543210\nAlternate: 9123456789\nState: Odisha");
  assert.equal(result.fields.mobile, "");
  assert.equal(result.fieldConfidence.mobile, 0);
  assert.deepEqual(result.rejectedCandidates.mobile, ["9876543210", "9123456789"]);
  assert.ok(result.warnings.some((warning) => warning.includes("multiple valid Indian mobile")));
});

test("invalid phone numbers are rejected", () => {
  const { result } = extract("Name: Asha Das\nMobile: 1234567890\nDistrict: Khordha\nState: Odisha");
  assert.equal(result.fields.mobile, "");
  assert.ok(result.warnings.some((warning) => warning.includes("no valid Indian")));
});

test("partial fields preserve known values and leave missing values blank", () => {
  const { result } = extract("Name: Asha Das\nState: Odisha");
  assert.equal(result.fields.name, "Asha Das");
  assert.equal(result.fields.state, "Odisha");
  assert.equal(result.fields.mobile, "");
  assert.equal(result.fields.village, "");
  assert.equal(result.fields.district, "");
});

test("unsupported prose produces no structured false positives", () => {
  const { result } = extract("This is a random unsupported paragraph with many words and no form content.");
  assert.deepEqual(result.fields, { name: "", mobile: "", village: "", district: "", state: "" });
  assert.equal(Object.values(result.fieldConfidence).every((score) => score === 0), true);
});

test("empty OCR preserves an empty output and explicit warnings", () => {
  const { result } = extract("");
  assert.deepEqual(result.fields, { name: "", mobile: "", village: "", district: "", state: "" });
  assert.ok(result.warnings.includes("OCR returned no text."));
  assert.match(result.fieldSource.name.reason, /empty/i);
});

test("Odisha district recognition uses maintained reference data and canonical spelling", () => {
  const { result } = extract("District: Kh0rdha\nState: Orissa");
  assert.equal(result.fields.district, "Khordha");
  assert.equal(result.fields.state, "Odisha");
  assert.ok(referenceData.districtsByState.Odisha.includes("Khordha"));
});

test("false-positive prevention rejects dates, IDs, headings, and ambiguous names", () => {
  const { result } = extract(
    "REGISTRATION FORM\nDate 20-07-2026\nID 123456\nAsha Das\nBimal Roy\n9876543210\nKhordha\nOdisha"
  );
  assert.equal(result.fields.name, "");
  assert.equal(result.fields.village, "");
  assert.ok(result.warnings.some((warning) => warning.includes("multiple unlabelled name-like")));
});

test("output contract preserves raw text, normalization, sources, warnings, diagnostics, and provider abstraction", async () => {
  const rawText = "Narne: Asha Das\nMobile: 9876543210\nDistrict: Khordha\nState: Odisha";
  const fakeProvider = {
    id: "test-provider",
    displayName: "Test Provider",
    async recognize() {
      return { rawText, confidence: 77, providerDiagnostics: { requestId: "test-1" } };
    }
  };
  const originalDebug = console.debug;
  console.debug = () => {};
  let output;
  try {
    output = await analyzeDocument(new Blob(["image"]), {
      diagnosticId: "document-test",
      provider: fakeProvider,
      languages: ["eng"],
      languagePacks: [englishDocumentLanguagePack],
      referenceData
    });
  } finally {
    console.debug = originalDebug;
  }
  assert.equal(output.rawText, rawText);
  assert.notEqual(output.normalizedText, output.rawText);
  assert.equal(output.fields.name, "Asha Das");
  assert.equal(output.diagnostics.providerId, "test-provider");
  assert.equal(output.diagnostics.providerConfidence, 77);
  assert.equal(output.fieldSource.name.type, "labelled");
  assert.ok(Array.isArray(output.warnings));
});

test("language registry is English by default and accepts Hindi/Odia extension packs", () => {
  const hindiPack = { code: "hi", labels: { name: ["नाम"] }, labelCorrections: {} };
  const odiaPack = { code: "or", labels: { name: ["ନାମ"] }, labelCorrections: {} };
  const registry = createDocumentLanguageRegistry({ hi: hindiPack, or: odiaPack });
  assert.equal(registry.en, englishDocumentLanguagePack);
  assert.equal(registry.hi.labels.name[0], "नाम");
  assert.equal(registry.or.labels.name[0], "ନାମ");
});
