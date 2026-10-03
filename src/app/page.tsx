import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { FringePlate } from "@/components/fringe-plate";
import { Card, EmptyState, LiveBadge, Note, Readout, SectionHead, SpectralRule, formatWindow, windowHint } from "@/components/plate";
import { site } from "@/config/site";
import { ready } from "@/lib/bootstrap";
import { NIST_TIMELINE } from "@/lib/crypto-registry";
import { listSurveys, getSurvey, settingsFor } from "@/lib/service";
import { getLiveSignals } from "@/lib/live";
import { advisoriesFor } from "@/lib/service";
import { CITATIONS } from "@/lib/crypto-registry";
import { ENGINE_VERSION } from "@/lib/engine";
import { GitHubMark } from "@/components/github-mark";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const { sessionId } = await ready();
  const settings = await settingsFor(sessionId);
  const summaries = await listSurveys(sessionId);
  const survey = summaries.length ? await getSurvey(sessionId, summaries[0].id, settings) : null;
  const signals = await getLiveSignals({
    horizonYear: settings.horizonYear,
    advisories: await advisoriesFor(survey?.surfaces ?? []),
  });

  const nowYear = new Date().getUTCFullYear();
  const analysis = survey?.analysis ?? null;
  const heroItems = (analysis?.surfaces ?? []).slice(0, 22).map((assessment) => ({
    id: assessment.surfaceId,
    label: survey?.surfaces.find((surface) => surface.id === assessment.surfaceId)?.label ?? assessment.surfaceId,
    score: assessment.score,
    band: assessment.band,
    decryptableFrom: assessment.decryptableFrom,
    mustStartBy: assessment.mustStartBy,
  }));

  return (
    <>
      <section className="border-b border-rule">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:py-16">
          <div>
            <p className="plate-label">Post-quantum migration triage</p>
            <h1 className="display mt-3 text-[2.4rem] font-semibold leading-[1.05] sm:text-[3.1rem]">
              Find the cryptography a quantum computer breaks first, and the date you must migrate by.
            </h1>
            <p className="mt-4 max-w-xl text-[1rem] leading-relaxed text-ink-2">
              Paste a real dependency manifest and a source excerpt. {site.name} parses both, resolves every
              cryptographic call site to an algorithm, scores each one against published Shor resource estimates and
              NIST IR 8547 transition dates, and writes a sealed migration plan you can hand to a review. The 10-second
              path is a real import, a real score, a real persisted decision, and a downloadable plan.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="#import"
                className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2.5 text-[0.9rem] font-medium text-paper transition-colors hover:bg-ink-2"
              >
                Import a manifest
              </a>
              <a
                href={site.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-rule bg-paper-2 px-4 py-2.5 text-[0.9rem] font-medium transition-colors hover:bg-paper-3"
                aria-label={`Star ${site.name} on GitHub (opens in a new tab)`}
              >
                <GitHubMark />
                Star on GitHub
              </a>
              <Link href="/agent" className="text-[0.9rem] text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink">
                or drive it over MCP
              </Link>
            </div>

            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-6 sm:grid-cols-4">
              <div>
                <dt className="plate-label">Engine</dt>
                <dd className="readout mt-1 text-[0.9rem]">{ENGINE_VERSION}</dd>
              </div>
              <div>
                <dt className="plate-label">NIST deprecates</dt>
                <dd className="readout mt-1 text-[0.9rem]">{NIST_TIMELINE.deprecateBy}</dd>
              </div>
              <div>
                <dt className="plate-label">NIST disallows</dt>
                <dd className="readout mt-1 text-[0.9rem]">{NIST_TIMELINE.disallowFrom}</dd>
              </div>
              <div>
                <dt className="plate-label">Keys needed</dt>
                <dd className="readout mt-1 text-[0.9rem]">zero</dd>
              </div>
            </dl>
          </div>

          <Card className="self-start">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="plate-label">Live posture</p>
              <LiveBadge status={signals.status} label={`fetched ${signals.fetchedAt.slice(11, 19)}Z`} />
            </div>
            {heroItems.length === 0 ? (
              <EmptyState
                title="No surfaces yet"
                body="Import a manifest and this plate fills with one fringe per discovered surface."
                action={
                  <a href="#import" className="border border-ink bg-ink px-3 py-2 text-[0.85rem] font-medium text-paper">
                    Import now
                  </a>
                }
              />
            ) : (
              <>
                <div className="mt-3">
                  <FringePlate
                    items={heroItems}
                    nowYear={nowYear}
                    horizonYear={analysis?.surfaces.length ? settings.horizonYear : settings.horizonYear}
                    deprecateYear={NIST_TIMELINE.deprecateBy}
                    disallowYear={NIST_TIMELINE.disallowFrom}
                    height={150}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 border-t border-rule pt-3">
                  <Readout label="Portfolio" value={`${analysis?.score ?? 0}/100`} hint={analysis?.band} />
                  <Readout label="Surfaces" value={analysis?.surfaceCount ?? 0} hint="discovered" />
                  <Readout label="First break" value={formatWindow(analysis?.exposureYears)} hint={windowHint(analysis?.exposureYears)} />
                </div>
                {survey ? (
                  <p className="mt-3 text-[0.8rem] text-ink-2">
                    Currently showing your newest survey,{" "}
                    <Link href={`/surveys/${survey.id}`} className="underline decoration-rule underline-offset-4 hover:text-ink">
                      {survey.name}
                    </Link>
                    .
                  </p>
                ) : null}
              </>
            )}
          </Card>
        </div>
        <SpectralRule />
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6">
        <SectionHead
          index="What it does"
          title="Three jobs, done end to end"
          lede="No dashboards of decoration. Each of these is a real write against a hosted database, and each one leaves an artifact behind."
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Inventory the cryptography you already ship",
              body: "Import a package-lock.json, requirements.txt, go.mod, Gemfile.lock, composer.lock, Cargo.lock or pom.xml, plus the source where keys and ciphertext are handled. The extractor reports the line it matched.",
              cta: { href: "#import", label: "Import now" },
            },
            {
              title: "Decide what to migrate and by when",
              body: "Set the data shelf life for each surface, record a decision with a rationale, and move the quantum-capability horizon. Mosca's arithmetic turns that into a start-by year that a board can read.",
              cta: { href: "/surveys", label: "Open the workbench" },
            },
            {
              title: "Hand over a plan you can verify",
              body: "Download Markdown, JSON or CSV with every factor, citation and seal. The chain replays from the genesis value, and an agent can do the whole loop over JSON-RPC.",
              cta: { href: "/export", label: "See the export" },
            },
          ].map((card) => (
            <Card key={card.title}>
              <h3 className="display text-[1.1rem] font-semibold leading-snug">{card.title}</h3>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-2">{card.body}</p>
              <Link href={card.cta.href} className="mt-3 inline-block border-b border-rule pb-0.5 text-[0.85rem] font-medium hover:border-ink">
                {card.cta.label} →
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section id="import" className="border-y border-rule bg-paper-2/30">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <SectionHead
              index="Primary action"
              title="Import a manifest"
              lede="Everything on this page works without an account. The anonymous owner cookie decides who can see which survey, and it is the only thing that guards your data."
            />
            <div className="mt-6">
              <ImportForm compact />
            </div>
          </div>

          <aside className="self-start">
            <Card>
              <p className="plate-label">Where the numbers come from</p>
              <ul className="mt-3 space-y-3 text-[0.84rem] leading-relaxed text-ink-2">
                <li>
                  <a href={CITATIONS.gidneyEkera2021.href} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline decoration-rule underline-offset-4">
                    Gidney &amp; Eker&#228; 2021
                  </a>{" "}
                  for the closed-form cost of factoring an n-bit RSA modulus.
                </li>
                <li>
                  <a href={CITATIONS.haner2020.href} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline decoration-rule underline-offset-4">
                    H&#228;ner et al. 2020
                  </a>{" "}
                  for the elliptic-curve discrete-log anchor.
                </li>
                <li>
                  <a href={CITATIONS.nistIr8547.href} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline decoration-rule underline-offset-4">
                    NIST IR 8547
                  </a>{" "}
                  for the 2030 and 2035 transition dates.
                </li>
                <li>
                  <a href="https://deps.dev" target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline decoration-rule underline-offset-4">
                    deps.dev
                  </a>{" "}
                  and{" "}
                  <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline decoration-rule underline-offset-4">
                    OSV
                  </a>{" "}
                  for per-dependency release and advisory data.
                </li>
              </ul>
              <div className="mt-4 border-t border-rule pt-3">
                <p className="plate-label">Sources right now</p>
                <ul className="mt-2 grid gap-1.5">
                  {signals.sources.map((source) => (
                    <li key={source.key} className="flex items-center justify-between gap-2 text-[0.8rem]">
                      <span className="text-ink-2">{source.label}</span>
                      <LiveBadge status={source.status} label={`${source.count}`} />
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
            <div className="mt-4">
              <Note tone="warn">
                This is an engineering aid, not an assurance. It does not certify a system as quantum-safe, and it is
                not security advice.
              </Note>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6">
        <SectionHead
          index="Current work"
          title="Live from arXiv and NIST"
          lede={
            signals.status === "fallback"
              ? "The live feeds are unreachable right now, so this is the sealed sample with its own date. It is never presented as current."
              : `Fetched ${signals.fetchedAt.slice(0, 19).replace("T", " ")}Z. Each row names the source it came from.`
          }
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {[
            { title: "Papers on post-quantum migration", href: "https://arxiv.org", rows: signals.papers },
            { title: "Standards news", href: "https://www.nist.gov/news-events/news", rows: signals.quantum },
          ].map((group) => (
            <Card key={group.title}>
              <div className="flex items-center justify-between gap-2 border-b border-rule pb-2">
                <h3 className="display text-[1.05rem] font-semibold">{group.title}</h3>
                <a href={group.href} target="_blank" rel="noopener noreferrer" className="readout text-[0.7rem] text-ink-3 underline decoration-rule underline-offset-4">
                  source
                </a>
              </div>
              {group.rows.length === 0 ? (
                <p className="mt-3 text-[0.85rem] text-ink-3">No matching items in the latest feed.</p>
              ) : (
                <ul className="mt-3 grid gap-3">
                  {group.rows.slice(0, 4).map((row) => (
                    <li key={row.id} className="border-l-2 border-rule pl-3">
                      <p className="text-[0.88rem] font-medium leading-snug">
                        <a href={row.href ?? "#"} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {row.title}
                        </a>
                      </p>
                      <p className="mt-1 line-clamp-2 text-[0.8rem] leading-relaxed text-ink-3">{row.detail}</p>
                      <p className="readout mt-1 text-[0.68rem] text-ink-3">
                        {row.source} · {row.publishedAt ? row.publishedAt.slice(0, 10) : "undated"} ·{" "}
                        {row.sourceStatus}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-rule bg-paper-2/40 p-5">
          <div>
            <p className="display text-lg font-semibold">Read the source, run it locally</p>
            <p className="mt-1 max-w-lg text-[0.88rem] leading-relaxed text-ink-2">
              MIT licensed, self-hostable, and it runs with zero environment variables: local development and the test
              suite use an embedded Postgres, production uses the hosted one through the same typed repository layer.
            </p>
          </div>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-ink-2"
            aria-label={`Star ${site.name} on GitHub (opens in a new tab)`}
          >
            <GitHubMark />
            Star on GitHub
          </a>
        </div>
      </section>
    </>
  );
}