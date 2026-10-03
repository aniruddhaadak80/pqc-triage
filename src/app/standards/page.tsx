import Link from "next/link";
import { ClassifierPanel } from "@/components/classifier-panel";
import { Card, Note, SectionHead, SpectralRule } from "@/components/plate";
import { CITATIONS, NIST_TIMELINE, PRIMITIVES } from "@/lib/crypto-registry";
import { SURFACE_CODE_RATIO, rsaLogicalQubits, rsaToffolis } from "@/lib/resource";
import { MODEL_VERSION } from "@/lib/classifier";
import { SEAL_ALGORITHM } from "@/lib/seal";
import { ENGINE_VERSION } from "@/lib/engine";
import { CLAIMS } from "@/config/claims";

export const metadata = { title: "Standards and method" };

function band(index: number, row: (typeof PRIMITIVES)[number]) {
  if (row.quantumBits === 0) return "order-1";
  if (row.quantumBits < 128) return "order-5";
  return "order-4";
}

export default function StandardsPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <SectionHead
        index="Reference"
        title="Standards, estimates and the model"
        lede="Every number this application produces comes from one of the tables below. If a row is wrong, the app is wrong, and the citation is right there so you can check it."
      />
      <SpectralRule className="mt-5" />

      <section className="mt-6" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="display text-xl font-semibold">
          Transition dates
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Card>
            <p className="plate-label">112-bit public key</p>
            <p className="display mt-1 text-3xl font-semibold">{NIST_TIMELINE.deprecateBy}</p>
            <p className="mt-1 text-[0.83rem] leading-relaxed text-ink-2">Deprecated after this year: RSA-2048, P-224, 1024-bit finite-field DH.</p>
          </Card>
          <Card>
            <p className="plate-label">All quantum-vulnerable public key</p>
            <p className="display mt-1 text-3xl font-semibold">{NIST_TIMELINE.disallowFrom}</p>
            <p className="mt-1 text-[0.83rem] leading-relaxed text-ink-2">Disallowed after this year, including the 128-bit-and-above levels.</p>
          </Card>
          <Card>
            <p className="plate-label">112-bit-level symmetric</p>
            <p className="display mt-1 text-3xl font-semibold">{NIST_TIMELINE.symmetricFloorDisallowFrom}</p>
            <p className="mt-1 text-[0.83rem] leading-relaxed text-ink-2">3DES and SHA-1-family primitives go here.</p>
          </Card>
        </div>
        <p className="mt-2 text-[0.8rem] text-ink-2">
          Source:{" "}
          <a href={CITATIONS.nistIr8547.href} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-4 hover:text-ink">
            {CITATIONS.nistIr8547.label}
          </a>
          . Dates are read from the published transition tables; this app does not interpret them.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="table-heading">
        <h2 id="table-heading" className="display text-xl font-semibold">
          Scoring table
        </h2>
        <p className="mt-1 max-w-3xl text-[0.86rem] leading-relaxed text-ink-2">
          {PRIMITIVES.length} primitives, each with the NIST comparable classical strength, the security it retains
          against a quantum adversary, how broken it already is, and what replaces it.
        </p>
        <div className="mt-3 overflow-x-auto border border-rule">
          <table className="w-full min-w-[820px] text-left text-[0.8rem]">
            <thead className="bg-paper-2/70">
              <tr className="readout text-[0.65rem] uppercase tracking-[0.1em] text-ink-3">
                <th scope="col" className="px-3 py-2 font-normal">Primitive</th>
                <th scope="col" className="px-3 py-2 font-normal">Family</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Classical</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Quantum</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Already weak</th>
                <th scope="col" className="px-3 py-2 font-normal">NIST deprecate</th>
                <th scope="col" className="px-3 py-2 font-normal">NIST disallow</th>
                <th scope="col" className="px-3 py-2 font-normal">Replace with</th>
              </tr>
            </thead>
            <tbody>
              {PRIMITIVES.map((row, index) => (
                <tr key={row.id} className="border-t border-rule">
                  <td className="px-3 py-2">
                    <span className={`mr-2 inline-block h-2.5 w-2.5 bg-${band(index, row)}`} aria-hidden="true" />
                    <span className="font-medium">{row.label}</span>
                  </td>
                  <td className="readout px-3 py-2 text-ink-2">{row.family}</td>
                  <td className="readout px-3 py-2 text-right">{row.strengthBits}</td>
                  <td className="readout px-3 py-2 text-right font-medium">{row.quantumBits}</td>
                  <td className="readout px-3 py-2 text-right">{row.classicalWeakness.toFixed(2)}</td>
                  <td className="readout px-3 py-2">{row.deprecateBy ?? "\u2014"}</td>
                  <td className="readout px-3 py-2">{row.disallowFrom >= 9999 ? "\u2014" : row.disallowFrom}</td>
                  <td className="px-3 py-2 text-ink-2">
                    {row.replacement.primitive}
                    <span className="readout ml-1 text-[0.72rem] text-ink-3">({row.replacement.standard}, {row.replacement.migrationLeadYears}y)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="resources-heading">
        <h2 id="resources-heading" className="display text-xl font-semibold">
          Quantum resource estimates
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <Card>
            <p className="plate-label">Gidney &amp; Eker&#228; closed form, RSA</p>
            <p className="readout mt-2 text-[0.82rem] leading-relaxed">
              logical qubits = 3n + 0.002 n lg n
              <br />
              Toffoli gates = 0.3 n³ + 0.0005 n³ lg n
            </p>
            <table className="readout mt-3 w-full text-left text-[0.78rem]">
              <thead>
                <tr className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-3">
                  <th scope="col" className="pb-1 font-normal">Modulus</th>
                  <th scope="col" className="pb-1 text-right font-normal">Logical qubits</th>
                  <th scope="col" className="pb-1 text-right font-normal">Toffolis</th>
                </tr>
              </thead>
              <tbody>
                {[2048, 3072, 4096].map((bits) => (
                  <tr key={bits} className="border-t border-rule/70">
                    <td className="py-1">RSA-{bits}</td>
                    <td className="py-1 text-right">{rsaLogicalQubits(bits).toLocaleString()}</td>
                    <td className="py-1 text-right">{(rsaToffolis(bits) / 1e9).toFixed(2)}B</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[0.78rem] leading-relaxed text-ink-3">
              At n = 2048 this yields 6,189 logical qubits, which is the figure the paper reports. The app converts
              logical to physical with a {SURFACE_CODE_RATIO.toLocaleString()}:1 ratio, taken from that paper&apos;s own
              20-million-physical-qubit run, so the two numbers stay consistent with each other.
            </p>
          </Card>

          <Card>
            <p className="plate-label">ECDLP, linear model</p>
            <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-2">
              Published constructions for the elliptic-curve discrete logarithm problem are linear in the key length,
              so this app scales the anchor from H&#228;ner et al.: 2,124 logical qubits at 256 bits, or 8.297 logical
              qubits per key bit. No Toffoli figure is claimed, because the published counts for this problem span
              orders of magnitude depending on the construction.
            </p>
            <p className="readout mt-3 text-[0.82rem] leading-relaxed text-ink-2">
              P-256 → 2,124 · P-384 → 3,186 · P-521 → 4,323 logical qubits
            </p>
            <p className="mt-2 text-[0.78rem] leading-relaxed text-ink-3">
              These are literature estimates under stated assumptions, not predictions of a date. The app labels them
              as such everywhere they appear.
            </p>
          </Card>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="engine-heading">
        <h2 id="engine-heading" className="display text-xl font-semibold">
          Engine <span className="readout text-base">{ENGINE_VERSION}</span>
        </h2>
        <p className="mt-1 max-w-3xl text-[0.86rem] leading-relaxed text-ink-2">
          Six weighted factors, summed to a 0-100 score and banded. The weights are constants in one file, and the same
          function runs in the browser, on the server, and inside the agent tools.
        </p>
        <div className="mt-3 overflow-x-auto border border-rule">
          <table className="w-full min-w-[640px] text-left text-[0.8rem]">
            <thead className="bg-paper-2/70">
              <tr className="readout text-[0.65rem] uppercase tracking-[0.1em] text-ink-3">
                <th scope="col" className="px-3 py-2 font-normal">Factor</th>
                <th scope="col" className="px-3 py-2 text-right font-normal">Weight</th>
                <th scope="col" className="px-3 py-2 font-normal">Question it answers</th>
              </tr>
            </thead>
            <tbody>
              {CLAIMS.factors.map((factor) => (
                <tr key={factor.key} className="border-t border-rule">
                  <td className="px-3 py-2 font-medium">{factor.label}</td>
                  <td className="readout px-3 py-2 text-right">{factor.weight.toFixed(2)}</td>
                  <td className="px-3 py-2 text-ink-2">{factor.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[0.8rem] leading-relaxed text-ink-2">
          Deadline arithmetic: work must start by <span className="readout">H &minus; (X + Y)</span>, where X is the
          years the data must stay confidential and Y is the migration lead time recorded against the replacement
          primitive. The chain is <span className="readout">{SEAL_ALGORITHM}</span>.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="model-heading">
        <h2 id="model-heading" className="display text-xl font-semibold">
          Classifier <span className="readout text-base">{MODEL_VERSION}</span>
        </h2>
        <p className="mt-1 max-w-3xl text-[0.86rem] leading-relaxed text-ink-2">
          A multinomial Naive Bayes model implemented in this repository. It has no weights file, calls no service and
          needs no key: it trains from a seed corpus of realistic call sites plus every correction a user teaches it,
          and the learned table is exportable. Training rows are sorted before counting so the model is
          deterministic.
        </p>
        <div className="mt-4 border border-rule bg-paper-2/40 p-4">
          <ClassifierPanel />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="display text-xl font-semibold">
          Sources
        </h2>
        <ul className="mt-3 grid gap-2 text-[0.86rem] leading-relaxed">
          {Object.entries(CITATIONS).map(([key, citation]) => (
            <li key={key} className="border-l-2 border-rule pl-3">
              <a href={citation.href} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-rule underline-offset-4 hover:text-ink">
                {citation.label}
              </a>
            </li>
          ))}
          <li className="border-l-2 border-rule pl-3">
            <a href="https://deps.dev" target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-rule underline-offset-4 hover:text-ink">
              deps.dev
            </a>{" "}
            <span className="text-ink-2">package release metadata</span>
          </li>
          <li className="border-l-2 border-rule pl-3">
            <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-rule underline-offset-4 hover:text-ink">
              OSV
            </a>{" "}
            <span className="text-ink-2">published vulnerability records</span>
          </li>
          <li className="border-l-2 border-rule pl-3">
            <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-rule underline-offset-4 hover:text-ink">
              arXiv quant-ph / cs.CR
            </a>{" "}
            <span className="text-ink-2">current research</span>
          </li>
          <li className="border-l-2 border-rule pl-3">
            <a href="https://www.nist.gov/news-events/news" target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-rule underline-offset-4 hover:text-ink">
              NIST news
            </a>{" "}
            <span className="text-ink-2">standards announcements</span>
          </li>
        </ul>
        <div className="mt-4">
          <Note tone="warn">
            This is an engineering aid, not an assurance or security advice. It does not certify a system as
            quantum-safe. Resource estimates are literature values under stated assumptions, not forecasts.
          </Note>
        </div>
        <p className="mt-4 text-[0.84rem] text-ink-2">
          Ready to try it on your own code?{" "}
          <Link href="/surveys/new" className="underline decoration-rule underline-offset-4 hover:text-ink">
            Import a manifest
          </Link>
          .
        </p>
      </section>
    </div>
  );
}