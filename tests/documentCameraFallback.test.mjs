import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  analyzeDocumentPixels,
  canCaptureDocument,
  classifyDocumentQuality
} from "../src/documentIntelligence/quality.ts";
import {
  scoreOcrCandidate,
  shouldRecommendDocumentCamera
} from "../src/documentIntelligence/selection.ts";
import {
  CAMERA_UNAVAILABLE_MESSAGE,
  DEFAULT_CAMERA_CONSTRAINTS,
  ENVIRONMENT_CAMERA_CONSTRAINTS,
  requestCompatibleCamera
} from "../src/documentCamera/compatibility.ts";

const cameraSource = readFileSync(new URL("../src/documentCamera/DocumentCamera.tsx", import.meta.url), "utf8");
const captureSource = readFileSync(new URL("../src/documentCamera/capture.ts", import.meta.url), "utf8");
const scansSource = readFileSync(new URL("../src/pages/app/ScansTab.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const defaultPipelineSource = readFileSync(new URL("../src/documentIntelligence/defaultPipeline.ts", import.meta.url), "utf8");
const variantsSource = readFileSync(new URL("../src/documentIntelligence/variants.ts", import.meta.url), "utf8");

function createPaperFrame(good) {
  const width = 1000;
  const height = 750;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let value = good && x >= 140 && x <= 860 && y >= 80 && y <= 670 ? 190 : (good ? 28 : 128);
      if (good && x >= 210 && x <= 790 && y >= 160 && y <= 580 && y % 42 < 4) value = 35;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function documentOutput(fields, confidence, sources, rawText, providerConfidence = 88) {
  return {
    rawText,
    normalizedText: rawText,
    fields: {
      name: fields.name ?? "",
      mobile: fields.mobile ?? "",
      village: "",
      district: "",
      state: ""
    },
    fieldConfidence: {
      name: confidence.name ?? 0,
      mobile: confidence.mobile ?? 0,
      village: 0,
      district: 0,
      state: 0
    },
    fieldSource: {
      name: { type: sources.name ?? "none", reason: "test" },
      mobile: { type: sources.mobile ?? "none", reason: "test" },
      village: { type: "none", reason: "test" },
      district: { type: "none", reason: "test" },
      state: { type: "none", reason: "test" }
    },
    warnings: [],
    diagnostics: {
      diagnosticId: "test",
      providerId: "test",
      providerName: "Test OCR",
      providerConfidence,
      languages: ["eng"],
      normalizationChanges: [],
      candidateCounts: { name: 1, mobile: 1, village: 0, district: 0, state: 0 },
      rejectedCandidates: {},
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000
    }
  };
}

test("good uploaded image and valid labelled OCR are accepted without camera fallback", () => {
  const quality = analyzeDocumentPixels(createPaperFrame(true));
  const output = documentOutput(
    { name: "Anita Das", mobile: "9876543210" },
    { name: 90, mobile: 96 },
    { name: "labelled", mobile: "pattern" },
    "Name: Anita Das\nMobile: 9876543210"
  );
  const score = scoreOcrCandidate("original", output);
  assert.equal(quality.documentDetected, true);
  assert.equal(score.validMobile, true);
  assert.equal(score.labelledName, true);
  assert.equal(shouldRecommendDocumentCamera(output, quality, score), false);
});

test("poor uploaded image with unusable extraction recommends the document camera", () => {
  const quality = analyzeDocumentPixels(createPaperFrame(false));
  const output = documentOutput({}, {}, {}, "... ///", 12);
  const score = scoreOcrCandidate("adaptive_threshold", output);
  assert.equal(quality.documentDetected, false);
  assert.equal(shouldRecommendDocumentCamera(output, quality, score), true);
  assert.equal(score.validMobile, false);
});

test("camera quality status requires detection, quality, and a steady frame", () => {
  const quality = analyzeDocumentPixels(createPaperFrame(true));
  assert.equal(classifyDocumentQuality({ documentDetected: false, overallScore: 100 }, true), "document_not_detected");
  assert.equal(classifyDocumentQuality({ documentDetected: true, overallScore: 50 }, true), "poor");
  assert.equal(classifyDocumentQuality({ documentDetected: true, overallScore: 80 }, false), "almost_ready");
  assert.equal(classifyDocumentQuality({ documentDetected: true, overallScore: 80 }, true), "ready");
  assert.equal(canCaptureDocument({ ...quality, documentDetected: true, overallScore: 80 }, false), false);
  assert.equal(canCaptureDocument({ ...quality, documentDetected: true, overallScore: 80 }, true), true);
});

test("browser camera keeps capture disabled until quality is green", () => {
  assert.match(cameraSource, /requestCompatibleCamera\(navigator\.mediaDevices\)/);
  assert.match(cameraSource, /const captureEnabled = Boolean\(quality && quality\.corners && canCaptureDocument\(quality, steady\)\)/);
  assert.match(cameraSource, /disabled=\{!captureEnabled \|\| capturing\}/);
  assert.match(cameraSource, /document-camera-guide/);
  assert.match(cameraSource, /calculateFrameMotion/);
});

test("camera compatibility prefers the rear camera", async () => {
  const stream = { id: "rear-camera" };
  const calls = [];
  const result = await requestCompatibleCamera({
    async getUserMedia(constraints) {
      calls.push(constraints);
      return stream;
    }
  });
  assert.equal(result, stream);
  assert.deepEqual(calls, [ENVIRONMENT_CAMERA_CONSTRAINTS]);
  assert.deepEqual(ENVIRONMENT_CAMERA_CONSTRAINTS.video.facingMode, { ideal: "environment" });
});

test("desktop, Android, iOS, and Firefox can fall back to the default camera", async () => {
  const stream = { id: "default-camera" };
  const calls = [];
  const result = await requestCompatibleCamera({
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (calls.length === 1) throw new DOMException("Requested device not found", "NotFoundError");
      return stream;
    }
  });
  assert.equal(result, stream);
  assert.deepEqual(calls, [ENVIRONMENT_CAMERA_CONSTRAINTS, DEFAULT_CAMERA_CONSTRAINTS]);
  assert.deepEqual(DEFAULT_CAMERA_CONSTRAINTS, { audio: false, video: true });
});

test("camera acquisition failure never leaks a browser-specific error", async () => {
  const mediaDevices = {
    async getUserMedia() {
      throw new DOMException("Requested device not found", "NotFoundError");
    }
  };
  await assert.rejects(
    requestCompatibleCamera(mediaDevices),
    (error) => error.message === CAMERA_UNAVAILABLE_MESSAGE
  );
  await assert.rejects(
    requestCompatibleCamera(undefined),
    (error) => error.message === CAMERA_UNAVAILABLE_MESSAGE
  );
  assert.equal(CAMERA_UNAVAILABLE_MESSAGE, "Camera unavailable on this device.\nPlease upload an image.");
});

test("camera output is corrected and enters the existing OCR pipeline", () => {
  assert.match(captureSource, /perspectiveCorrectImageData/);
  assert.match(captureSource, /reduceShadows\(output\)/);
  assert.match(cameraSource, /captureCorrectedDocumentFrame/);
  assert.match(cameraSource, /onCapture\(file\)/);
  assert.match(scansSource, /function acceptDocumentCameraCapture\(file: File\)/);
  assert.match(scansSource, /selectCaptureFile\(file\)/);
  assert.match(scansSource, /setCameraAutoUploadPending\(true\)/);
  assert.match(scansSource, /if \(!cameraAutoUploadPending \|\| !selectedCaptureFile\) return/);
  assert.match(scansSource, /onUploadScan\(preparedFile/);
  assert.match(appSource, /analyzeBusinessOsDocument\(file, ocrDiagnosticId\)/);
});

test("the final OCR attempt covers all required variants and selects one scored result", () => {
  for (const variant of [
    "original",
    "grayscale",
    "contrast_enhanced",
    "sharpened",
    "adaptive_threshold",
    "inverted_threshold"
  ]) assert.match(variantsSource, new RegExp(`\\"${variant}\\"`));
  assert.match(defaultPipelineSource, /for \(const variant of variants\)/);
  assert.match(defaultPipelineSource, /scoreOcrCandidate\(variant\.id, output\)/);
  assert.match(defaultPipelineSource, /candidates\.sort/);
});

test("poor OCR displays the exact recommendation and an Open Camera action", () => {
  assert.match(scansSource, /Document quality is too low for reliable automatic extraction\./);
  assert.match(scansSource, /Recommended: Retake using VoiceUp Document Camera\./);
  assert.match(scansSource, /> Open Camera/);
});
