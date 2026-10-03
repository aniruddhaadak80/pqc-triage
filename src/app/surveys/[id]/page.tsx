import Link from "next/link";
import { notFound } from "next/navigation";
import { HorizonSweep } from "@/components/horizon-sweep";
import { AddSurfaceForm, SurfaceBoard } from "@/components/surface-board";
import { ShareToggle } from "@/components/share-toggle";
import { SurveyActions } from "@/components/survey-actions";
import { BandChip, Card, EmptyState, Readout, SectionHead, SpectralRule, formatWindow } from "@/components/plate";
import { ready } from "@/lib/bootstrap";
import { CITATIONS, NIST_TIMELINE } from "@/lib/crypto-registry";
import { auditTrail, getSurvey, settingsFor, verifySurvey } from "@/lib/service";
import type { RiskBand } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sessionId } = await ready();
  const survey = await getSurvey(sessionId, id);
  return { title: survey ? survey.name : "Survey" };
}

export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ panel?: string }>;
}) {
  const { id } = await params;
  const { panel } = await searchParams;
  const { sessionId } = await ready();
  const settings = await settingsFor(sessionId);
  const survey = await getSurvey(sessionId, id, settings);
  if (!survey) notFound();

  const analysis = survey.analysis;
  const nowYear = new Date().getUTCFullYear();
  const integrity = panel === "integrity" ? await verifySurvey(sessionId, survey.id) : null;
  const events = panel === "integrity" ? await auditTrail(sessionId, survey.id) : [];

  const evidenceCount = survey.surfaces.filter((surface) => surface.evidence.trim().length > 0).length;
  const enriched = survey.surfaces.filter((surface) => surface.enrichment.advisoryCount > 0 || surface.enrichment.latestVersion).length;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="plate-label">
            <Link href="/surveys" className="hover:text-ink hover:underline">
              Surveys
            </Link>{" "}
            / {survey.ecosystem ?? "ecosystem unknown"}
          </p>
          <h1 className="display mt-2 text-[1.9rem] font-semibold leading-tight sm:text-[2.2rem]">{survey.name}</h1>
          <p className="mt-1.5 text-[0.86rem] text-ink-3">
            {survey.repoHint ? `${survey.repoHint} · ` : ""}imported {survey.createdAt.slice(0, 10)} ·{" "}
            {survey.eventCount} sealed event{survey.eventCount === 1 ? "" : "s"} · owner scope{" "}
            <span className="readout">{sessionId.slice(0, 8)}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {analysis ? <BandChip band={analysis.band as RiskBand} score={analysis.score} /> : null}
            <ShareToggle survey={survey} />
          </div>
        </div>

        <SurveyActions survey={survey} />
      </div>

      <SpectralRule className="mt-5" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Readout
            label="Weighted exposure"
            value={`${analysis?.score ?? 0}/100`}
            hint={`${analysis?.band ?? "clear"} band · engine ${analysis?.engineVersion ?? ""}`}
          />
        </Card>
        <Card>
          <Readout
            label="After decisions"
            value={`${analysis?.residualScore ?? 0}/100`}
            hint={`${analysis?.residualBand ?? "clear"} · ${analysis?.triagedCount ?? 0} of ${analysis?.surfaceCount ?? 0} triaged`}
          />
        </Card>
        <Card>
          <Readout
            label="First capture breaks in"
            value={formatWindow(analysis?.exposureYears)}
            hint={`${analysis?.overdueCount ?? 0} surface(s) already past their start date`}
          />
        </Card>
        <Card>
          <Readout
            label="Evidence"
            value={`${evidenceCount}/${survey.surfaces.length}`}
            hint={`${enriched} enriched from deps.dev and OSV`}
          />
        </Card>
      </div>

      <div className="mt-6">
        <HorizonSweep survey={survey} />
      </div>

      <section className="mt-8" aria-labelledby="surfaces-heading">
        <SectionHead
          index="Triage"
          title="Discovered surfaces"
          lede={`Sorted by score. Every row came from the import: a dependency on the curated list, or a call site the scanner matched on a specific line. Horizon H = ${survey.horizonYear}.`}
        />
        <div className="mt-5">
          {survey.surfaces.length === 0 ? (
            <EmptyState
              title="Nothing was discovered"
              body="The importer found no cryptographic dependency or call site in what you sent. Paste a source excerpt, or add a surface by hand below."
            />
          ) : (
            <SurfaceBoard
              surfaces={survey.surfaces}
              assessments={analysis?.surfaces ?? []}
              horizonYear={survey.horizonYear}
            />
          )}
        </div>

        <div className="mt-6 border-t border-rule pt-5">
          <p className="plate-label">Add by hand</p>
          <p className="mt-1 mb-3 text-[0.84rem] text-ink-2">
            For the surface the scanner could not see, such as a key held by a hardware module.
          </p>
          <AddSurfaceForm surveyId={survey.id} />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="deadline-heading">
        <SectionHead index="Method" title="How the deadline is derived" lede="Two independent limits are in play, and the earlier one wins." />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Card>
            <p className="plate-label">1 · Your horizon</p>
            <p className="display mt-1 text-2xl font-semibold">{survey.horizonYear}</p>
            <p className="mt-1.5 text-[0.83rem] leading-relaxed text-ink-2">
              {nowYear >= NIST_TIMELINE.deprecateBy
                ? `We are already past the ${NIST_TIMELINE.deprecateBy} deprecation date, so your own horizon is the binding constraint.`
                : `${NIST_TIMELINE.deprecateBy - nowYear} years from now NIST deprecates 112-bit strength public key. Move the sweep above to test it.`}
            </p>
          </Card>
          <Card>
            <p className="plate-label">2 · NIST IR 8547</p>
            <p className="display mt-1 text-2xl font-semibold">
              {NIST_TIMELINE.deprecateBy} / {NIST_TIMELINE.disallowFrom}
            </p>
            <p className="mt-1.5 text-[0.83rem] leading-relaxed text-ink-2">
              Deprecate after {NIST_TIMELINE.deprecateBy}, disallow after {NIST_TIMELINE.disallowFrom}; 112-bit-level
              symmetric primitives are disallowed in {NIST_TIMELINE.symmetricFloorDisallowFrom}.{" "}
              <a href={CITATIONS.nistIr8547.href} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-4 hover:text-ink">
                source
              </a>
            </p>
          </Card>
          <Card>
            <p className="plate-label">3 · Quantum cost</p>
            <p className="display mt-1 text-2xl font-semibold">6,189</p>
            <p className="mt-1.5 text-[0.83rem] leading-relaxed text-ink-2">
              Logical qubits for a Shor attack on RSA-2048, from the closed form in Gidney &amp; Eker&#228;, which is
              the figure most people remember. ECDLP is anchored on the published 256-bit estimate.
            </p>
          </Card>
        </div>
      </section>

      {panel === "integrity" && integrity ? (
        <section className="mt-10" aria-labelledby="integrity-heading">
          <SectionHead
            index="Integrity"
            title="Seal replay"
            lede="seal_n = SHA-384(UTF-8(prevSeal) || canonicalJson(event_n)), starting from a genesis value derived from the survey id."
            aside={
              <Link href={`/surveys/${survey.id}`} className="text-[0.82rem] underline decoration-rule underline-offset-4 hover:text-ink">
                close
              </Link>
            }
          />
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <Card>
              <Readout label="Verdict" value={integrity.valid ? "intact" : "broken"} hint={`${integrity.eventsChecked} events replayed`} />
            </Card>
            <Card>
              <Readout label="Algorithm" value={integrity.algorithm} hint="SHA-384" />
            </Card>
            <Card>
              <Readout label="Tombstones" value={integrity.retainedTombstones} hint="rows kept for replay" />
            </Card>
            <Card>
              <Readout
                label="First break"
                value={integrity.brokenAtSeq ?? "none"}
                hint={integrity.brokenReason ?? "no broken link"}
              />
            </Card>
          </div>
          <div className="mt-4 grid gap-2">
            <p className="readout break-all text-[0.7rem] text-ink-3">genesis {integrity.genesisSeal}</p>
            <p className="readout break-all text-[0.7rem] text-ink-3">head {integrity.headSeal}</p>
          </div>
          <ol className="mt-4 grid gap-1.5">
            {events.map((event) => (
              <li key={event.seq} className="readout grid gap-1 border border-rule bg-paper px-3 py-2 text-[0.72rem] sm:grid-cols-[52px_150px_minmax(0,1fr)] sm:gap-3">
                <span className="text-ink-3">#{event.seq}</span>
                <span className="font-medium">{event.type}</span>
                <span className="break-all text-ink-3">{event.seal}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="mt-10 border-t border-rule pt-4 text-[0.84rem] text-ink-2">
          <Link href={`/surveys/${survey.id}?panel=integrity`} className="underline decoration-rule underline-offset-4 hover:text-ink">
            Replay this survey&apos;s seal chain
          </Link>{" "}
          or open{" "}
          <Link href="/verify" className="underline decoration-rule underline-offset-4 hover:text-ink">
            /verify
          </Link>{" "}
          to check every survey at once.
        </p>
      )}
    </div>
  );
}