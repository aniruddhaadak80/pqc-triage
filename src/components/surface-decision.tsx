"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_SHELF_LIFE, MIN_SHELF_LIFE } from "@/lib/crypto-registry";
import type { Decision, Surface, SurfaceAssessment, SurveyAnalysis, Usage } from "@/lib/types";
import { Button, Note } from "./plate";

const DECISIONS: { value: Decision; label: string; help: string }[] = [
  { value: "untriaged", label: "Untriaged", help: "No decision recorded yet." },
  { value: "migrate-now", label: "Migrate now", help: "Commit the replacement; only schedule risk remains." },
  { value: "scheduled", label: "Schedule", help: "Plan against the NIST date instead of the quantum horizon." },
  { value: "accepted-risk", label: "Accept risk", help: "Keep it and write down why. The score does not move." },
  { value: "not-applicable", label: "Not applicable", help: "Not actually used. Drops out of the score." },
];

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

export function SurfaceDecision({
  surface,
  assessment,
  horizonYear,
}: {
  surface: Surface;
  assessment: SurfaceAssessment | null;
  horizonYear: number;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision>(surface.decision);
  const [note, setNote] = useState(surface.decisionNote);
  const [shelfLife, setShelfLife] = useState(surface.shelfLifeYears);
  const [usage, setUsage] = useState<Usage>(surface.usage);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [seal, setSeal] = useState<string | null>(null);
  const [preview, setPreview] = useState<SurveyAnalysis | null>(null);

  async function save() {
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/surfaces/${surface.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          decisionNote: note.trim().slice(0, 600),
          shelfLifeYears: shelfLife,
          usage,
        }),
      });
      const payload = (await response.json()) as {
        error?: { message: string };
        seal?: string | null;
        analysis?: SurveyAnalysis | null;
      };
      if (!response.ok || payload.error) {
        setStatus("error");
        setMessage(payload.error?.message ?? "The decision was not saved.");
        return;
      }
      setSeal(payload.seal ?? null);
      setPreview(payload.analysis ?? null);
      setStatus("saved");
      setMessage("Recorded, rescored and sealed.");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("The network request failed. Nothing was changed.");
    }
  }

  const chosen = DECISIONS.find((entry) => entry.value === decision);

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="plate-label">Decision</span>
          <select
            value={decision}
            onChange={(event) => setDecision(event.target.value as Decision)}
            className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.88rem]"
          >
            {DECISIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[0.73rem] leading-snug text-ink-3">{chosen?.help}</span>
        </label>

        <label className="block">
          <span className="plate-label">Role</span>
          <select
            value={usage}
            onChange={(event) => setUsage(event.target.value as Usage)}
            className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.88rem]"
          >
            {USAGES.map((value) => (
              <option key={value} value={value}>
                {value.replace(/-/g, " ")}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[0.73rem] leading-snug text-ink-3">
            Drives the usage weight, not the deadline.
          </span>
        </label>
      </div>

      <label className="block">
        <span className="plate-label">Data shelf life (X, years)</span>
        <div className="mt-1 flex items-center gap-3">
          <input
            type="range"
            min={MIN_SHELF_LIFE}
            max={40}
            step={1}
            value={Math.min(40, shelfLife)}
            onChange={(event) => setShelfLife(Number(event.target.value))}
            className="flex-1 accent-[var(--color-order-2)]"
            aria-label="Years the protected data must stay confidential"
          />
          <input
            type="number"
            min={MIN_SHELF_LIFE}
            max={MAX_SHELF_LIFE}
            value={shelfLife}
            onChange={(event) => setShelfLife(Math.min(MAX_SHELF_LIFE, Math.max(MIN_SHELF_LIFE, Number(event.target.value) || 0)))}
            className="readout w-20 border border-rule bg-paper px-2 py-1.5 text-right text-[0.9rem]"
          />
        </div>
        <span className="mt-1 block text-[0.73rem] leading-snug text-ink-3">
          {shelfLife === 0
            ? "Nothing has to stay secret, so there is no harvest window."
            : `At a ${horizonYear} horizon, data captured today is decryptable from ${horizonYear - shelfLife}.`}
        </span>
      </label>

      <label className="block">
        <span className="plate-label">Rationale</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={600}
          placeholder="Why this decision, for whoever reads the plan in six months."
          className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.88rem]"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Recording…" : "Record decision"}
        </Button>
        {preview ? (
          <span className="readout text-[0.78rem] text-ink-2">
            portfolio {preview.score} → residual {preview.residualScore} ({preview.residualBand})
          </span>
        ) : null}
      </div>

      {message ? <Note tone={status === "error" ? "warn" : "ok"}>{message}</Note> : null}
      {seal ? (
        <p className="readout break-all text-[0.66rem] leading-relaxed text-ink-3">chain head {seal}</p>
      ) : null}
      {assessment ? (
        <p className="text-[0.74rem] leading-relaxed text-ink-3">
          Replacement on record: <span className="font-medium text-ink-2">{assessment.replacement.primitive}</span>{" "}
          ({assessment.replacement.standard}, {assessment.replacement.quantumBits}-bit quantum strength, about{" "}
          {assessment.replacement.migrationLeadYears} years of lead time).
        </p>
      ) : null}
    </div>
  );
}