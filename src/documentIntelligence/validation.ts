export function normalizeIndianMobileCandidate(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function normalizeExtractedTextValue(value: string): string {
  return value.replace(/^[\s:;|,.-]+|[\s:;|,.-]+$/g, "").replace(/\s+/g, " ").trim();
}

export function isSafePersonName(value: string): boolean {
  const normalized = normalizeExtractedTextValue(value);
  if (normalized.length < 3 || normalized.length > 100 || /\d/.test(normalized)) return false;
  const words = normalized.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  if (!words.every((word) => /^[\p{L}][\p{L}'.-]*$/u.test(word))) return false;
  const generic = /^(application|registration|supporter|beneficiary|field collection|signature|document|form|government|odisha)$/i;
  return !generic.test(normalized);
}

export function isSafeLocationValue(value: string): boolean {
  const normalized = normalizeExtractedTextValue(value);
  return normalized.length >= 2
    && normalized.length <= 100
    && !/^\d+$/.test(normalized)
    && /^[\p{L}\d][\p{L}\d '.()/-]*$/u.test(normalized);
}

