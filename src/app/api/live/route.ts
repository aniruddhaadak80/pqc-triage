import { NextResponse } from "next/server";
import { ready } from "@/lib/bootstrap";
import { getLiveSignals } from "@/lib/live";
import { advisoriesFor, listSurveys, getSurvey, settingsFor } from "@/lib/service";
import { failFrom } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Live quantum and supply signals, normalized, with per-source status and never mixed with the sealed sample. */
export async function GET() {
  try {
    const { sessionId } = await ready();
    const settings = await settingsFor(sessionId);
    const summaries = await listSurveys(sessionId);
    const details = await Promise.all(summaries.slice(0, 5).map((summary) => getSurvey(sessionId, summary.id, settings)));
    const surfaces = details.flatMap((survey) => survey?.surfaces ?? []);
    const advisories = await advisoriesFor(surfaces);
    const signals = await getLiveSignals({ horizonYear: settings.horizonYear, advisories });
    return NextResponse.json(signals, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failFrom(error);
  }
}