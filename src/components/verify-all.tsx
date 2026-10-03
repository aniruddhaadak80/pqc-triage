"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IntegrityReport } from "@/lib/types";
import { Button, Note } from "./plate";

export function VerifyAll({ initial }: { initial: Record<string, IntegrityReport> }) {
  const router = useRouter();
  const [reports, setReports] = useState<Record<string, IntegrityReport>>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setMessage(null);
    setError(null);
    const next: Record<string, IntegrityReport> = {};
    const failures: string[] = [];
    for (const id of Object.keys(reports)) {
      try {
        const response = await fetch(`/api/integrity?survey=${id}`);
        const payload = (await response.json()) as IntegrityReport & { error?: { message: string } };
        if (!response.ok || payload.error) {
          failures.push(`${id.slice(0, 8)}: ${payload.error?.message ?? "failed"}`);
        } else {
          next[id] = payload;
        }
      } catch {
        failures.push(`${id.slice(0, 8)}: network failure`);
      }
    }
    if (Object.keys(next).length > 0) setReports(next);
    const broken = Object.values(next).filter((report) => !report.valid);
    setMessage(`${Object.keys(next).length} replayed, ${broken.length} with a broken link.`);
    setError(failures.length ? failures.join(" · ") : null);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={rerun} disabled={busy}>
          {busy ? "Replaying…" : "Replay every chain"}
        </Button>
        <span className="readout text-[0.72rem] text-ink-3">
          {Object.keys(reports).length} survey(s) · SHA-384 chain from genesis
        </span>
      </div>
      {message ? <Note tone="ok">{message}</Note> : null}
      {error ? <Note tone="warn">{error}</Note> : null}
    </div>
  );
}