import { SAMPLE_MANIFEST, SAMPLE_SOURCE } from "./extract";
import { ensureSchema } from "./db/migrate";
import { getDb } from "./db/client";
import { createSurvey } from "./service";
import { currentSessionId, ensureSessionRow } from "./session";

/**
 * One entry point for every request path: open the store, make sure the schema
 * exists, and make sure the caller has an owner row.
 *
 * The first request from a new visitor also imports the bundled sample manifest,
 * so the workbench has something real to show. Only the request that actually
 * inserts the session row performs that import, which keeps it idempotent under
 * concurrent first requests and guarantees it never touches user-created data.
 */
export async function ready(): Promise<{ db: Awaited<ReturnType<typeof getDb>>; sessionId: string; seeded: boolean }> {
  const db = await getDb();
  await ensureSchema(db);
  const sessionId = await currentSessionId();
  const isNew = await ensureSessionRow(db, sessionId);

  if (isNew) {
    await createSurvey(sessionId, {
      name: "Demo: billing-gateway",
      repoHint: "bundled sample manifest",
      manifest: SAMPLE_MANIFEST,
      source: SAMPLE_SOURCE,
    });
  }

  return { db, sessionId, seeded: isNew };
}