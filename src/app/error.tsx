"use client";

import { useEffect } from "react";
import { GitHubMark } from "@/components/github-mark";
import { site } from "@/config/site";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Nothing is logged to a third party: the digest is the only identifier
    // Next.js records, and the message is never sent anywhere.
  }, [error]);

  return (
    <div className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
      <p className="plate-label">Something broke</p>
      <h1 className="display mt-2 text-[2rem] font-semibold leading-tight">This request did not complete.</h1>
      <div className="spectral-band mt-5 h-1.5 w-full" aria-hidden="true" />
      <p className="mt-5 text-[0.95rem] leading-relaxed text-ink-2">
        The server refused to finish that request, and the details were not sent to the browser on purpose. Your data
        is untouched: every write in this application is committed before the response is sent.
      </p>
      {error.digest ? (
        <p className="readout mt-3 text-[0.78rem] text-ink-3">reference {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="border border-ink bg-ink px-3 py-2 text-[0.85rem] font-medium text-paper hover:bg-ink-2"
        >
          Try again
        </button>
        <a
          href={site.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 border border-rule bg-paper-2 px-3 py-2 text-[0.85rem] hover:bg-paper-3"
          aria-label={`Star ${site.name} on GitHub (opens in a new tab)`}
        >
          <GitHubMark />
          Report it on GitHub
        </a>
      </div>
    </div>
  );
}