"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Survey } from "@/lib/types";
import { Button, Note } from "./plate";

export function SurveyActions({ survey }: { survey: Survey }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/surveys/${survey.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: { message: string }; seal?: string; tombstone?: boolean };
      if (!response.ok || payload.error) {
        setMessage(payload.error?.message ?? "The survey was not retired.");
        setBusy(false);
        return;
      }
      router.push("/surveys");
      router.refresh();
    } catch {
      setMessage("The network request failed. Nothing was retired.");
      setBusy(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {(["md", "json", "csv"] as const).map((format) => (
          <a
            key={format}
            href={`/api/export?survey=${survey.id}&format=${format}`}
            className="border border-rule bg-paper-2 px-3 py-2 text-[0.82rem] font-medium hover:bg-paper-3"
            aria-label={`Download the ${format.toUpperCase()} migration plan for ${survey.name}`}
          >
            {format.toUpperCase()}
          </a>
        ))}
        <Linkish id={survey.id} />
        <Button variant={confirming ? "solid" : "outline"} onClick={() => setConfirming((value) => !value)}>
          {confirming ? "Confirm retire" : "Retire survey"}
        </Button>
      </div>

      {confirming ? (
        <div className="mt-3 border border-order-1 bg-order-1/5 p-3 sm:max-w-sm">
          <p className="text-[0.85rem] leading-relaxed">
            This retires <span className="font-medium">{survey.name}</span> and its {survey.surfaces.length} surface(s).
            The rows stay as tombstones so the seal chain still replays, and the public link is revoked. That is the
            only delete this app performs.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={remove} disabled={busy}>
              {busy ? "Retiring…" : "Yes, retire it"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
          {message ? (
            <div className="mt-2">
              <Note tone="warn">{message}</Note>
            </div>
          ) : null}
        </div>
      ) : message ? (
        <div className="mt-2">
          <Note tone="warn">{message}</Note>
        </div>
      ) : null}
    </div>
  );
}

function Linkish({ id }: { id: string }) {
  return (
    <a
      href={`/verify?survey=${id}`}
      className="border border-rule bg-paper-2 px-3 py-2 text-[0.82rem] font-medium hover:bg-paper-3"
      aria-label="Replay this survey's seal chain"
    >
      Verify
    </a>
  );
}