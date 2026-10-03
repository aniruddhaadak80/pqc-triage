import Link from "next/link";
import { Card, Note, SectionHead, SpectralRule } from "@/components/plate";
import { ready } from "@/lib/bootstrap";
import { buildExport } from "@/lib/export";
import { getSurvey, listSurveys, settingsFor } from "@/lib/service";
import { ENGINE_VERSION } from "@/lib/engine";
import { SEAL_ALGORITHM } from "@/lib/seal";
import { site } from "@/config/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Export" };

const FORMATS = [
  { id: "md", label: "Markdown", hint: "For a review document or a PR description." },
  { id: "json", label: "JSON", hint: "For a pipeline or a follow-up script." },
  { id: "csv", label: "CSV", hint: "For a spreadsheet and a board pack." },
] as const;

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ survey?: string }>;
}) {
  const { survey: selected } = await searchParams;
  const { sessionId } = await ready();
  const settings = await settingsFor(sessionId);
  const summaries = await listSurveys(sessionId);
  const surveys = (await Promise.all(summaries.map((summary) => getSurvey(sessionId, summary.id, settings)))).filter(
    (survey): survey is NonNullable<typeof survey> => Boolean(survey),
  );

  const survey = surveys.find((entry) => entry.id === selected) ?? surveys[0] ?? null;
  const preview = survey ? buildExport(survey, "md") : null;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <SectionHead
        index="Export"
        title="The artifact you take away"
        lede="A migration plan a security lead can read without opening this application: every score, every factor, every citation, and the seal the numbers were computed under."
      />
      <SpectralRule className="mt-5" />

      {surveys.length === 0 ? (
        <div className="mt-6">
          <Note tone="info">
            No surveys yet.{" "}
            <Link href="/surveys/new" className="underline decoration-rule underline-offset-4">
              Import a manifest
            </Link>{" "}
            and the export will appear here.
          </Note>
        </div>
      ) : (
        <>
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Choose a survey to export">
            {surveys.map((entry) => (
              <Link
                key={entry.id}
                href={`/export?survey=${entry.id}`}
                aria-current={entry.id === survey?.id ? "page" : undefined}
                className={`border px-3 py-1.5 text-[0.82rem] ${
                  entry.id === survey?.id ? "border-ink bg-ink text-paper" : "border-rule bg-paper hover:bg-paper-3"
                }`}
              >
                {entry.name}
              </Link>
            ))}
          </nav>

          {survey && preview ? (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {FORMATS.map((format) => (
                  <Card key={format.id}>
                    <p className="display text-[1.05rem] font-semibold">{format.label}</p>
                    <p className="mt-1 text-[0.82rem] leading-relaxed text-ink-2">{format.hint}</p>
                    <a
                      href={`/api/export?survey=${survey.id}&format=${format.id}`}
                      className="mt-3 inline-block border border-ink bg-ink px-3 py-2 text-[0.83rem] font-medium text-paper hover:bg-ink-2"
                      aria-label={`Download the ${format.label} migration plan for ${survey.name}`}
                    >
                      Download {preview.filename.replace(/\.[a-z]+$/, `.${format.id}`)}
                    </a>
                  </Card>
                ))}
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <h2 className="display text-xl font-semibold">Preview</h2>
                  <pre className="readout mt-3 max-h-[32rem] overflow-auto border border-rule bg-paper p-3 text-[0.72rem] leading-relaxed">
                    {preview.body.slice(0, 4000)}
                    {preview.body.length > 4000 ? "\n\n… truncated in the preview; the download is complete." : ""}
                  </pre>
                </div>

                <aside className="self-start">
                  <Card>
                    <p className="plate-label">What is in it</p>
                    <ul className="mt-3 grid gap-1.5 text-[0.82rem] leading-relaxed text-ink-2">
                      <li>Deadline arithmetic with H, X and Y stated</li>
                      <li>Portfolio score before and after your decisions</li>
                      <li>A row per surface with start-by and decryptable-from years</li>
                      <li>The six factors per surface, with weights and contributions</li>
                      <li>Quantum resource estimate and its citation</li>
                      <li>Live provenance per dependency, marked live or unknown</li>
                      <li>
                        Genesis and head seal, plus the replay URL
                      </li>
                      <li>Sources for every standard and estimate</li>
                    </ul>
                  </Card>
                  <div className="mt-4 grid gap-3">
                    <Card>
                      <p className="plate-label">Sealed under</p>
                      <p className="readout mt-1 break-all text-[0.72rem] text-ink-2">
                        {SEAL_ALGORITHM} · {survey.genesisSeal.slice(0, 24)}… → {survey.lastSeal.slice(0, 24)}…
                      </p>
                      <p className="readout mt-1 text-[0.72rem] text-ink-3">engine {ENGINE_VERSION}</p>
                    </Card>
                    <Note tone="warn">
                      The plan is an engineering aid. It carries a disclaimer in the document itself and does not
                      certify anything.
                    </Note>
                    <p className="text-[0.8rem] text-ink-3">
                      Prefer a link over a file? Publish a read-only report from the survey page, then share{" "}
                      <span className="readout">{site.liveUrl}/share/&lt;id&gt;</span>.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}