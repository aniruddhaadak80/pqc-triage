import type { SqlExecutor } from "./client";

/**
 * Hosted Postgres adapter. Uses the pooled `Pool` from @neondatabase/serverless
 * so a transaction runs on one dedicated connection instead of a fresh HTTP
 * request per statement.
 */

export async function createNeonExecutor(connectionString: string): Promise<SqlExecutor> {
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 30_000 });

  const exec: SqlExecutor = {
    label: "neon-postgres",
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await pool.query(text, params as unknown[]);
      return { rows: (result.rows ?? []) as T[] };
    },
    async transaction<T>(fn: (exec2: SqlExecutor) => Promise<T>) {
      const client = await pool.connect();
      const scoped: SqlExecutor = {
        label: "neon-postgres",
        query: async <R>(text: string, params: readonly unknown[] = []) => {
          const result = await client.query(text, params as unknown[]);
          return { rows: (result.rows ?? []) as R[] };
        },
      };
      try {
        await scoped.query("BEGIN");
        const value = await fn(scoped);
        await scoped.query("COMMIT");
        return value;
      } catch (error) {
        try {
          await scoped.query("ROLLBACK");
        } catch {
          /* original error wins */
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };

  return exec;
}