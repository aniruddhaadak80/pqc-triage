"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MAX_HORIZON_YEAR, MIN_HORIZON_YEAR, NIST_TIMELINE } from "@/lib/crypto-registry";
import { analyzeSurvey, engineContext } from "@/lib/engine";
import type { Survey } from "@/lib/types";
import { BandChip, Button, Note, SpectralRule, formatWindow } from "./plate";

/**
 * Cross-survey what-if. The scenario numbers come from `analyzeSurvey` again, so
 * the table cannot drift from the workbench. "Apply to all" is a real bulk
 * write: one PATCH per survey, each one sealed.
 */
export function ScenarioTable({ surveys, storedHorizon }: { surveys: Survey[]; storedHorizon: number }) {
  const router = useRouter();
  const [horizon, setHorizon] = useState(storedHorizon);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenarios = [MIN_HORIZON_YEAR, NIST_TIMELINE.deprecateBy, storedHorizon, NIST_TIMELINE.disallowFrom, MAX_HORIZON_YEAR]
    .filter((year, index, all) => year >= MIN_HORIZON_YEAR && all.indexOf(year) === index)
    .sort((a, b) => a - b);

  const rows = useMemo(
    () =>
      surveys.map((survey) => ({
        id: survey.id,
        name: survey.name,
        surfaces: survey.surfaces.length,
        results: scenarios.map((year) => {
          const analysis = analyzeSurvey(survey.id, survey.surfaces, engineContext(year));
          return { year, score: analysis.score, band: analysis.band, exposure: analysis.exposureYears, overdue: analysis.overdueCount };
        }),
      })),
    [surveys, scenarios],
  );

  const atChosen = useMemo(
    () =>
      surveys.map((survey) => {
        const analysis = analyzeSurvey(survey.id, survey.surfaces, engineContext(horizon));
        return { id: survey.id, name: survey.name, analysis };
      }),
    [surveys, horizon],
  );

  const dirty = horizon !== storedHorizon;

  async function applyToAll() {
    setApplying(true);
    setMessage(null);
    setError(null);
    const results: string[] = [];
    for (const survey of surveys) {
      try {
        const response = await fetch(`/api/surveys/${survey.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ horizonYear: horizon }),
        });
        const payload = (await response.json()) as { error?: { message: string } };
        results.push(response.ok && !payload.error ? `${survey.name}: saved` : `${survey.name}: ${payload.error?.message ?? "failed"}`);
      } catch {
        results.push(`${survey.name}: network failure`);
      }
    }
    const failed = results.filter((line) => !line.endsWith(": saved"));
    setMessage(`${results.filter((line) => line.endsWith(": saved")).length} of ${results.length} surveys updated.`);
    setError(failed.length ? failed.join(" · ") : null);
    setApplying(false);
    router.refresh();
  }

  if (surveys.length === 0) {
    return <Note tone="info">No surveys yet. Import one and the scenario table fills in.</Note>;
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border border-rule bg-paper-2/40 p-4">
        <div>
          <label htmlFor="analyze-horizon" className="plate-label">
            Scenario horizon (H)
          </label>
          <input
            id="analyze-horizon"
            type="range"
            min={MIN_HORIZON_YEAR}
            max={MAX_HORIZON_YEAR}
            step={1}
            value={horizon}
            onChange={(event) => {
              setHorizon(Number(event.target.value));
              setMessage(null);
              setError(null);
            }}
            className="mt-2 w-64 accent-[var(--color-order-2)]"
          />
          <p className="readout mt-1 text-2xl font-semibold leading-none">{horizon}</p>
        </div>
        <div className="grid gap-2">
          <Button onClick={applyToAll} disabled={!dirty || applying}>
            {applying ? "Applying…" : `Apply ${horizon} to all ${surveys.length} surveys`}
          </Button>
          <Button
            variant="ghost"
            disabled={!dirty}
            onClick={() => {
              setHorizon(storedHorizon);
              setMessage(null);
              setError(null);
            }}
          >
            Revert to stored horizon
          </Button>
        </div>
      </div>

      {message ? <Note tone="ok">{message}</Note> : null}
      {error ? <Note tone="warn">{error}</Note> : null}

      <div className="overflow-x-auto border border-rule">
        <table className="w-full min-w-[720px] text-left text-[0.82rem]">
          <thead className="bg-paper-2/70">
            <tr className="readout text-[0.65rem] uppercase tracking-[0.1em] text-ink-3">
              <th scope="col" className="px-3 py-2 font-normal">Survey</th>
              {scenarios.map((year) => (
                <th key={year} scope="col" className="px-3 py-2 text-right font-normal">
                  H={year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-rule">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="font-medium">{row.name}</span>
                  <span className="readout ml-2 text-[0.72rem] text-ink-3">{row.surfaces} surfaces</span>
                </th>
                {row.results.map((result) => (
                  <td key={result.year} className="readout px-3 py-2 text-right">
                    <span className="block font-medium">{result.score}</span>
                    <span className="block text-[0.72rem] text-ink-3">
                      {formatWindow(result.exposure)} · {result.overdue} late
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <SpectralRule className="mb-4" />
        <ul className="grid gap-3">
          {atChosen.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 border border-rule bg-paper px-3 py-2.5">
              <span className="text-[0.9rem] font-medium">{entry.name}</span>
              <span className="flex flex-wrap items-center gap-3">
                <span className="readout text-[0.8rem] text-ink-2">
                  {entry.analysis.surfaceCount} surfaces · {entry.analysis.triagedCount} triaged · first break in{" "}
                  {entry.analysis.exposureYears}y
                </span>
                <BandChip band={entry.analysis.band} score={entry.analysis.score} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}