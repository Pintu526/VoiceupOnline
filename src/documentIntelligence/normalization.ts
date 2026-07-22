import type { DocumentLanguagePack } from "./types.ts";

export interface NormalizedDocumentText {
  normalizedText: string;
  changes: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeDocumentText(
  rawText: string,
  languagePacks: DocumentLanguagePack[]
): NormalizedDocumentText {
  const changes: string[] = [];
  let normalizedText = rawText.replace(/\r\n?/g, "\n");
  if (normalizedText !== rawText) changes.push("normalized_line_endings");

  normalizedText = normalizedText
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalizedText !== rawText.trim()) changes.push("normalized_whitespace");

  const corrections: Record<string, string> = Object.assign(
    {},
    ...languagePacks.map((pack) => pack.labelCorrections)
  );
  for (const [incorrect, corrected] of Object.entries(corrections)) {
    const expression = new RegExp(`^(${escapeRegExp(incorrect)})(?=\\s*[:\\-])`, "gim");
    if (expression.test(normalizedText)) {
      normalizedText = normalizedText.replace(expression, corrected);
      changes.push(`corrected_label:${incorrect}->${corrected}`);
    }
  }

  normalizedText = normalizedText.replace(/[–—]/g, "-");
  return { normalizedText, changes: [...new Set(changes)] };
}
