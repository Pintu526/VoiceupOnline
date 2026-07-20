import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createDocumentDiagnosticId,
  logDocumentIntelligenceStage
} from "../src/documentIntelligence/diagnostics.ts";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const scansSource = readFileSync(new URL("../src/pages/app/ScansTab.tsx", import.meta.url), "utf8");
const pipelineSource = readFileSync(new URL("../src/documentIntelligence/pipeline.ts", import.meta.url), "utf8");

test("diagnostic IDs correlate preprocessing, OCR, extraction, and Human Verify mapping", () => {
  assert.equal(createDocumentDiagnosticId("paper form.jpg", 123), "document-123-paper-form.jpg");
  const entries = [];
  const originalDebug = console.debug;
  console.debug = (...values) => entries.push(values);
  try {
    logDocumentIntelligenceStage("document-1", "stage", { value: true });
  } finally {
    console.debug = originalDebug;
  }
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1].diagnosticId, "document-1");
});

test("all requested stages surround existing Field Collection boundaries", () => {
  assert.match(scansSource, /1\. Image received/);
  assert.match(scansSource, /2\. Image preprocessing completed/);
  for (const stage of [
    "3. OCR engine name",
    "4. OCR execution started",
    "5. OCR execution completed",
    "6. Raw OCR text (first 500 characters)",
    "7. OCR confidence",
    "8-9. Parsed fields and extraction reasons"
  ]) assert.equal(pipelineSource.includes(stage), true, `Missing diagnostic stage: ${stage}`);
  assert.match(appSource, /10\. Final object passed to Human Verify/);
});

test("provider-specific Tesseract logic is absent from UI integration", () => {
  assert.doesNotMatch(appSource, /tesseract|recognize\(/i);
  assert.doesNotMatch(scansSource, /tesseract|recognize\(/i);
  assert.match(appSource, /analyzeBusinessOsDocument\(file, ocrDiagnosticId\)/);
});

