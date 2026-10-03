"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Surface, SurfaceAssessment, Usage } from "@/lib/types";
import { BAND_BG, BAND_LABEL, BAND_TEXT, BandChip, Button, Note } from "./plate";
import { SurfaceDecision } from "./surface-decision";

const USAGES: Usage[] = [
  "session-establishment",
  "certificate-authority",
  "key-generation",
  "code-signing",
  "data-in-transit",
  "data-at-rest",
  "password-storage",
  "unknown",
];

const DECISION_BADGE: Record<string, string> = {
  untriaged: "border-rule text-ink-3",
  "migrate-now": "border-order-1 text-order-1",
  scheduled: "border-order-2 text-order-2",
  "accepted-risk": "border-order-5 text-order-5",
  "not-applicable": "border-rule text-ink-3",
};

export function SurfaceBoard({
  surfaces,
  assessments,
  horizonYear,
}: {
  surfaces: Surface[];
  assessments: SurfaceAssessment[];
  horizonYear: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const bySurface = new Map(assessments.map((assessment) => [assessment.surfaceId, assessment]));
  const sorted = [...surfaces].sort(
    (a, b) => (bySurface.get(b.id)?.score ?? 0) - (bySurface.get(a.id)?.score ?? 0) || a.label.localeCompare(b.label),
  );

  async function removeSurface(surface: Surface) {
    setRemoving(surface.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/surfaces/${surface.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: { message: string }; tombstone?: boolean };
      if (!response.ok || payload.error) {
        setMessage(payload.error?.message ?? "The surface was not removed.");
        return;
      }
      setOpen(null);
      setMessage(`${surface.label} was retired. Its row is kept as a tombstone so the seal chain still replays.`);
      router.refresh();
    } catch {
      setMessage("The network request failed. Nothing was removed.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      {message ? (
        <div className="mb-3">
          <Note tone="ok">{message}</Note>
        </div>
      ) : null}

      <ol className="grid gap-2">
        {sorted.map((surface) => {
          const assessment = bySurface.get(surface.id);
          const isOpen = open === surface.id;
          return (
            <li key={surface.id} className={`border bg-paper ${isOpen ? "border-ink" : "border-rule"}`}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : surface.id)}
                aria-expanded={isOpen}
                className="grid w-full items-center gap-3 px-3 py-3 text-left sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-4"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.92rem] font-medium">{surface.label}</span>
                  <span className="readout mt-0.5 block text-[0.7rem] text-ink-3">
                    {surface.origin} · {surface.location} · {surface.shelfLifeYears}y shelf life
                  </span>
                </span>

                <span className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] ${
                      DECISION_BADGE[surface.decision] ?? "border-rule text-ink-3"
                    }`}
                  >
                    {surface.decision}
                  </span>
                  {assessment ? <BandChip band={assessment.band} score={assessment.score} /> : null}
                </span>

                <span className="readout text-[0.72rem] text-ink-2">
                  <span className="plate-label block">breaks</span>
                  {assessment ? `${assessment.decryptableFrom} · ${assessment.decryptWindowYears}y` : "—"}
                </span>

                <span className="readout text-[0.72rem] text-ink-2">
                  <span className="plate-label block">start by</span>
                  {assessment ? assessment.mustStartBy : "—"}
                </span>
              </button>

              {isOpen ? (
                <div className="border-t border-rule bg-paper-2/30 p-3 sm:p-4">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div>
                      <p className="plate-label">Evidence</p>
                      <p className="readout mt-1 break-words text-[0.74rem] leading-relaxed text-ink-2">{surface.evidence}</p>
                      <p className="mt-2 text-[0.8rem] text-ink-3">
                        Family <span className="readout">{surface.family}</span> · primitive{" "}
                        <span className="readout">{surface.primitive}</span>
                        {surface.keyBits ? (
                          <>
                            {" "}
                            · <span className="readout">{surface.keyBits}-bit</span>
                          </>
                        ) : null}
                        {surface.familyFromModel ? " · family assigned by the in-repo classifier" : ""}
                      </p>

                      {surface.packageName ? (
                        <div className="mt-3 border-t border-rule pt-3">
                          <p className="plate-label">Live enrichment</p>
                          <dl className="readout mt-1 grid gap-1 text-[0.78rem] text-ink-2">
                            <div className="flex justify-between gap-3">
                              <dt>latest release</dt>
                              <dd>
                                {surface.enrichment.latestVersion ?? "—"}
                                {surface.enrichment.latestVersionPublishedAt
                                  ? ` (${surface.enrichment.latestVersionPublishedAt.slice(0, 10)})`
                                  : ""}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>license</dt>
                              <dd>{surface.enrichment.license ?? "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>advisories</dt>
                              <dd>
                                {surface.enrichment.advisoryCount}
                                {surface.enrichment.worstAdvisory ? ` · worst ${surface.enrichment.worstAdvisory}` : ""}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt>source status</dt>
                              <dd>
                                deps.dev {surface.enrichment.depsDevStatus} · OSV {surface.enrichment.osvStatus}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      ) : null}

                      {assessment ? (
                        <div className="mt-3 border-t border-rule pt-3">
                          <p className="plate-label">Factor breakdown</p>
                          <table className="mt-1.5 w-full text-left text-[0.76rem]">
                            <thead>
                              <tr className="readout text-[0.65rem] uppercase tracking-[0.1em] text-ink-3">
                                <th scope="col" className="pb-1 font-normal">Factor</th>
                                <th scope="col" className="pb-1 text-right font-normal">Weight</th>
                                <th scope="col" className="pb-1 text-right font-normal">Severity</th>
                                <th scope="col" className="pb-1 text-right font-normal">Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assessment.factors.map((factor) => (
                                <tr key={factor.key} className="border-t border-rule/70 align-top">
                                  <td className="py-1.5 pr-2">
                                    <span className="font-medium text-ink">{factor.label}</span>
                                    <span className="mt-0.5 block text-[0.72rem] leading-snug text-ink-3">{factor.detail}</span>
                                  </td>
                                  <td className="readout py-1.5 text-right text-ink-2">{factor.weight.toFixed(2)}</td>
                                  <td className="readout py-1.5 text-right text-ink-2">
                                    <span className="inline-flex items-center gap-1">
                                      <span className={`h-1.5 w-6 ${BAND_BG[assessment.band]}`} aria-hidden="true" />
                                      {factor.severity.toFixed(2)}
                                    </span>
                                  </td>
                                  <td className="readout py-1.5 text-right font-medium">{factor.contribution.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-2 text-[0.73rem] leading-relaxed text-ink-3">
                            {assessment.headline} {assessment.resource.citation}
                            {assessment.quantumBits === 0
                              ? ""
                              : ` Quantum strength ${assessment.quantumBits} bits. Replace with ${assessment.replacement.primitive}.`}
                          </p>
                          <p className={`readout mt-1.5 text-[0.72rem] ${BAND_TEXT[assessment.band]}`}>
                            {BAND_LABEL[assessment.band]} · score {assessment.score} · residual after decision{" "}
                            {assessment.residualScore}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <p className="plate-label">Decision</p>
                      <div className="mt-2">
                        <SurfaceDecision
                          surface={surface}
                          assessment={assessment ?? null}
                          horizonYear={horizonYear}
                        />
                      </div>

                      <div className="mt-4 border-t border-rule pt-3">
                        <Button
                          variant="outline"
                          disabled={removing === surface.id}
                          onClick={() => removeSurface(surface)}
                        >
                          {removing === surface.id ? "Retiring…" : "Retire this surface"}
                        </Button>
                        <p className="mt-1.5 text-[0.73rem] leading-relaxed text-ink-3">
                          Soft delete. The row is retained as a tombstone so replay never breaks, and the survey score
                          recomputes without it.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AddSurfaceForm({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [primitive, setPrimitive] = useState("");
  const [usage, setUsage] = useState<Usage>("unknown");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/surveys/${surveyId}/surfaces`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim(), primitive: primitive.trim(), usage }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok || payload.error) {
        setStatus("error");
        setMessage(payload.error?.message ?? "The surface was not added.");
        return;
      }
      setLabel("");
      setPrimitive("");
      setUsage("unknown");
      setStatus("idle");
      setMessage("Added and sealed.");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("The network request failed. Nothing was added.");
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_160px_auto] sm:items-end">
      <label className="block">
        <span className="plate-label">Label</span>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          required
          maxLength={160}
          placeholder="mobile SDK push token verifier"
          className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.85rem]"
        />
      </label>
      <label className="block">
        <span className="plate-label">Primitive</span>
        <input
          value={primitive}
          onChange={(event) => setPrimitive(event.target.value)}
          required
          maxLength={80}
          placeholder="ecdsa-p256"
          className="readout mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.85rem]"
        />
      </label>
      <label className="block">
        <span className="plate-label">Role</span>
        <select
          value={usage}
          onChange={(event) => setUsage(event.target.value as Usage)}
          className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.85rem]"
        >
          {USAGES.map((value) => (
            <option key={value} value={value}>
              {value.replace(/-/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Adding…" : "Add surface"}
      </Button>
      {message ? (
        <p className={`text-[0.8rem] sm:col-span-4 ${status === "error" ? "text-critical" : "text-order-4"}`}>{message}</p>
      ) : null}
    </form>
  );
}
