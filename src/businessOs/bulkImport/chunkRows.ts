import type { BulkImportCancellationToken } from "./contracts.ts";

export function chunkRows<T>(rows: readonly T[], chunkSize: number): T[][] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("chunkSize must be a positive integer");
  }
  if (rows.length === 0) return [];

  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function processBulkImportChunks<T>(
  rows: readonly T[],
  chunkSize: number,
  token: BulkImportCancellationToken,
  handler: (chunk: readonly T[], chunkIndex: number) => void | Promise<void>
): Promise<number> {
  const chunks = chunkRows(rows, chunkSize);
  let processedChunks = 0;

  for (const [chunkIndex, chunk] of chunks.entries()) {
    token.throwIfCancelled();
    await handler(chunk, chunkIndex);
    processedChunks += 1;
  }

  return processedChunks;
}
