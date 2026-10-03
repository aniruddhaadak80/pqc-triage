import { NextResponse } from "next/server";
import { z } from "zod";
import { ready } from "@/lib/bootstrap";
import { MAX_SHELF_LIFE, MIN_SHELF_LIFE } from "@/lib/crypto-registry";
import { LIMITS, fail, parseBody, route } from "@/lib/http";
import { consumeWrite } from "@/lib/session";
import { addSurface, getSurvey } from "@/lib/service";

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

const AddSchema = z.object({
  label: z.string().trim().min(1).max(160),
  primitive: z.string().trim().min(1).max(80),
  usage: z.enum(USAGES).optional(),
  shelfLifeYears: z.number().int().min(MIN_SHELF_LIFE).max(MAX_SHELF_LIFE).optional(),
  location: z.string().trim().max(240).optional(),
  evidence: z.string().trim().max(LIMITS.noteChars).optional(),
});

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { sessionId } = await ready();
  const survey = await getSurvey(sessionId, id);
  if (!survey) return fail({ code: "not_found", message: "No such survey in this session." });
  return NextResponse.json({ surfaces: survey.surfaces, analysis: survey.analysis }, { headers: { "cache-control": "no-store" } });
});

export const POST = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { sessionId } = await ready();
  const limit = consumeWrite(`survey:${sessionId}`);
  if (!limit.allowed) return fail({ code: "rate_limited", message: "Too many writes from this anonymous session." });
  const body = await parseBody(request, AddSchema);
  const surface = await addSurface(sessionId, id, body);
  return NextResponse.json(surface, { status: 201 });
});