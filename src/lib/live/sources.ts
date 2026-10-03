import type { Ecosystem, NormalizedSignal, SourceStatus } from "../types";

/**
 * Live public sources, all key-free, all allowlisted, all time-bounded, all
 * normalized into `NormalizedSignal` before they reach the UI.
 *
 *   deps.dev   api.deps.dev        package release metadata for the imported manifest
 *   OSV        api.osv.dev          published vulnerability records for those packages
 *   arXiv      export.arxiv.org    current quant-ph / cs.CR work on PQC and quantum cost
 *   NIST       nist.gov            standards news feed, filtered for cryptography
 *
 * Every response carries `sourceStatus`, so a sealed offline sample is never
 * presented as current.
 */

const TIMEOUT_MS = 4_000;
const USER_AGENT = "pqc-triage/1.0 (+https://github.com/aniruddhaadak80/pqc-triage)";

export type SourceKey = "depsdev" | "osv" | "arxiv" | "nist";

export type SourceReport = {
  key: SourceKey;
  label: string;
  status: SourceStatus;
  latencyMs: number;
  count: number;
  href: string;
  detail: string;
};

async function timedFetch(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: string; latencyMs: number; error: string | null }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "*/*", ...(init.headers ?? {}) },
      cache: init.cache,
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body, latencyMs: Date.now() - started, error: null };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: "",
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// deps.dev
// ---------------------------------------------------------------------------

export type PackageFacts = {
  status: SourceStatus;
  latestVersion: string | null;
  publishedAt: string | null;
  license: string | null;
  latencyMs: number;
  error: string | null;
};

export function depsDevSystemFor(ecosystem: Ecosystem): string {
  return ecosystem;
}

export async function fetchPackageFacts(ecosystem: Ecosystem, name: string): Promise<PackageFacts> {
  const system = depsDevSystemFor(ecosystem);
  const url = `https://api.deps.dev/v3alpha/systems/${encodeURIComponent(system)}/packages/${encodeURIComponent(name)}`;
  const result = await timedFetch(url, { next: { revalidate: 21_600 } });

  if (!result.ok) {
    return { status: "fallback", latestVersion: null, publishedAt: null, license: null, latencyMs: result.latencyMs, error: result.error ?? `HTTP ${result.status}` };
  }

  try {
    const parsed = JSON.parse(result.body) as {
      versionKey?: { version?: string };
      versions?: { versionKey?: { version?: string }; publishedAt?: string; licenses?: string[]; isDefault?: boolean }[];
    };
    const versions = Array.isArray(parsed.versions) ? parsed.versions : [];
    const preferred =
      versions.find((entry) => entry.isDefault) ??
      versions
        .filter((entry) => typeof entry.publishedAt === "string")
        .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
    const latestVersion = preferred?.versionKey?.version ?? parsed.versionKey?.version ?? null;
    return {
      status: "live",
      latestVersion,
      publishedAt: preferred?.publishedAt ?? null,
      license: preferred?.licenses?.[0] ?? null,
      latencyMs: result.latencyMs,
      error: null,
    };
  } catch {
    return { status: "fallback", latestVersion: null, publishedAt: null, license: null, latencyMs: result.latencyMs, error: "unparseable response" };
  }
}

// ---------------------------------------------------------------------------
// OSV
// ---------------------------------------------------------------------------

const OSV_ECOSYSTEM: Record<Ecosystem, string> = {
  npm: "npm",
  pypi: "PyPI",
  go: "Go",
  rubygems: "RubyGems",
  packagist: "Packagist",
  "crates.io": "crates.io",
  maven: "Maven",
};

export type AdvisoryFacts = {
  status: SourceStatus;
  count: number;
  worst: string | null;
  worstId: string | null;
  latencyMs: number;
  error: string | null;
};

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, MEDIUM: 2, LOW: 1 };

