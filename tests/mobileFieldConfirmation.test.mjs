import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  confirmationUrlFormat,
  createSecureConfirmationLinkDesign,
  createConfirmationQueueItems,
  getPaperSupporterConfirmationStatus,
  smsConfirmationAdapter,
  whatsappConfirmationAdapter
} from "../src/confirmationQueue.ts";
import {
  MAX_SCAN_IMAGE_BYTES,
  buildPrivateScanStoragePath,
  validateScanImageFile
} from "../src/mobileScanCapture.ts";

const campaign = { id: "campaign-1", slug: "clean-water", title: "Clean Water" };
const scansTabSource = readFileSync(new URL("../src/pages/app/ScansTab.tsx", import.meta.url), "utf8");
const backendSource = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function signer(overrides = {}) {
  return {
    id: "supporter-1",
    campaignId: campaign.id,
    phone: "+91 98765 43210",
    smsConsent: false,
    whatsappConsent: false,
    noOngoingCommunications: false,
    ...overrides
  };
}

function queueFor(candidate, currentQueue = []) {
  let id = 0;
  return createConfirmationQueueItems({
    workspaceId: "workspace-1",
    campaign,
    signer: candidate,
    currentQueue,
    createId: () => `queue-${++id}`,
    now: "2026-07-16T00:00:00.000Z"
  });
}

test("capture validation rejects non-images and images over 12 MB", () => {
  assert.equal(validateScanImageFile({ type: "application/pdf", size: 100 }), "unsupported_type");
  assert.equal(
    validateScanImageFile({ type: "image/jpeg", size: MAX_SCAN_IMAGE_BYTES + 1 }),
    "file_too_large"
  );
  assert.equal(validateScanImageFile({ type: "image/jpeg", size: MAX_SCAN_IMAGE_BYTES }), null);
});

test("mobile capture prefers the rear camera, preserves gallery choice, and uses 44px controls", () => {
  assert.match(scansTabSource, /accept="image\/\*"\s+capture="environment"/);
  assert.match(scansTabSource, /scans\.capture\.chooseImage/);
  assert.match(stylesSource, /mobile-file-button[\s\S]*min-height:\s*44px/);
});

test("private scan paths are campaign/batch/scan scoped and contain no base64", () => {
  const path = buildPrivateScanStoragePath(
    "campaign-1",
    "field batch 7",
    "scan-99",
    "paper form.jpg",
    123456
  );
  assert.equal(path, "campaign-1/field-batch-7/scan-99/123456-paper-form.jpg");
  assert.equal(path.includes("data:"), false);
  const privateUploader = backendSource.slice(
    backendSource.indexOf("export async function uploadPrivateFileToStorage"),
    backendSource.indexOf("export async function createSignedStorageUrl")
  );
  assert.equal(privateUploader.includes("getPublicUrl"), false);
});

test("consent defaults produce no confirmation queue item", () => {
  assert.deepEqual(queueFor(signer()), []);
  assert.deepEqual(queueFor(signer({ noOngoingCommunications: true, smsConsent: true })), []);
});

test("SMS consent creates one idempotent SMS queue item", () => {
  const first = queueFor(signer({ smsConsent: true }));
  assert.equal(first.length, 1);
  assert.equal(first[0].channel, "sms");
  assert.equal(first[0].status, "queued");
  assert.equal(first[0].destinationMasked.endsWith("3210"), true);
  assert.deepEqual(queueFor(signer({ smsConsent: true }), first), []);
});

test("WhatsApp consent creates one idempotent WhatsApp queue item", () => {
  const first = queueFor(signer({ whatsappConsent: true }));
  assert.equal(first.length, 1);
  assert.equal(first[0].channel, "whatsapp");
  assert.deepEqual(queueFor(signer({ whatsappConsent: true }), first), []);
});

test("invalid mobile creates no sendable queue item", () => {
  assert.deepEqual(queueFor(signer({ phone: "123", smsConsent: true })), []);
});

test("provider adapters are disabled and make no real provider call", async () => {
  assert.equal(smsConfirmationAdapter.enabled, false);
  assert.equal(whatsappConfirmationAdapter.enabled, false);
  await assert.rejects(() => smsConfirmationAdapter.send({}), /disabled/);
  await assert.rejects(() => whatsappConfirmationAdapter.send({}), /disabled/);
});

test("confirmation URL is a backend token format and exposes no supporter or phone data", () => {
  assert.match(confirmationUrlFormat, /opaque-one-time-token/);
  assert.match(confirmationUrlFormat, /\/c\/\{campaignSlug\}/);
  assert.equal(confirmationUrlFormat.includes("/campaign/"), false);
  assert.equal(confirmationUrlFormat.includes("supporter-1"), false);
  assert.equal(confirmationUrlFormat.includes("98765"), false);
  const design = createSecureConfirmationLinkDesign(campaign.id, "supporter-1");
  assert.equal(design.tokenType, "opaque");
  assert.equal(design.oneTime, true);
  assert.equal(design.confirmsOnOpen, false);
  assert.equal(design.backendIssuanceRequired, true);
});

test("paper supporters remain pending confirmation and duplicates are suppressed", () => {
  const scan = {
    parsedSigner: { phone: "+91 98765 43210" },
    smsConsent: true,
    whatsappConsent: false,
    noOngoingCommunications: false
  };
  assert.equal(getPaperSupporterConfirmationStatus(scan, false), "pending_confirmation");
  assert.equal(getPaperSupporterConfirmationStatus(scan, true), "suppressed");
});
