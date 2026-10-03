import type { SqlExecutor } from "./client";

/**
 * Embedded Postgres for local development, tests and CI. It is a real Postgres
 * compiled to WebAssembly, so the schema, indexes, constraints and SQL in this
 * project are the same SQL production runs. The data directory is gitignored
 * and disposable.
 *
 * PGlite is a single connection, so every statement is queued. Without the queue
 * two concurrent requests would interleave inside one another's BEGIN/COMMIT and
 * the second COMMIT would fail; the queue makes a transaction contiguous.
 */
export async function createPgliteExecutor(): Promise<SqlExecutor> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DATA_DIR?.trim() || ".pgdata";
  const db = await PGlite.create(dir);

  let chain: Promise<unknown> = Promise.resolve();

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = chain.then(fn, fn);
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  const direct: SqlExecutor = {
    label: "pglite-embedded",
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await db.query<T>(text, params as unknown[]);
      return { rows: result.rows ?? [] };
    },
  };

  return {
    label: "pglite-embedded",
    query<T>(text: string, params: readonly unknown[] = []) {
      return enqueue(() => direct.query<T>(text, params));
    },
    transaction<T>(fn: (exec: SqlExecutor) => Promise<T>) {
      return enqueue(async () => {
        await direct.query("BEGIN");
        try {
          const value = await fn(direct);
          await direct.query("COMMIT");
          return value;
        } catch (error) {
          try {
            await direct.query("ROLLBACK");
          } catch {
            /* the transaction is already gone; surface the original error */
          }
          throw error;
        }
      });
    },
  };
}