export async function fetchAdvisories(ecosystem: Ecosystem, name: string): Promise<AdvisoryFacts> {
  const url = "https://api.osv.dev/v1/query";
  const result = await timedFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ package: { name, ecosystem: OSV_ECOSYSTEM[ecosystem] } }),
    cache: "no-store",
  });

  if (!result.ok) {
    return { status: "fallback", count: 0, worst: null, worstId: null, latencyMs: result.latencyMs, error: result.error ?? `HTTP ${result.status}` };
  }

  try {
    const parsed = JSON.parse(result.body) as {
      vulns?: { id?: string; summary?: string; database_specific?: { severity?: string }; severity?: { type?: string; score?: string }[] }[];
    };
    const vulns = Array.isArray(parsed.vulns) ? parsed.vulns : [];
    let worst: string | null = null;
    let worstId: string | null = null;
    let worstRank = -1;
    for (const vuln of vulns) {
      const severity = vuln.database_specific?.severity ?? "UNKNOWN";
      const rank = SEVERITY_ORDER[String(severity).toUpperCase()] ?? 0;
      if (rank > worstRank) {
        worstRank = rank;
        worst = severity;
        worstId = vuln.id ?? null;
      }
    }
    return { status: "live", count: vulns.length, worst, worstId, latencyMs: result.latencyMs, error: null };
  } catch {
    return { status: "fallback", count: 0, worst: null, worstId: null, latencyMs: result.latencyMs, error: "unparseable response" };
  }
}

// ---------------------------------------------------------------------------
// arXiv
// ---------------------------------------------------------------------------

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function collapse(value: string): string {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

export function parseArxivFeed(xml: string): { title: string; href: string; publishedAt: string; summary: string }[] {
  const entries = xml.split(/<entry[\s>]/).slice(1);
  const out: { title: string; href: string; publishedAt: string; summary: string }[] = [];
  for (const entry of entries) {
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1];
    const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1];
    const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1];
    if (!title || !id) continue;
    out.push({
      title: collapse(title),
      href: collapse(id),
      publishedAt: published ? published.trim() : "",
      summary: summary ? collapse(summary).slice(0, 260) : "",
    });
  }
  return out;
}

const ARXIV_QUERY = '(abs:"post-quantum" OR abs:"cryptographically relevant quantum") AND (cat:quant-ph OR cat:cs.CR)';

export async function fetchArxivPapers(): Promise<{ status: SourceStatus; items: NormalizedSignal[]; latencyMs: number; error: string | null }> {
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(ARXIV_QUERY)}&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending`;
  const result = await timedFetch(url, { next: { revalidate: 3_600 } });
  if (!result.ok) {
    return { status: "fallback", items: [], latencyMs: result.latencyMs, error: result.error ?? `HTTP ${result.status}` };
  }
  const fetchedAt = new Date().toISOString();
  const items = parseArxivFeed(result.body)
    .filter((entry) => entry.title && entry.href)
    .slice(0, 8)
    .map((entry, index) => ({
      id: `arxiv-${index}-${entry.href.split("/").pop() ?? index}`,
      source: "arXiv quant-ph / cs.CR",
      sourceStatus: "live" as const,
      title: entry.title,
      detail: entry.summary,
      href: entry.href,
      publishedAt: entry.publishedAt || null,
      fetchedAt,
    }));
  return { status: items.length ? "live" : "fallback", items, latencyMs: result.latencyMs, error: null };
}

// ---------------------------------------------------------------------------
// NIST news
// ---------------------------------------------------------------------------

const NIST_KEYWORDS = /quantum|cryptograph|post-quantum|pqc|cipher|random number/i;

export async function fetchNistNews(): Promise<{ status: SourceStatus; items: NormalizedSignal[]; latencyMs: number; error: string | null; scanned: number }> {
  const url = "https://www.nist.gov/news-events/news/rss.xml";
  const result = await timedFetch(url, { next: { revalidate: 3_600 } });
  if (!result.ok) {
    return { status: "fallback", items: [], latencyMs: result.latencyMs, error: result.error ?? `HTTP ${result.status}`, scanned: 0 };
  }
  const fetchedAt = new Date().toISOString();
  const items = result.body
    .split(/<item[\s>]/)
    .slice(1)
    .map((entry) => ({
      title: collapse(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
      link: collapse(entry.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? ""),
      pubDate: collapse(entry.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ""),
      description: collapse(entry.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "").slice(0, 240),
    }))
    .filter((entry) => entry.title)
    .filter((entry) => NIST_KEYWORDS.test(`${entry.title} ${entry.description}`))
    .slice(0, 6)
    .map((entry, index) => {
      const published = new Date(entry.pubDate);
      return {
        id: `nist-${index}-${entry.title.slice(0, 24).replace(/\W+/g, "-").toLowerCase()}`,
        source: "NIST news",
        sourceStatus: "live" as const,
        title: entry.title,
        detail: entry.description,
        href: entry.link || null,
        publishedAt: Number.isNaN(published.getTime()) ? null : published.toISOString(),
        fetchedAt,
      };
    });
  return {
    status: "live",
    items,
    latencyMs: result.latencyMs,
    error: null,
    scanned: result.body.split(/<item[\s>]/).length - 1,
  };
}