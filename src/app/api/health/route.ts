import { NextResponse } from "next/server";
import { ready } from "@/lib/bootstrap";
import { activeStoreKind, getDb, onVercel } from "@/lib/db/client";
import { ENGINE_VERSION } from "@/lib/engine";
import { SEAL_ALGORITHM } from "@/lib/seal";
import type { HealthReport } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Proves the production store with a real insert, read and delete, so a green
 * health check cannot be a static object. It fails loudly if a Vercel runtime
 * ever falls through to the embedded adapter.
 */
export async function GET() {
  const kind = activeStoreKind();

  try {
    const db = await getDb();
    await ready();

    const probeId = `health-probe-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO sessions (id, created_at, last_seen_at) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
      [probeId, now, now],
    );
    const readBack = await db.query<{ id: string }>("SELECT id FROM sessions WHERE id = $1", [probeId]);
    await db.query("DELETE FROM sessions WHERE id = $1", [probeId]);

    const report: HealthReport = {
      status: "ok",
      store: kind,
      storeDetail:
        kind === "neon-postgres"
          ? "hosted Postgres reached over the serverless driver; insert, read-back and delete all succeeded"
          : `embedded PGlite at ${process.env.PGLITE_DATA_DIR ?? ".pgdata"}; insert, read-back and delete all succeeded${
              onVercel() ? " (unexpected in a Vercel runtime)" : ""
            }`,
      writeProbe: readBack.rows.length === 1,
      engineVersion: ENGINE_VERSION,
      sealAlgorithm: SEAL_ALGORITHM,
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString(),
    };

    return NextResponse.json(report, {
      status: report.writeProbe ? 200 : 500,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const body: HealthReport = {
      status: "degraded",
      store: kind,
      storeDetail: error instanceof Error ? error.message : "store unavailable",
      writeProbe: false,
      engineVersion: ENGINE_VERSION,
      sealAlgorithm: SEAL_ALGORITHM,
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
    return NextResponse.json(body, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: { code: "validation_error", message: "Health is a read-only probe.", details: null } },
    { status: 405 },
  );
}
