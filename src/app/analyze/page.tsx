import { ScenarioTable } from "@/components/scenario-table";
import { Card, Note, SectionHead, SpectralRule } from "@/components/plate";
import { ready } from "@/lib/bootstrap";
import { CITATIONS } from "@/lib/crypto-registry";
import { getSurvey, listSurveys, settingsFor } from "@/lib/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analyze" };

export default async function AnalyzePage() {
  const { sessionId } = await ready();
  const settings = await settingsFor(sessionId);
  const summaries = await listSurveys(sessionId);
  const surveys = (await Promise.all(summaries.map((summary) => getSurvey(sessionId, summary.id, settings)))).filter(
    (survey): survey is NonNullable<typeof survey> => Boolean(survey),
  );

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <SectionHead
        index="Analysis"
        title="What if the horizon moves?"
        lede="The single most useful question in a migration plan is what happens when the deadline moves. Every cell below is the same deterministic engine, recomputed for that horizon."
      />
      <SpectralRule className="mt-5" />

      <div className="mt-6">
        <ScenarioTable surveys={surveys} storedHorizon={settings.horizonYear} />
      </div>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <Card>
          <p className="plate-label">Why 2030 and 2035 are the anchors</p>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-ink-2">
            NIST IR 8547 sets the schedule for algorithm transitions, and it is the date procurement contracts and
            audits will reference. A plan that only reacts to a quantum computer arriving is already late if it was
            written against 2035.{" "}
            <a href={CITATIONS.nistIr8547.href} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-4 hover:text-ink">
              source
            </a>
          </p>
        </Card>
        <Card>
          <p className="plate-label">What this does not model</p>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-ink-2">
            Implementation effort, vendor readiness, protocol-level breakage, or the physical cost of moving to bigger
            keys and signatures. Those are real and they are yours to argue about. The point of this table is the
            calendar, which nobody gets to negotiate.
          </p>
        </Card>
      </section>

      <div className="mt-6">
        <Note tone="warn">
          Engineering aid only. Do not treat a score here as a compliance position.
        </Note>
      </div>
    </div>
  );
}