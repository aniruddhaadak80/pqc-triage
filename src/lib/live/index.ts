import { NIST_TIMELINE } from "../crypto-registry";
import type { LiveSignals, NormalizedSignal, SourceStatus } from "../types";
import { fetchArxivPapers, fetchNistNews, type SourceReport } from "./sources";

/**
 * The sealed offline sample. Dated, attributed, and never mixed with live
 * results: if a source is unreachable the response says `fallback`, and the UI
 * prints the sample's own date next to it.
 */
const SAMPLE_FETCHED_AT = "2026-09-30T00:00:00.000Z";

const SAMPLE_PAPERS: NormalizedSignal[] = [
  {
    id: "sample-paper-1",
    source: "Sealed sample (arXiv quant-ph / cs.CR)",
    sourceStatus: "fallback",
    title: "How to factor 2048 bit RSA integers in 8 hours using 20 million noisy qubits",
    detail:
      "Peer-reviewed estimate of the cost of Shor's algorithm against RSA-2048 under surface-code assumptions. This is the anchor the resource estimator in this app uses.",
    href: "https://quantum-journal.org/papers/q-2021-04-15-433",
    publishedAt: "2021-04-15T00:00:00.000Z",
    fetchedAt: SAMPLE_FETCHED_AT,
  },
  {
    id: "sample-paper-2",
    source: "Sealed sample (arXiv quant-ph / cs.CR)",
    sourceStatus: "fallback",
    title: "Estimating the resource requirements of breaking ECC",
    detail:
      "Cryptographic count and depth estimates for discrete logarithms on 256-bit elliptic curves, the anchor for the linear ECDLP model here.",
    href: "https://eprint.iacr.org/2020/1193",
    publishedAt: "2020-05-18T00:00:00.000Z",
    fetchedAt: SAMPLE_FETCHED_AT,
  },
];

const SAMPLE_NEWS: NormalizedSignal[] = [
  {
    id: "sample-news-1",
    source: "Sealed sample (NIST news)",
    sourceStatus: "fallback",
    title: "NIST IR 8547 ipd: Transition to Post-Quantum Cryptography Standards",
    detail:
      "112-bit strength public-key algorithms deprecated after 2030 and disallowed after 2035; 128-bit-and-above disallowed after 2035; 112-bit-level symmetric primitives disallowed in 2030.",
    href: "https://csrc.nist.gov/pubs/ir/8547/ipd",
    publishedAt: "2024-11-12T00:00:00.000Z",
    fetchedAt: SAMPLE_FETCHED_AT,
  },
];

export function sampleSignals(horizonYear: number): LiveSignals {
  return {
    status: "fallback",
    fetchedAt: SAMPLE_FETCHED_AT,
    horizonYear,
    transition: {
      deprecateBy: NIST_TIMELINE.deprecateBy,
      disallowFrom: NIST_TIMELINE.disallowFrom,
      symmetricFloorBits: 112,
      citation: "NIST IR 8547 ipd",
      href: NIST_TIMELINE.transitionHref,
    },
    quantum: SAMPLE_NEWS,
    advisories: [],
    papers: SAMPLE_PAPERS,
    sources: [
      { key: "arxiv", label: "arXiv quant-ph / cs.CR", status: "fallback", latencyMs: 0, count: SAMPLE_PAPERS.length, href: "https://arxiv.org" },
      { key: "nist", label: "NIST news", status: "fallback", latencyMs: 0, count: SAMPLE_NEWS.length, href: "https://www.nist.gov/news-events/news" },
      { key: "depsdev", label: "deps.dev", status: "fallback", latencyMs: 0, count: 0, href: "https://deps.dev" },
      { key: "osv", label: "OSV", status: "fallback", latencyMs: 0, count: 0, href: "https://osv.dev" },
    ],
  };
}

/**
 * Assemble the live signal board. Sources are fetched concurrently and each
 * reports its own status, so one dead feed cannot blank the page and cannot be
 * mistaken for another.
 */
export async function getLiveSignals(input: {
  horizonYear: number;
  advisories: {
    id: string;
    source: string;
    sourceStatus: SourceStatus;
    title: string;
    detail: string;
    href: string | null;
    publishedAt: string | null;
    fetchedAt: string;
  }[];
}): Promise<LiveSignals> {
  const [arxiv, nist] = await Promise.all([fetchArxivPapers(), fetchNistNews()]);
  const fallback = sampleSignals(input.horizonYear);

  const sources: SourceReport[] = [
    {
      key: "arxiv",
      label: "arXiv quant-ph / cs.CR",
      status: arxiv.status,
      latencyMs: arxiv.latencyMs,
      count: arxiv.items.length,
      href: "https://arxiv.org",
      detail: arxiv.error ?? "current preprints matching post-quantum or cryptographically relevant quantum",
    },
    {
      key: "nist",
      label: "NIST news",
      status: nist.status,
      latencyMs: nist.latencyMs,
      count: nist.items.length,
      href: "https://www.nist.gov/news-events/news",
      detail: nist.error ?? `filtered for cryptography from ${nist.scanned} feed entries`,
    },
    {
      key: "depsdev",
      label: "deps.dev",
      status: input.advisories.some((entry) => entry.id.startsWith("deps")) ? "live" : "fallback",
      latencyMs: 0,
      count: 0,
      href: "https://deps.dev",
      detail: "package release metadata resolved per imported dependency",
    },
    {
      key: "osv",
      label: "OSV",
      status: input.advisories.length ? "live" : "fallback",
      latencyMs: 0,
      count: input.advisories.length,
      href: "https://osv.dev",
      detail: "published vulnerability records for the imported dependencies",
    },
  ];

  const anyLive = arxiv.status === "live" || nist.status === "live" || input.advisories.length > 0;

  return {
    status: anyLive ? "live" : "fallback",
    fetchedAt: new Date().toISOString(),
    horizonYear: input.horizonYear,
    transition: fallback.transition,
    quantum: nist.items.length ? nist.items : fallback.quantum,
    advisories: input.advisories,
    papers: arxiv.items.length ? arxiv.items : fallback.papers,
    sources: sources.map(({ key, label, status, latencyMs, count, href }) => ({
      key,
      label,
      status,
      latencyMs,
      count,
      href,
    })),
  };
}