import Link from "next/link";
import { VerifyAll } from "@/components/verify-all";
import { Card, Note, Readout, SectionHead, SpectralRule } from "@/components/plate";
import { ready } from "@/lib/bootstrap";
import { listSurveys, verifySurvey } from "@/lib/service";
import { SEAL_ALGORITHM } from "@/lib/seal";
import type { IntegrityReport } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify" };

export default async function VerifyPage() {
  const { sessionId } = await ready();
  const summaries = await listSurveys(sessionId, { includeRetired: true });

  const entries: { id: string; name: string; status: string; updatedAt: string; report: IntegrityReport }[] = [];
  for (const summary of summaries) {
    try {
      entries.push({
        id: summary.id,
        name: summary.name,
        status: summary.status,
        updatedAt: summary.updatedAt,
        report: await verifySurvey(sessionId, summary.id),
      });
    } catch {
      /* a survey removed mid-request is simply not listed */
    }
  }

  const initial = Object.fromEntries(entries.map((entry) => [entry.id, entry.report]));

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <SectionHead
        index="Integrity"
        title="Seal replay"
        lede={`Every create, update, decision and retire appends one event. seal_n = ${SEAL_ALGORITHM}(UTF-8(prevSeal) || canonicalJson(event_n)), chained from a genesis value derived from the survey id. Replay recomputes the whole chain and names the first link that does not hold.`}
      />
      <SpectralRule className="mt-5" />

      <div className="mt-6">
        <VerifyAll initial={initial} />
      </div>

      {entries.length === 0 ? (
        <div className="mt-6">
          <Note tone="info">
            No surveys in this session yet.{" "}
            <Link href="/surveys/new" className="underline decoration-rule underline-offset-4">
              Import one
            </Link>{" "}
            and its chain appears here.
          </Note>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`readout border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] ${
                          entry.report.valid ? "border-order-4 text-order-4" : "border-critical text-critical"
                        }`}
                      >
                        {entry.report.valid ? "chain intact" : "chain broken"}
                      </span>
                      {entry.status === "retired" ? (
                        <span className="readout border border-rule px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-ink-3">
                          retired
                        </span>
                      ) : null}
                    </div>
                    <h2 className="display mt-2 text-[1.15rem] font-semibold">
                      <Link href={`/surveys/${entry.id}?panel=integrity`} className="hover:underline">
                        {entry.name}
                      </Link>
                    </h2>
                    <p className="readout mt-1 break-all text-[0.68rem] text-ink-3">head {entry.report.headSeal}</p>
                    <p className="readout mt-0.5 break-all text-[0.68rem] text-ink-3">genesis {entry.report.genesisSeal}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Readout label="Events" value={entry.report.eventsChecked} hint="replayed" />
                    <Readout label="Tombstones" value={entry.report.retainedTombstones} hint="kept" />
                    <Readout label="Algorithm" value={entry.report.algorithm} hint="digest" />
                    <Readout
                      label="First break"
                      value={entry.report.brokenAtSeq ?? "none"}
                      hint={entry.report.brokenReason ?? "no broken link"}
                    />
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <p className="plate-label">Canonical JSON</p>
          <p className="mt-2 text-[0.85rem] leading-relaxed text-ink-2">
            Keys are sorted recursively, arrays keep their order, numbers use the shortest round-tripping form and
            undefined properties are dropped. Two equal values therefore produce byte-equal output on any platform,
            which is what makes the chain replayable instead of merely append-only.
          </p>
        </Card>
        <Card>
          <p className="plate-label">Tombstones, not hard deletes</p>
          <p className="mt-2 text-[0.85rem] leading-relaxed text-ink-2">
            Retiring a survey or a surface sets a deletion timestamp and appends an event. Nothing is removed from the
            chain, so a reviewer can still prove what was recorded and when. The only thing a delete revokes is public
            access.
          </p>
        </Card>
      </div>
    </div>
  );
}