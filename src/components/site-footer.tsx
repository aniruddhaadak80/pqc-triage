import Link from "next/link";
import { CITATIONS } from "@/lib/crypto-registry";
import { ENGINE_VERSION } from "@/lib/engine";
import { navItems, site } from "@/config/site";
import { GitHubMark } from "./github-mark";

export function SiteFooter() {
  const year = 2026;

  return (
    <footer className="mt-20 border-t border-rule bg-paper-2 no-print">
      <div className="spectral-band h-1.5 w-full" aria-hidden="true" />
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <p className="display text-lg font-semibold">{site.name}</p>
          <p className="mt-2 max-w-xs text-[0.85rem] leading-relaxed text-ink-2">{site.tagline}</p>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 border-b border-rule pb-0.5 text-[0.85rem] font-medium text-ink hover:border-ink"
            aria-label={`Star ${site.name} on GitHub (opens in a new tab)`}
          >
            <GitHubMark />
            Star on GitHub
          </a>
          <p className="readout mt-2 text-[0.72rem] text-ink-3">{site.repoUrl}</p>
        </div>

        <nav aria-label="Footer">
          <p className="plate-label">Product</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-[0.85rem] text-ink-2 hover:text-ink hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/surveys/new" className="text-[0.85rem] text-ink-2 hover:text-ink hover:underline">
                New survey
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <p className="plate-label">Interfaces</p>
          <ul className="mt-3 space-y-1.5 text-[0.85rem]">
            <li>
              <a href={site.mcpUrl} className="text-ink-2 hover:text-ink hover:underline">
                MCP endpoint (JSON-RPC 2.0)
              </a>
            </li>
            <li>
              <a href={`${site.apiUrl}/health`} className="text-ink-2 hover:text-ink hover:underline">
                Health
              </a>
            </li>
            <li>
              <a href={`${site.liveUrl}/mcp.json`} className="text-ink-2 hover:text-ink hover:underline">
                mcp.json
              </a>
            </li>
            <li>
              <a
                href={site.issuesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-2 hover:text-ink hover:underline"
              >
                Report an issue
              </a>
            </li>
          </ul>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">
            Engine <span className="readout">{ENGINE_VERSION}</span> · MIT licensed · MIT project, {year}.
          </p>
        </div>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto max-w-[1180px] px-4 py-4 text-[0.75rem] leading-relaxed text-ink-3 sm:px-6">
          <p>
            Data sources:{" "}
            <a href={CITATIONS.gidneyEkera2021.href} className="underline hover:text-ink" target="_blank" rel="noopener noreferrer">
              Gidney &amp; Eker&#228; 2021
            </a>{" "}
            for RSA cost,{" "}
            <a href={CITATIONS.haner2020.href} className="underline hover:text-ink" target="_blank" rel="noopener noreferrer">
              H&#228;ner et al. 2020
            </a>{" "}
            for ECDLP cost,{" "}
            <a href={CITATIONS.nistIr8547.href} className="underline hover:text-ink" target="_blank" rel="noopener noreferrer">
              NIST IR 8547
            </a>{" "}
            for transition dates. Package metadata from{" "}
            <a href="https://deps.dev" className="underline hover:text-ink" target="_blank" rel="noopener noreferrer">
              deps.dev
            </a>
            , advisories from{" "}
            <a href="https://osv.dev" className="underline hover:text-ink" target="_blank" rel="noopener noreferrer">
              OSV
            </a>
            , current research from{" "}
            <a href="https://arxiv.org" className="underline hover:text-ink" target="_blank" rel="noopener noreferrer">
              arXiv
            </a>
            .
          </p>
          <p className="mt-2">
            Engineering aid only. It does not certify a system as quantum-safe and it is not security advice.
          </p>
        </div>
      </div>
    </footer>
  );
}