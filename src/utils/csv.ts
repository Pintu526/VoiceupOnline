export function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];
  const headers = splitCsvLine(headerLine).map((header) => normalizeCsvHeader(header));
  return dataLines.map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      if (!header) return row;
      row[header] = values[index]?.trim() ?? "";
      return row;
    }, {});
  });
}

export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function normalizeCsvHeader(header: string): string {
  const trimmedHeader = header.replace(/^\uFEFF/, "").trim();
  const normalized = trimmedHeader
    .replace(/^\uFEFF/, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
  return normalized ? normalized[0].toLowerCase() + normalized.slice(1) : normalized;
}

export function getCsvColumns(rows: Array<Record<string, string>>): string[] {
  return rows[0] ? Object.keys(rows[0]) : [];
}

export function getCsvValue(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const exactValue = row[key];
    if (exactValue !== undefined && exactValue.trim()) return exactValue.trim();

    const normalizedKey = normalizeCsvHeader(key);
    const matchingKey = Object.keys(row).find(
      (rowKey) => normalizeCsvHeader(rowKey) === normalizedKey
    );
    const matchingValue = matchingKey ? row[matchingKey] : undefined;
    if (matchingValue !== undefined && matchingValue.trim()) return matchingValue.trim();
  }
  return "";
}
