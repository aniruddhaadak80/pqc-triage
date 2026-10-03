import { NextResponse } from "next/server";
import { z } from "zod";
import { ready } from "@/lib/bootstrap";
import { SHORT_TEXT_MAX, fail, parseBody, route } from "@/lib/http";
import { consumeWrite } from "@/lib/session";
import { classifyText, modelForSession, teachClassifier } from "@/lib/service";
import { exportWeights } from "@/lib/classifier";
import { CLASS_LABELS } from "@/lib/corpus";
import type { CryptoFamily } from "@/lib/types";

export const dynamic = "force-dynamic";

const PredictSchema = z.object({ text: z.string().trim().min(2).max(SHORT_TEXT_MAX) });

const TeachSchema = z.object({
  text: z.string().trim().min(2).max(SHORT_TEXT_MAX),
  label: z.enum(CLASS_LABELS as unknown as [CryptoFamily, ...CryptoFamily[]]),
});

/** Classify a cryptographic call site with the in-repo Naive Bayes model. */
export const POST = route(async (request: Request) => {
  const { sessionId } = await ready();
  const body = await parseBody(request, PredictSchema);
  const prediction = await classifyText(sessionId, body.text);
  return NextResponse.json(prediction, { headers: { "cache-control": "no-store" } });
});

/** Teach it. The correction is persisted, the model retrains, and the answer can change. */
export const PUT = route(async (request: Request) => {
  const { sessionId } = await ready();
  const limit = consumeWrite(`model:${sessionId}`);
  if (!limit.allowed) return fail({ code: "rate_limited", message: "Too many corrections from this session." });
  const body = await parseBody(request, TeachSchema);
  const { prediction, trainedExamples } = await teachClassifier(sessionId, body.text, body.label);
  return NextResponse.json({ ...prediction, trainedExamples }, { headers: { "cache-control": "no-store" } });
});

/** The learned table, so a reviewer can audit what the model believes. */
export const GET = route(async () => {
  const { sessionId } = await ready();
  const model = await modelForSession(sessionId);
  return NextResponse.json(
    {
      modelVersion: model.version,
      trainedExamples: model.trainedExamples,
      labels: CLASS_LABELS,
      weights: exportWeights(model),
    },
    { headers: { "cache-control": "no-store" } },
  );
});