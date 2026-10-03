import Link from "next/link";
import { notFound } from "next/navigation";
import { BandChip, Readout, SectionHead, SpectralRule, formatWindow, windowHint } from "@/components/plate";
import { GitHubMark } from "@/components/github-mark";
import { site } from "@/config/site";
import { getSharedSurvey } from "@/lib/service";
import { ENGINE_VERSION } from "@/lib/engine";
import { SEAL_ALGORITHM } from "@/lib/seal";

export const dynamic = "force-dynamic";

/**
 * The public, read-only report. Unshared surveys return 404 here, so publishing
 * has to be an explicit act by the owner.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const survey = await getSharedSurvey(id);
  return {
    title: survey ? `${survey.name} — migration report` : "Report not published",
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const survey = await getSharedSurvey(id);
  if (!survey) notFound();

  const analysis = survey.analysis;

  return (
    <div className="mx-auto max-w-[900px] px-4 py-10 sm:px-6">
      <p className="plate-label">Read-only report · published by the survey owner</p>
      <h1 className="display mt-2 text-[2rem] font-semibold leading-tight">{survey.name}</h1>
      <p className="mt-1.5 text-[0.85rem] text-ink-3">
        {survey.repoHint ? `${survey.repoHint} · ` : ""}imported {survey.createdAt.slice(0, 10)} ·{" "}
        {survey.ecosystem ?? "ecosystem unknown"} · horizon {survey.horizonYear}
      </p>

      <SpectralRule className="mt-5" />

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Readout label="Exposure" value={`${analysis?.score ?? 0}/100`} hint={analysis?.band} />
        <Readout label="After decisions" value={`${analysis?.residualScore ?? 0}/100`} hint={analysis?.residualBand} />
        <Readout label="Surfaces" value={analysis?.surfaceCount ?? 0} hint={`${analysis?.triagedCount ?? 0} triaged`} />
        <Readout label="First break" value={formatWindow(analysis?.exposureYears)} hint={windowHint(analysis?.exposureYears)} />
      </div>

      <section className="mt-8">
        <SectionHead index="Deadlines" title="Start-by year per surface" lede="Highest score first." />
        <div className="mt-4 overflow-x-auto border border-rule">
          <table className="w-full min-w-[620px] text-left text-[0.8rem]">
            <thead className="bg-paper-2/70">
              <tr className="readout text-[0.65rem] uppercase tracking-[0.1em] text-ink-3">
                <th scope="col" className="px-3 py-2 font-normal">Surface</th>
                <th scope="col" className="px-3 py-2 font-normal">Role</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">X</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Start by</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Breaks</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Score</th>
                <th scope="col" className="px-3 py-2 font-normal">Decision</th>
              </tr>
            </thead>
            <tbody>
              {survey.surfaces.map((surface) => {
                const assessment = analysis?.surfaces.find((entry) => entry.surfaceId === surface.id);
                return (
                  <tr key={surface.id} className="border-t border-rule">
                    <td className="px-3 py-2 font-medium">{surface.label}</td>
                    <td className="px-3 py-2 text-ink-2">{surface.usage.replace(/-/g, " ")}</td>
                    <td className="readout px-3 py-2 text-right">{surface.shelfLifeYears}y</td>
                    <td className="readout px-3 py-2 text-right">{assessment?.mustStartBy ?? "—"}</td>
                    <td className="readout px-3 py-2 text-right">{assessment?.decryptableFrom ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {assessment ? <BandChip band={assessment.band} score={assessment.score} /> : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-2">
                      {surface.decision}
                      {surface.decisionNote ? ` — ${surface.decisionNote}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 border border-rule bg-paper-2/40 p-4">
        <p className="plate-label">Integrity</p>
        <p className="readout mt-1 break-all text-[0.72rem] text-ink-2">genesis {survey.genesisSeal}</p>
        <p className="readout mt-0.5 break-all text-[0.72rem] text-ink-2">head {survey.lastSeal}</p>
        <p className="readout mt-1 text-[0.72rem] text-ink-3">
          {survey.eventCount} event(s) · {SEAL_ALGORITHM} · engine {ENGINE_VERSION}
        </p>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-5">
        <p className="max-w-md text-[0.83rem] leading-relaxed text-ink-3">
          Engineering aid only. This report does not certify a system as quantum-safe and is not security advice.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border-b border-rule pb-0.5 text-[0.85rem] font-medium hover:border-ink"
            aria-label={`Star ${site.name} on GitHub (opens in a new tab)`}
          >
            <GitHubMark />
            Star on GitHub
          </a>
          <Link href="/" className="text-[0.85rem] text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink">
            Run your own triage
          </Link>
        </div>
      </div>
    </div>
  );
}