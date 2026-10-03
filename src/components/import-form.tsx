"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SAMPLE_MANIFEST, SAMPLE_SOURCE } from "@/lib/extract";
import { Button, Note } from "./plate";

type Extraction = {
  ecosystem: string | null;
  packagesScanned: number;
  cryptoPackages: number;
  linesScanned: number;
  surfaceCount: number;
  truncated: boolean;
};

/**
 * The primary action. It pastes nothing for the user: the sample buttons load
 * the excerpt that ships in this repository, and every number reported back
 * comes from the server's own parse of what was sent.
 */
export function ImportForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [repoHint, setRepoHint] = useState("");
  const [manifest, setManifest] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ id: string; extraction: Extraction } | null>(null);

  const canSubmit = name.trim().length > 0 && (manifest.trim().length > 0 || source.trim().length > 0);

  function loadSample() {
    setName("billing-gateway");
    setRepoHint("sample manifest shipped in this repo");
    setManifest(SAMPLE_MANIFEST);
    setSource(SAMPLE_SOURCE);
    setMessage("");
    setResult(null);
    setStatus("idle");
  }

  function clearAll() {
    setName("");
    setRepoHint("");
    setManifest("");
    setSource("");
    setResult(null);
    setMessage("");
    setStatus("idle");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setStatus("error");
      setMessage("Give the survey a name and paste a manifest, a source excerpt, or both.");
      return;
    }
    setStatus("working");
    setMessage("");
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), repoHint: repoHint.trim(), manifest, source }),
      });
      const payload = (await response.json()) as {
        error?: { message: string };
        survey?: { id: string };
        extraction?: Extraction;
      };
      if (!response.ok || payload.error) {
        setStatus("error");
        setMessage(payload.error?.message ?? "The import failed.");
        return;
      }
      setStatus("done");
      setResult({ id: payload.survey?.id ?? "", extraction: payload.extraction as Extraction });
      setMessage(
        `Parsed as ${payload.extraction?.ecosystem ?? "unknown ecosystem"}: ${payload.extraction?.packagesScanned ?? 0} dependencies scanned, ${payload.extraction?.cryptoPackages ?? 0} cryptographic, ${payload.extraction?.surfaceCount ?? 0} surfaces written to the database.`,
      );
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("The network request failed. Nothing was written.");
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="plate-label">Survey name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
            placeholder="billing-gateway"
            className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.9rem]"
          />
        </label>
        <label className="block">
          <span className="plate-label">Where it came from</span>
          <input
            value={repoHint}
            onChange={(event) => setRepoHint(event.target.value)}
            maxLength={160}
            placeholder="repo, ticket, or team"
            className="mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.9rem]"
          />
        </label>
      </div>

      <label className="block">
        <span className="plate-label">Dependency manifest</span>
        <textarea
          value={manifest}
          onChange={(event) => setManifest(event.target.value)}
          rows={compact ? 4 : 8}
          spellCheck={false}
          placeholder='package-lock.json, requirements.txt, go.mod, Gemfile.lock, composer.lock, Cargo.lock or pom.xml'
          className="readout mt-1 w-full resize-y border border-rule bg-paper px-2.5 py-2 text-[0.78rem] leading-relaxed"
        />
      </label>

      <label className="block">
        <span className="plate-label">Source excerpt (optional, and the more useful half)</span>
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          rows={compact ? 5 : 10}
          spellCheck={false}
          placeholder="Paste the files where keys, tokens and ciphertext are handled. The scanner looks for real call sites and reports the line it matched."
          className="readout mt-1 w-full resize-y border border-rule bg-paper px-2.5 py-2 text-[0.78rem] leading-relaxed"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={status === "working"}>
          {status === "working" ? "Parsing and writing…" : "Import and score"}
        </Button>
        <Button type="button" variant="outline" onClick={loadSample}>
          Load the bundled sample
        </Button>
        <Button type="button" variant="ghost" onClick={clearAll}>
          Clear
        </Button>
      </div>

      {message ? <Note tone={status === "error" ? "warn" : "ok"}>{message}</Note> : null}

      {status === "done" && result ? (
        <div className="border border-rule bg-paper-2/60 p-3 text-[0.85rem]">
          <p className="font-medium">Persisted and sealed.</p>
          <p className="mt-1 text-ink-2">
            {result.extraction.linesScanned} source lines scanned
            {result.extraction.truncated ? ", surface list truncated at the cap" : ""}. Open the survey to triage each
            surface, or jump straight to the workbench.
          </p>
          {result.id ? (
            <a
              href={`/surveys/${result.id}`}
              className="mt-2 inline-block border-b border-ink pb-0.5 font-medium"
            >
              Open {name.trim()}
            </a>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}