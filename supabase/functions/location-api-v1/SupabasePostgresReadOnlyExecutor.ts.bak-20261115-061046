import { Pool } from "jsr:@db/postgres@^0";
import type { PostgresReadOnlyQueryExecutor } from "../../../src/businessOs/geography/PostgresCanonicalLocationRepository.ts";

function isReadOnlySelect(statement: string): boolean {
  return /^\s*select\b/iu.test(statement);
}

/** Edge-only adapter for the private canonical Postgres schema. */
export class SupabasePostgresReadOnlyExecutor implements PostgresReadOnlyQueryExecutor {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool(connectionString, 1);
  }

  async query<Row extends Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[]
  ): Promise<readonly Row[]> {
    if (!isReadOnlySelect(statement)) throw new Error("Location repository accepts SELECT statements only.");
    const connection = await this.pool.connect();
    let transactionOpen = false;
    try {
      await connection.queryArray("begin read only");
      transactionOpen = true;
      const result = await connection.queryObject<Row>({ text: statement, args: [...parameters] });
      await connection.queryArray("rollback");
      transactionOpen = false;
      return result.rows;
    } finally {
      if (transactionOpen) {
        try { await connection.queryArray("rollback"); } catch { /* preserve the query error */ }
      }
      connection.release();
    }
  }
}
