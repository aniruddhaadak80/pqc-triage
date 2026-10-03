import Link from "next/link";
import { ready } from "@/lib/bootstrap";
import { listSurveys, getSurvey, settingsFor } from "@/lib/service";
import { BandChip, Card, EmptyState, Readout, SectionHead, SpectralRule, formatWindow, windowHint } from "@/components/plate";
import type { RiskBand } from "@/lib/types";
import { GitHubMark } from "@/components/github-mark";
import { site } from "@/config/site";

export const dynamic = "force-dynamic";

const BANDS: RiskBand[] = ["critical", "high", "medium", "low", "clear"];
const SORTS = ["score", "recent", "name", "exposure"] as const;
type Sort = (typeof SORTS)[number];

export const metadata = { title: "Surveys" };

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const band = BANDS.includes(params.band as RiskBand) ? (params.band as RiskBand) : null;
  const sort = (SORTS as readonly string[]).includes(params.sort ?? "") ? (params.sort as Sort) : "recent";

  const { sessionId } = await ready();
  const settings = await settingsFor(sessionId);
  const summaries = await listSurveys(sessionId);
  const surveys = await Promise.all(summaries.map((summary) => getSurvey(sessionId, summary.id, settings)));

  const rows = surveys
    .filter((survey): survey is NonNullable<typeof survey> => Boolean(survey))
    .map((survey) => ({
      survey,
      score: survey.analysis?.score ?? 0,
      band: (survey.analysis?.band ?? "clear") as RiskBand,
      exposure: survey.analysis?.exposureYears ?? 0,
    }))
    .filter((row) => (band ? row.band === band : true));

  rows.sort((a, b) => {
    if (sort === "score") return b.score - a.score;
    if (sort === "name") return a.survey.name.localeCompare(b.survey.name);
    if (sort === "exposure") return a.exposure - b.exposure;
    return b.survey.createdAt.localeCompare(a.survey.createdAt);
  });

  const counts = BANDS.map((value) => ({ value, n: rows.filter((row) => row.band === value).length }));

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <SectionHead
        index="Workspace"
        title="Your surveys"
        lede="Each survey is one imported manifest. Scores are recomputed on read from the same engine the REST endpoints and the agent tools use, so a number here is never stale."
        aside={
          <div className="flex flex-wrap gap-2">
            <Link href="/surveys/new" className="border border-ink bg-ink px-3.5 py-2 text-[0.85rem] font-medium text-paper hover:bg-ink-2">
              New survey
            </Link>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 border border-rule bg-paper-2 px-3 py-2 text-[0.85rem] font-medium hover:bg-paper-3"
              aria-label={`Star ${site.name} on GitHub (opens in a new tab)`}
            >
              <GitHubMark />
              <span className="hidden sm:inline">Star on GitHub</span>
              <span className="sm:hidden">GitHub</span>
            </a>
          </div>
        }
      />

      <form className="mt-5 flex flex-wrap items-end gap-4 border border-rule bg-paper-2/40 p-3" method="get">
        <fieldset>
          <legend className="plate-label">Band</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Link
              href={sort === "recent" ? "/surveys" : `/surveys?sort=${sort}`}
              className={`border px-2 py-1 text-[0.78rem] ${band === null ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink-2 hover:bg-paper-3"}`}
            >
              all
            </Link>
            {counts.map((entry) => (
              <Link
                key={entry.value}
                href={`/surveys?band=${entry.value}&sort=${sort}`}
                className={`border px-2 py-1 text-[0.78rem] ${
                  band === entry.value ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink-2 hover:bg-paper-3"
                }`}
              >
                {entry.value} <span className="readout opacity-70">{entry.n}</span>
              </Link>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="plate-label">Sort</span>
          <div className="mt-1.5 flex gap-1.5">
            <select
              name="sort"
              defaultValue={sort}
              className="border border-rule bg-paper px-2 py-1.5 text-[0.82rem]"
            >
              <option value="recent">newest first</option>
              <option value="score">highest score</option>
              <option value="exposure">soonest break</option>
              <option value="name">name</option>
            </select>
            <button
              type="submit"
              className="border border-rule bg-paper-2 px-2.5 py-1.5 text-[0.82rem] font-medium hover:bg-paper-3"
            >
              Apply
            </button>
          </div>
        </label>

        {band ? <input type="hidden" name="band" value={band} /> : null}

        <p className="ml-auto text-[0.78rem] text-ink-3">
          Filter and sort live in the URL, so this view can be shared or reloaded.
        </p>
      </form>

      <SpectralRule className="mt-6" />

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={band ? `Nothing in the ${band} band` : "No surveys yet"}
            body={
              band
                ? "Clear the filter, or triage a surface that moves a survey into this band."
                : "Import a dependency manifest and a source excerpt. The extractor will tell you exactly what it found."
            }
            action={
              <Link href="/surveys/new" className="border border-ink bg-ink px-3 py-2 text-[0.85rem] font-medium text-paper">
                Import a manifest
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {rows.map(({ survey, score, band: rowBand, exposure }) => (
            <li key={survey.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BandChip band={rowBand} score={score} />
                      {survey.shared ? (
                        <span className="readout border border-order-3 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-order-3">
                          public link
                        </span>
                      ) : null}
                      <span className="readout text-[0.7rem] uppercase tracking-[0.12em] text-ink-3">
                        {survey.ecosystem ?? "ecosystem unknown"}
                      </span>
                    </div>
                    <h2 className="display mt-2 text-[1.25rem] font-semibold leading-snug">
                      <Link href={`/surveys/${survey.id}`} className="hover:underline">
                        {survey.name}
                      </Link>
                    </h2>
                    <p className="mt-1 text-[0.82rem] text-ink-3">
                      {survey.repoHint ? `${survey.repoHint} \u00b7 ` : ""}imported {survey.createdAt.slice(0, 10)} \u00b7{" "}
                      {survey.eventCount} sealed event{survey.eventCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 sm:min-w-[300px]">
                    <Readout label="Surfaces" value={survey.analysis?.surfaceCount ?? 0} hint="discovered" />
                    <Readout label="Residual" value={survey.analysis?.residualScore ?? 0} hint={survey.analysis?.residualBand} />
                    <Readout label="First break" value={formatWindow(exposure)} hint={windowHint(exposure)} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
                  <Link
                    href={`/surveys/${survey.id}`}
                    className="border border-rule bg-paper px-3 py-1.5 text-[0.82rem] font-medium hover:bg-paper-3"
                  >
                    Open workbench
                  </Link>
                  <Link href={`/surveys/${survey.id}?panel=integrity`} className="text-[0.82rem] text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink">
                    Verify the chain
                  </Link>
                  <Link href={`/export?survey=${survey.id}`} className="text-[0.82rem] text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink">
                    Export
                  </Link>
                  <span className="readout ml-auto break-all text-[0.66rem] text-ink-3">{survey.lastSeal}</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}