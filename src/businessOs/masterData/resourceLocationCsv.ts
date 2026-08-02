export const resourceLocationCsvHeaders = [
  "country", "state", "district", "block", "panchayat", "village", "postalCode"
] as const;

export type ResourceLocationCsvRow = Record<(typeof resourceLocationCsvHeaders)[number], string>;
export type ResourceLocationCsvParseResult =
  | { ok: true; rows: ResourceLocationCsvRow[]; contentHashInput: string }
  | { ok: false; code: "invalid_csv" | "unsupported_headers" | "file_too_large" | "too_many_rows" };

const maximumBytes = 2 * 1024 * 1024;
const maximumRows = 2000;

function safeCell(value: string) {
  const cleaned = String(value ?? "").replace(/[\t\n\r\f\v]/g, " ").replace(/[\p{Cc}]/gu, "").trim();
  return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

function escapeCell(value: string) {
  const safe = safeCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
}

function parseRecords(text: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\"") {
        if (text[index + 1] === "\"") {
          value += "\"";
          index += 1;
        } else quoted = false;
      } else value += character;
      continue;
    }
    if (character === "\"") {
      if (value) return null;
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (quoted) return null;
  row.push(value);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseResourceLocationCsv(text: string, byteLength = new TextEncoder().encode(text).byteLength): ResourceLocationCsvParseResult {
  if (byteLength > maximumBytes) return { ok: false, code: "file_too_large" };
  const records = parseRecords(text.replace(/^\uFEFF/, ""));
  if (!records?.length) return { ok: false, code: "invalid_csv" };
  const headers = records[0];
  if (
    headers.length !== resourceLocationCsvHeaders.length ||
    headers.some((header, index) => header !== resourceLocationCsvHeaders[index])
  ) return { ok: false, code: "unsupported_headers" };
  const rows = records.slice(1);
  if (rows.length > maximumRows) return { ok: false, code: "too_many_rows" };
  if (rows.some((row) => row.length !== resourceLocationCsvHeaders.length)) return { ok: false, code: "invalid_csv" };
  return {
    ok: true,
    rows: rows.map((row) => Object.fromEntries(resourceLocationCsvHeaders.map((header, index) => [header, safeCell(row[index])])) as ResourceLocationCsvRow),
    contentHashInput: JSON.stringify(rows)
  };
}

export function resourceLocationTemplateCsv() {
  return [
    resourceLocationCsvHeaders.join(","),
    "India,Odisha,Khordha,Bhubaneswar,Khandagiri,Baramunda,751030",
    "India,Odisha,Cuttack,,,,,"
  ].join("\r\n");
}

export function resourceLocationErrorsCsv(rows: Array<ResourceLocationCsvRow & { error: string }>) {
  return [
    [...resourceLocationCsvHeaders, "error"].join(","),
    ...rows.map((row) => [...resourceLocationCsvHeaders.map((header) => escapeCell(row[header])), escapeCell(row.error)].join(","))
  ].join("\r\n");
}

export function toResourceLocationErrorCsvRows(
  rows: Array<Partial<ResourceLocationCsvRow> & { errorCode?: string | null }>
): Array<ResourceLocationCsvRow & { error: string }> {
  return rows.map((row) => ({
    country: row.country ?? "",
    state: row.state ?? "",
    district: row.district ?? "",
    block: row.block ?? "",
    panchayat: row.panchayat ?? "",
    village: row.village ?? "",
    postalCode: row.postalCode ?? "",
    error: row.errorCode ?? "validation_failed"
  }));
}

export function downloadResourceLocationCsv(filename: string, contents: string) {
  const blob = new Blob(["\uFEFF", contents], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
