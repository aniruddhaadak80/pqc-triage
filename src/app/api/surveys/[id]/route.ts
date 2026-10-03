import { NextResponse } from "next/server";
import { z } from "zod";
import { ready } from "@/lib/bootstrap";
import { MAX_HORIZON_YEAR, MIN_HORIZON_YEAR } from "@/lib/crypto-registry";
import { LIMITS, fail, parseBody, route } from "@/lib/http";
import { consumeWrite } from "@/lib/session";
import { deleteSurvey, getSurvey, updateSurvey } from "@/lib/service";

export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(LIMITS.nameChars).optional(),
    shared: z.boolean().optional(),
    horizonYear: z.number().int().min(MIN_HORIZON_YEAR).max(MAX_HORIZON_YEAR).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Send at least one field to change." });

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { sessionId } = await ready();
  const survey = await getSurvey(sessionId, id);
  if (!survey) return fail({ code: "not_found", message: "No such survey in this session." });
  return NextResponse.json(survey, { headers: { "cache-control": "no-store" } });
});

export const PATCH = route(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { sessionId } = await ready();
  const limit = consumeWrite(`survey:${sessionId}`);
  if (!limit.allowed) return fail({ code: "rate_limited", message: "Too many writes from this anonymous session." });
  const body = await parseBody(request, PatchSchema);
  const survey = await updateSurvey(sessionId, id, body);
  return NextResponse.json(survey);
});

export const DELETE = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const { sessionId } = await ready();
  const limit = consumeWrite(`survey:${sessionId}`);
  if (!limit.allowed) return fail({ code: "rate_limited", message: "Too many writes from this anonymous session." });
  const result = await deleteSurvey(sessionId, id);
  return NextResponse.json({ ...result, status: "retired", surfacesRetainedAsTombstones: true });
});