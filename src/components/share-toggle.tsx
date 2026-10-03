"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { site } from "@/config/site";
import type { Survey } from "@/lib/types";
import { Button, Note } from "./plate";

/**
 * Publishing is explicit and revocable. The public route refuses to render an
 * unshared survey, so this flag is the only thing standing between a private
 * inventory and a public report.
 */
export function ShareToggle({ survey }: { survey: Survey }) {
  const router = useRouter();
  const [shared, setShared] = useState(survey.shared);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/surveys/${survey.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shared: !shared }),
      });
      const payload = (await response.json()) as { error?: { message: string }; shared?: boolean };
      if (!response.ok || payload.error) {
        setMessage(payload.error?.message ?? "The link was not changed.");
        return;
      }
      setShared(Boolean(payload.shared));
      setMessage(payload.shared ? "Public report link is live." : "Public link revoked.");
      router.refresh();
    } catch {
      setMessage("The network request failed. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const url = `${site.liveUrl}/share/${survey.id}`;

  return (
    <div className="grid gap-2">
      <Button variant={shared ? "solid" : "outline"} onClick={toggle} disabled={busy}>
        {busy ? "Working…" : shared ? "Revoke public link" : "Publish read-only report"}
      </Button>
      {shared ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/share/${survey.id}`} className="readout break-all text-[0.7rem] underline decoration-rule underline-offset-4">
            {url}
          </a>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setMessage("Clipboard access was refused by the browser. Copy the URL above.");
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}
      {message ? <Note tone={shared ? "ok" : "info"}>{message}</Note> : null}
    </div>
  );
}