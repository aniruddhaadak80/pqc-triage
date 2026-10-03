"use client";

import { useState } from "react";
import { CLASS_LABELS, CLASS_LABELS_HUMAN } from "@/lib/corpus";
import type { ClassifierPrediction, CryptoFamily } from "@/lib/types";
import { Button, Note } from "./plate";

const EXAMPLE = "createCipheriv('des-ede3', key, iv) for the legacy store";

/**
 * The in-repo model, exposed. Classify a call site, then correct it: the
 * correction is persisted, the model retrains on the growing corpus, and the
 * answer on screen can change as a result. The tokens shown are the ones that
 * actually moved the decision.
 */
export function ClassifierPanel() {
  const [text, setText] = useState(EXAMPLE);
  const [prediction, setPrediction] = useState<ClassifierPrediction | null>(null);
  const [trainedExamples, setTrainedExamples] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function classify() {
    setStatus("working");
    setMessage(null);
    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as ClassifierPrediction & { error?: { message: string } };
      if (!response.ok || payload.error) {
        setStatus("error");
        setMessage(payload.error?.message ?? "The classifier did not answer.");
        return;
      }
      setPrediction(payload);
      setStatus("idle");
    } catch {
      setStatus("error");
      setMessage("The network request failed.");
    }
  }

  async function teach(label: CryptoFamily) {
    setStatus("working");
    setMessage(null);
    try {
      const response = await fetch("/api/classify", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, label }),
      });
      const payload = (await response.json()) as ClassifierPrediction & { error?: { message: string }; trainedExamples?: number };
      if (!response.ok || payload.error) {
        setStatus("error");
        setMessage(payload.error?.message ?? "The correction was not stored.");
        return;
      }
      setPrediction(payload);
      setTrainedExamples(payload.trainedExamples ?? null);
      setStatus("idle");
      setMessage(`Stored as "${label}". The model retrained and now predicts "${payload.family}".`);
    } catch {
      setStatus("error");
      setMessage("The network request failed.");
    }
  }

  return (
    <div className="grid gap-4">
      <label className="block">
        <span className="plate-label">A call site, config string or algorithm name</span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="readout mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.85rem]"
          maxLength={4000}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={classify} disabled={status === "working"}>
          {status === "working" ? "Classifying…" : "Classify"}
        </Button>
        <span className="readout self-center text-[0.7rem] text-ink-3">
          {prediction?.modelVersion ?? "nbc@1.0.0"}
          {prediction ? ` · ${prediction.trainedExamples} examples` : ""}
          {trainedExamples ? ` · grew to ${trainedExamples}` : ""}
        </span>
      </div>

      {message ? <Note tone={status === "error" ? "warn" : "ok"}>{message}</Note> : null}

      {prediction ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="plate-label">Ranked families</p>
            <ol className="mt-2 grid gap-1.5">
              {prediction.ranked.slice(0, 5).map((entry) => (
                <li key={entry.family} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_52px] items-center gap-2">
                  <span className="truncate text-[0.8rem]">{CLASS_LABELS_HUMAN[entry.family]}</span>
                  <span className="h-2 bg-paper-3" aria-hidden="true">
                    <span
                      className="block h-2 bg-order-2"
                      style={{ width: `${Math.round(entry.probability * 100)}%` }}
                    />
                  </span>
                  <span className="readout text-right text-[0.74rem] text-ink-2">
                    {(entry.probability * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-2">
              Predicted <span className="font-medium text-ink">{CLASS_LABELS_HUMAN[prediction.family]}</span> at{" "}
              <span className="readout">{(prediction.confidence * 100).toFixed(1)}%</span>.
            </p>

            <div className="mt-4">
              <p className="plate-label">Correct it</p>
              <p className="mt-1 text-[0.78rem] leading-relaxed text-ink-3">
                Corrections are stored for your anonymous owner and the model retrains immediately.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CLASS_LABELS.map((label) => (
                  <Button key={label} variant="outline" className="px-2 py-1 text-[0.74rem]" onClick={() => teach(label)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="plate-label">Tokens that moved it</p>
            {prediction.topTokens.length === 0 ? (
              <p className="mt-2 text-[0.82rem] text-ink-3">
                None of the discriminative tokens for this family appeared in the input.
              </p>
            ) : (
              <ul className="mt-2 grid gap-1.5">
                {prediction.topTokens.map((token) => (
                  <li key={token.token} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-2 border-b border-rule/70 pb-1">
                    <span className="readout truncate text-[0.78rem]">{token.token}</span>
                    <span className="readout text-right text-[0.74rem] text-ink-2">
                      {token.weight > 0 ? "+" : ""}
                      {token.weight.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[0.76rem] leading-relaxed text-ink-3">
              Weight is log P(token | class) minus the mean of log P(token | every other class), so a positive number
              means the token argues for that family over its rivals.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}