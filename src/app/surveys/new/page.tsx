import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { Card, Note, SectionHead, SpectralRule } from "@/components/plate";
import { MAX_MANIFEST_CHARS, MAX_SOURCE_CHARS, MAX_SURFACES } from "@/lib/extract";

export const metadata = { title: "New survey" };

export default function NewSurveyPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <SectionHead
        index="Import"
        title="New survey"
        lede="Everything below is parsed on the server. Nothing is inferred from a demo, and nothing is sent anywhere except this application."
      />
      <SpectralRule className="mt-5" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <ImportForm />
        </Card>

        <aside className="self-start">
          <Card>
            <p className="plate-label">What gets parsed</p>
            <ul className="mt-3 grid gap-2 text-[0.84rem] leading-relaxed text-ink-2">
              <li>
                <span className="font-medium text-ink">Manifests</span> — package-lock.json, package.json,
                requirements.txt, go.mod, Gemfile.lock, composer.lock, Cargo.lock, pom.xml.
              </li>
              <li>
                <span className="font-medium text-ink">Dependencies</span> — matched against a curated list of
                cryptography packages, so a token library is not confused with a date library.
              </li>
              <li>
                <span className="font-medium text-ink">Source</span> — scanned line by line for real call sites:
                hash and cipher constructions, key sizes, signature algorithms, and a non-cryptographic PRNG used
                to make a secret.
              </li>
            </ul>
          </Card>

          <div className="mt-4">
            <Card>
              <p className="plate-label">Limits</p>
              <dl className="readout mt-2 grid gap-1.5 text-[0.8rem] text-ink-2">
                <div className="flex justify-between gap-3">
                  <dt>manifest</dt>
                  <dd>{MAX_MANIFEST_CHARS.toLocaleString()} chars</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>source</dt>
                  <dd>{MAX_SOURCE_CHARS.toLocaleString()} chars</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>surfaces kept</dt>
                  <dd>{MAX_SURFACES}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-3">
                A truncated import says so in the response rather than pretending it read everything.
              </p>
            </Card>
          </div>

          <div className="mt-4">
            <Note tone="warn">
              Do not paste production secrets. This app stores what you send so it can score it, and it stores it on a
              shared database.
            </Note>
          </div>

          <p className="mt-4 text-[0.82rem] text-ink-3">
            Already have one?{" "}
            <Link href="/surveys" className="underline decoration-rule underline-offset-4 hover:text-ink">
              Back to the workspace
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  );
}