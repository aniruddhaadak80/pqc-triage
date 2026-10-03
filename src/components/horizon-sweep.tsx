"use client";

import { useMemo, useState } from "react";
import { MAX_HORIZON_YEAR, MIN_HORIZON_YEAR, NIST_TIMELINE } from "@/lib/crypto-registry";
import { analyzeSurvey, engineContext } from "@/lib/engine";
import type { Survey } from "@/lib/types";
import { FringePlate } from "./fringe-plate";
import { BandChip, Button, Note, Readout, formatWindow, windowHint } from "./plate";

/**
 * The signature interaction.
 *
 * Dragging the horizon runs the *same* `analyzeSurvey` function in the browser
 * that the REST endpoint and the agent tool run on the server, so the fringes
 * cannot drift from the numbers. Committing writes the horizon through the API,
 * which recomputes server-side and appends a sealed audit event; the badge then
 * reports whether the server's score matched the one on screen.
 */
export function HorizonSweep({ survey }: { survey: Survey }) {
  const [horizon, setHorizon] = useState(survey.horizonYear);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [serverScore, setServerScore] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const analysis = useMemo(
    () => analyzeSurvey(survey.id, survey.surfaces, engineContext(horizon)),
    [survey, horizon],
  );

  const nowYear = new Date().getUTCFullYear();
  const dirty = horizon !== survey.horizonYear;

  async function commit() {
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/surveys/${survey.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ horizonYear: horizon }),
      });
      const payload = (await response.json()) as { analysis?: { score: number } | null; error?: { message: string } };
      if (!response.ok || payload.error) {
        setStatus("error");
        setMessage(payload.error?.message ?? "The horizon could not be saved.");
        return;
      }
      const server = payload.analysis?.score ?? null;
      setServerScore(server);
      setStatus("saved");
      setMessage(
        server === null
          ? "Horizon saved and sealed."
          : server === analysis.score
            ? `Horizon saved and sealed. Server recomputed ${server}/100, matching the plate.`
            : `Horizon saved and sealed. Server recomputed ${server}/100 against ${analysis.score} on screen; reload to see the stored value.`,
      );
    } catch {
      setStatus("error");
      setMessage("The network request failed. Nothing was changed.");
    }
  }

  const fringes = analysis.surfaces.slice(0, 40).map((assessment) => {
    const surface = survey.surfaces.find((entry) => entry.id === assessment.surfaceId);
    return {
      id: assessment.surfaceId,
      label: surface?.label ?? assessment.surfaceId,
      score: assessment.score,
      band: assessment.band,
      decryptableFrom: assessment.decryptableFrom,
      mustStartBy: assessment.mustStartBy,
    };
  });

  return (
    <section aria-labelledby="sweep-heading" className="border border-rule bg-paper-2/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="plate-label">Signature: threat horizon sweep</p>
          <h3 id="sweep-heading" className="display mt-1 text-lg font-semibold">
            Move the horizon and watch every deadline move
          </h3>
        </div>
        <BandChip band={analysis.band} score={analysis.score} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <FringePlate
            items={fringes}
            nowYear={nowYear}
            horizonYear={horizon}
            deprecateYear={NIST_TIMELINE.deprecateBy}
            disallowYear={NIST_TIMELINE.disallowFrom}
          />
          <p className="mt-2 text-[0.76rem] leading-relaxed text-ink-3">
            Each bar is one discovered surface. Height is the engine score; position is the year data captured
            today becomes decryptable at this horizon. The double rule marks the year NIST deprecates 112-bit
            public key and the year it disallows it.
          </p>
        </div>

        <div className="min-w-0">
          <label htmlFor="horizon-slider" className="plate-label">
            Quantum-capability horizon (H)
          </label>
          <input
            id="horizon-slider"
            type="range"
            min={MIN_HORIZON_YEAR}
            max={MAX_HORIZON_YEAR}
            step={1}
            value={horizon}
            onChange={(event) => {
              setHorizon(Number(event.target.value));
              setStatus("idle");
              setMessage("");
            }}
            className="mt-2 w-full accent-[var(--color-order-2)]"
            aria-describedby="horizon-value"
          />
          <p id="horizon-value" className="readout mt-1 text-2xl font-semibold leading-none">
            {horizon}
          </p>
          <p className="mt-1 text-[0.74rem] leading-snug text-ink-3">
            {horizon - nowYear} years from now. Below {NIST_TIMELINE.deprecateBy} the NIST deadline dominates; above
            it, your own horizon does.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-rule pt-3">
            <Readout label="Exposure" value={formatWindow(analysis.exposureYears)} hint={windowHint(analysis.exposureYears)} />
            <Readout label="Overdue" value={analysis.overdueCount} hint="past their start date" />
            <Readout label="After decisions" value={analysis.residualScore} hint={`${analysis.residualBand} residual`} />
            <Readout label="Triaged" value={`${analysis.triagedCount}/${analysis.surfaceCount}`} hint="decisions recorded" />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={commit} disabled={!dirty || status === "saving"} className="w-full">
              {status === "saving" ? "Committing…" : dirty ? `Commit horizon ${horizon}` : "Horizon committed"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setHorizon(survey.horizonYear);
                setStatus("idle");
                setMessage("");
              }}
              disabled={!dirty}
            >
              Revert to stored value
            </Button>
          </div>

          {message ? (
            <div className="mt-3">
              <Note tone={status === "error" ? "warn" : "ok"}>{message}</Note>
            </div>
          ) : null}
          {status === "saved" && serverScore !== null ? (
            <p className="readout mt-2 text-[0.7rem] text-ink-3">audit event sealed · stored score {serverScore}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}