import { NextResponse } from "next/server";
import { z } from "zod";
import { ready } from "@/lib/bootstrap";
import { LIMITS, fail, parseBody, route } from "@/lib/http";
import { consumeWrite } from "@/lib/session";
import { createSurvey, listSurveys } from "@/lib/service";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.nameChars),
  repoHint: z.string().trim().max(160).default(""),
  manifest: z.string().max(LIMITS.manifestChars).default(""),
  source: z.string().max(LIMITS.sourceChars).default(""),
});

export const GET = route(async () => {
  const { sessionId } = await ready();
  const surveys = await listSurveys(sessionId);
  return NextResponse.json({ surveys, count: surveys.length }, { headers: { "cache-control": "no-store" } });
});

export const POST = route(async (request: Request) => {
  const { sessionId } = await ready();
  const limit = consumeWrite(`survey:${sessionId}`);
  if (!limit.allowed) {
    return fail({
      code: "rate_limited",
      message: "Too many writes from this anonymous session. Wait a minute and try again.",
    });
  }

  const body = await parseBody(request, CreateSchema);
  if (!body.manifest.trim() && !body.source.trim()) {
    return fail({
      code: "validation_error",
      message: "Paste a dependency manifest or a source excerpt so there is something real to triage.",
    });
  }

  const result = await createSurvey(sessionId, body);
  return NextResponse.json(result, { status: 201 });
});

export const PUT = route(async () => fail({ code: "validation_error", message: "Use PATCH on /api/surveys/:id." }));