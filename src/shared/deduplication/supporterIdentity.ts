export interface NormalizedIdentityValue {
  raw: string;
  normalized: string;
  verified: boolean;
}

export interface NormalizedPersonName {
  raw: string;
  display: string;
  comparison: string;
}

function stableIdentity(namespace: string, parts: string[]): string {
  const encoder = new TextEncoder();
  return [namespace, ...parts]
    .map((part) => `${encoder.encode(part).byteLength}:${part}`)
    .join("|");
}

export function normalizeIndianPhone(rawPhone: string): NormalizedIdentityValue {
  const compact = rawPhone.trim().replace(/[\s\-()[\]]/g, "");
  const withoutCountryCode = compact.startsWith("+91") && compact.length === 13
    ? compact.slice(3)
    : compact.startsWith("91") && compact.length === 12
      ? compact.slice(2)
      : compact;
  const verified = /^[6-9][0-9]{9}$/.test(withoutCountryCode);
  return {
    raw: rawPhone,
    normalized: verified ? withoutCountryCode : "",
    verified
  };
}

export function normalizeEmail(rawEmail: string): NormalizedIdentityValue {
  const normalized = rawEmail.trim().toLocaleLowerCase("en");
  const verified = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  return {
    raw: rawEmail,
    normalized: verified ? normalized : "",
    verified
  };
}

export function normalizePersonNameForComparison(rawName: string): NormalizedPersonName {
  const display = rawName.normalize("NFC").trim().replace(/\s+/g, " ");
  return {
    raw: rawName,
    display,
    comparison: display.toLocaleLowerCase("en-IN")
  };
}

export function buildSupporterIdentityKey(input: {
  workspaceId: string;
  campaignId: string;
  phone: NormalizedIdentityValue;
  email: NormalizedIdentityValue;
  name: NormalizedPersonName;
  sourceRowFingerprint: string;
}): string {
  if (input.phone.verified) {
    return stableIdentity("voiceup-supporter-phone-v1", [
      input.workspaceId,
      input.campaignId,
      input.phone.normalized
    ]);
  }
  if (input.email.verified) {
    return stableIdentity("voiceup-supporter-email-v1", [
      input.workspaceId,
      input.campaignId,
      input.email.normalized
    ]);
  }
  return stableIdentity("voiceup-supporter-source-name-v1", [
    input.workspaceId,
    input.campaignId,
    input.name.comparison,
    input.sourceRowFingerprint
  ]);
}

export function buildUploadFingerprint(input: {
  workspaceId: string;
  campaignId: string;
  fileSha256: string;
  fileSize: number;
  pageNumber?: number;
}): string {
  return stableIdentity("voiceup-upload-v1", [
    input.workspaceId,
    input.campaignId,
    input.fileSha256.toLocaleLowerCase("en"),
    String(Math.max(0, Math.trunc(input.fileSize))),
    input.pageNumber === undefined ? "" : String(input.pageNumber)
  ]);
}

export function buildSourceRowFingerprint(input: {
  workspaceId: string;
  campaignId: string;
  uploadFingerprint: string;
  sourceReference: string;
}): string {
  return stableIdentity("voiceup-source-row-v1", [
    input.workspaceId,
    input.campaignId,
    input.uploadFingerprint,
    input.sourceReference
  ]);
}

export function buildApprovalKey(input: {
  workspaceId: string;
  campaignId: string;
  reviewItemId: string;
  sourceRowFingerprint: string;
}): string {
  return stableIdentity("voiceup-approval-v1", [
    input.workspaceId,
    input.campaignId,
    input.reviewItemId,
    input.sourceRowFingerprint
  ]);
}

export async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
