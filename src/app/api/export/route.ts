import { ready } from "@/lib/bootstrap";
import { fail, route } from "@/lib/http";
import { buildExport, type ExportFormat } from "@/lib/export";
import { getSurvey, settingsFor } from "@/lib/service";

export const dynamic = "force-dynamic";

const FORMATS: ExportFormat[] = ["md", "json", "csv"];

/** Download a real migration plan. Only an owner can export, and only for a live survey. */
export const GET = route(async (request: Request) => {
  const { sessionId } = await ready();
  const url = new URL(request.url);
  const surveyId = url.searchParams.get("survey");
  const formatParam = url.searchParams.get("format") ?? "md";
  const format = (FORMATS as string[]).includes(formatParam) ? (formatParam as ExportFormat) : null;

  if (!surveyId) return fail({ code: "validation_error", message: "Add ?survey=<id> to choose a survey." });
  if (!format) return fail({ code: "validation_error", message: "format must be one of md, json, csv." });

  const settings = await settingsFor(sessionId);
  const survey = await getSurvey(sessionId, surveyId, settings);
  if (!survey) return fail({ code: "not_found", message: "No such survey in this session." });

  const payload = buildExport(survey, format);
  return new Response(payload.body, {
    status: 200,
    headers: {
      "content-type": payload.contentType,
      "content-disposition": `attachment; filename="${payload.filename}"`,
      "cache-control": "no-store",
      "x-export-survey": survey.id,
      "x-export-seal": survey.lastSeal,
    },
  });
});