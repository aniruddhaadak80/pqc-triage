import { NextResponse } from "next/server";
import { z } from "zod";
import { ready } from "@/lib/bootstrap";
import { MAX_SHELF_LIFE, MIN_SHELF_LIFE } from "@/lib/crypto-registry";
import { LIMITS, fail, parseBody, route } from "@/lib/http";
import { consumeWrite } from "@/lib/session";
import { deleteSurface, getSurvey, listSurveys, updateSurface } from "@/lib/service";

export const dynamic = "force-dynamic";

const USAGES = [
  "data-at-rest",
  "data-in-transit",
  "session-establishment",
  "code-signing",
  "certificate-authority",
  "password-storage",
  "key-generation",
  "unknown",
] as const;

const FAMILIES = [
  "hash",
  "mac",
  "symmetric-cipher",
  "stream-cipher",
  "kex-public",
  "signature-public",
  "password-hash",
  "kdf",
  "rng",
  "unknown",
] as const;

const DECISIONS = ["untriaged", "migrate-now", "scheduled", "accepted-risk", "not-applicable"] as const;

const PatchSchema = z
  .object({
    decision: z.enum(DECISIONS).optional(),
    decisionNote: z.string().max(LIMITS.noteInputChars).optional(),
    shelfLifeYears: z.number().int().min(MIN_SHELF_LIFE).max(MAX_SHELF_LIFE).optional(),
    usage: z.enum(USAGES).optional(),
    family: z.enum(FAMILIES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Send at least one field to change." });

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { sessionId } = await ready();
  for (const summary of await listSurveys(sessionId, { includeRetired: true })) {
    const survey = await getSurvey(sessionId, summary.id);
    const surface = survey?.surfaces.find((entry) => entry.id === id);
    if (surface) return NextResponse.json(surface, { headers: { "cache-control": "no-store" } });
  }
  return fail({ code: "not_found", message: "No such surface in this session." });
});

export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { sessionId } = await ready();
  const limit = consumeWrite(`surface:${sessionId}`);
  if (!limit.allowed) return fail({ code: "rate_limited", message: "Too many writes from this anonymous session." });
  const body = await parseBody(request, PatchSchema);
  const surface = await updateSurface(sessionId, id, body);
  const survey = await getSurvey(sessionId, surface.surveyId);
  return NextResponse.json(
    {
      surface,
      analysis: survey?.analysis ?? null,
      seal: survey?.lastSeal ?? null,
      eventCount: survey?.eventCount ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
});

export const DELETE = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { sessionId } = await ready();
  const limit = consumeWrite(`surface:${sessionId}`);
  if (!limit.allowed) return fail({ code: "rate_limited", message: "Too many writes from this anonymous session." });
  const result = await deleteSurface(sessionId, id);
  return NextResponse.json({ ...result, tombstone: true });
});