import { NextResponse } from "next/server";
import { ready } from "@/lib/bootstrap";
import { fail, route } from "@/lib/http";
import { auditTrail, verifySurvey } from "@/lib/service";

export const dynamic = "force-dynamic";

/** Replay the seal chain and report the first broken link. */
export const GET = route(async (request: Request) => {
  const { sessionId } = await ready();
  const surveyId = new URL(request.url).searchParams.get("survey");
  if (!surveyId) return fail({ code: "validation_error", message: "Add ?survey=<id> to verify a survey." });

  const report = await verifySurvey(sessionId, surveyId);
  if (new URL(request.url).searchParams.get("events") === "1") {
    const events = await auditTrail(sessionId, surveyId);
    return NextResponse.json({ report, events }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
});