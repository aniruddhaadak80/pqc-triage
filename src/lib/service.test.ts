import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "./db/client";
import { ensureSchema } from "./db/migrate";
import { readIdempotent, writeIdempotent } from "./service";

/**
 * The idempotency table is written on every mutating agent tool, and a hosted
 * database keeps it between runs, so these assertions run against a real
 * Postgres (PGlite) rather than a stub.
 *
 * The regression: the table used to be keyed on `key` alone while every read
 * filtered on the owner. Two anonymous sessions that chose the same idempotency
 * key therefore collided, the first insert won, and the second session could
 * never cache its own response. That is invisible in a throwaway local
 * database and shows up as an idempotency replay that never replays.
 */
process.env.PGLITE_DATA_DIR = mkdtempSync(join(tmpdir(), "pqc-triage-idem-"));

const SCOPE = "record_decision";
const KEY = "shared-key";

describe("idempotency keys", () => {
  beforeAll(async () => {
    await ensureSchema(await getDb());
  }, 180_000);

  afterAll(async () => {
    await resetDbForTests();
  });

  it("caches a response for the session that wrote it", async () => {
    await writeIdempotent("session-a", SCOPE, KEY, { surface: "a" });
    expect(await readIdempotent("session-a", SCOPE, KEY)).toEqual({ surface: "a" });
  });

  it("lets a second session reuse the same key without stealing the first response", async () => {
    await writeIdempotent("session-b", SCOPE, KEY, { surface: "b" });
    expect(await readIdempotent("session-b", SCOPE, KEY)).toEqual({ surface: "b" });
    expect(await readIdempotent("session-a", SCOPE, KEY)).toEqual({ surface: "a" });
  });

  it("replays the stored response on a repeat call by the same session", async () => {
    await writeIdempotent("session-c", SCOPE, "repeat", { surface: "c" });
    await writeIdempotent("session-c", SCOPE, "repeat", { surface: "c-mutated" });
    expect(await readIdempotent("session-c", SCOPE, "repeat")).toEqual({ surface: "c" });
  });

  it("keeps scopes apart", async () => {
    await writeIdempotent("session-a", SCOPE, "scoped", { scope: "decision" });
    expect(await readIdempotent("session-a", "import_survey", "scoped")).toBeNull();
  });

  it("returns null for an unknown key and never writes without one", async () => {
    expect(await readIdempotent("session-a", SCOPE, "never-seen")).toBeNull();
    await writeIdempotent("session-a", SCOPE, null, { ignored: true });
    expect(await readIdempotent("session-a", SCOPE, null)).toBeNull();
  });
});