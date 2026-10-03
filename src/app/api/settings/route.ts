import { NextResponse } from "next/server";
import { z } from "zod";
import { ready } from "@/lib/bootstrap";
import { MAX_HORIZON_YEAR, MIN_HORIZON_YEAR } from "@/lib/crypto-registry";
import { parseBody, route } from "@/lib/http";
import { DEFAULT_SETTINGS, consumeWrite, getSettings, putSettings } from "@/lib/session";

export const dynamic = "force-dynamic";

const PutSchema = z
  .object({
    horizonYear: z.number().int().min(MIN_HORIZON_YEAR).max(MAX_HORIZON_YEAR),
    criticalThreshold: z.number().int().min(1).max(100).default(DEFAULT_SETTINGS.criticalThreshold),
    highThreshold: z.number().int().min(1).max(100).default(DEFAULT_SETTINGS.highThreshold),
    leadTimeYears: z.number().min(0).max(20).default(DEFAULT_SETTINGS.leadTimeYears),
  })
  .refine((value) => value.highThreshold < value.criticalThreshold, {
    message: "The high band must sit below the critical band.",
  });

export const GET = route(async () => {
  const { db, sessionId } = await ready();
  const settings = await getSettings(db, sessionId);
  return NextResponse.json(
    { settings, defaults: DEFAULT_SETTINGS, limits: { minHorizon: MIN_HORIZON_YEAR, maxHorizon: MAX_HORIZON_YEAR } },
    { headers: { "cache-control": "no-store" } },
  );
});

export const PUT = route(async (request: Request) => {
  const { db, sessionId } = await ready();
  const limit = consumeWrite(`settings:${sessionId}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many writes from this anonymous session.", details: null } },
      { status: 429 },
    );
  }
  const body = await parseBody(request, PutSchema);
  const settings = await putSettings(db, sessionId, body);
  return NextResponse.json({ settings }, { headers: { "cache-control": "no-store" } });
});