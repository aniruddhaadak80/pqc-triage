/**
 * The persistence adapter boundary.
 *
 * One `SqlExecutor` contract, two implementations:
 *  - `neon-postgres`  production, a pooled hosted Postgres that survives
 *    redeploys and cold starts;
 *  - `pglite-embedded` local development and tests, a real Postgres compiled to
 *    WebAssembly with a schema and the same SQL, so nothing is stubbed.
 *
 * A production build on Vercel without `DATABASE_URL` refuses to open a
 * connection rather than silently degrading to an ephemeral store.
 */

export type QueryResult<T> = { rows: T[] };

export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  transaction?<T>(fn: (exec: SqlExecutor) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
  label: string;
}

export type StoreKind = "neon-postgres" | "pglite-embedded";

type GlobalCache = {
  executor?: SqlExecutor;
  store?: StoreKind;
  ready?: Promise<void>;
};

const cache: GlobalCache = (globalThis as { __pqcDb?: GlobalCache }).__pqcDb ?? {};
(globalThis as { __pqcDb?: GlobalCache }).__pqcDb = cache;

export function onVercel(): boolean {
  return process.env.VERCEL === "1";
}

export function hasHostedDatabaseUrl(): boolean {
  const value = process.env.DATABASE_URL?.trim();
  return Boolean(value && (value.startsWith("postgres://") || value.startsWith("postgresql://")));
}

export function storeKind(): StoreKind {
  if (hasHostedDatabaseUrl()) return "neon-postgres";
  return "pglite-embedded";
}

export function assertStoreUsable(kind: StoreKind): void {
  if (kind === "pglite-embedded" && onVercel()) {
    throw new Error(
      "Refusing to run on the embedded local store in a Vercel production runtime. Set DATABASE_URL.",
    );
  }
}

async function createExecutor(): Promise<{ executor: SqlExecutor; store: StoreKind }> {
  // Decide and validate the store before anything touches the filesystem: on a
  // serverless runtime the embedded adapter would otherwise fail with an
  // opaque read-only-filesystem error instead of a sentence explaining itself.
  const kind = storeKind();
  assertStoreUsable(kind);

  if (kind === "neon-postgres") {
    const { createNeonExecutor } = await import("./neon");
    return { executor: await createNeonExecutor(process.env.DATABASE_URL!.trim()), store: kind };
  }
  const { createPgliteExecutor } = await import("./pglite");
  return { executor: await createPgliteExecutor(), store: kind };
}

export async function getDb(): Promise<SqlExecutor> {
  if (cache.executor) return cache.executor;
  if (!cache.ready) {
    cache.ready = createExecutor().then(({ executor, store }) => {
      cache.executor = executor;
      cache.store = store;
    });
  }
  await cache.ready;
  return cache.executor!;
}

export function activeStoreKind(): StoreKind {
  return cache.store ?? storeKind();
}

/**
 * Run a callback inside a transaction. The Neon path checks out a dedicated
 * client so BEGIN/COMMIT share one session; PGlite is single-connection, so the
 * statements go straight through.
 */
export async function withTransaction<T>(fn: (exec: SqlExecutor) => Promise<T>): Promise<T> {
  const db = await getDb();
  if (db.transaction) return db.transaction(fn);
  await db.query("BEGIN");
  try {
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      /* the transaction is already gone; surface the original error */
    }
    throw error;
  }
}

/** Test hook: drop the cached executor so a suite can swap environments. */
export async function resetDbForTests(): Promise<void> {
  if (cache.executor?.close) await cache.executor.close();
  cache.executor = undefined;
  cache.store = undefined;
  cache.ready = undefined;
}