/**
 * The single source of truth for product identity, navigation, and outbound
 * links. The shared header, the mobile menu, the landing CTA, the footer, the
 * OpenGraph metadata, the sitemap and the README badge all read from here, so
 * the repository URL is never duplicated across components.
 */

function normalizeBase(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

/**
 * The verified production alias. Overridable with NEXT_PUBLIC_SITE_URL so the
 * same build can be pointed at a preview host without a code edit.
 */
export const LIVE_URL =
  normalizeBase(process.env.NEXT_PUBLIC_SITE_URL) || "https://pqc-triage.vercel.app";

export const REPO_OWNER = "aniruddhaadak80";
export const REPO_SLUG = "pqc-triage";
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_SLUG}`;

export const site = {
  name: "PQC Triage",
  shortName: "PQC",
  tagline: "Find the cryptography a quantum computer breaks first, and the date you must migrate by.",
  description:
    "Import a real dependency manifest and source excerpt. PQC Triage extracts every cryptographic surface, scores quantum exposure with published resource estimates and NIST transition dates, and commits a sealed, board-ready post-quantum migration plan.",
  liveUrl: LIVE_URL,
  repoUrl: REPO_URL,
  issuesUrl: `${REPO_URL}/issues`,
  apiUrl: `${LIVE_URL}/api`,
  mcpUrl: `${LIVE_URL}/api/mcp`,
  license: "MIT",
  version: "1.0.0",
  engineVersion: "hndl@1.0.0",
} as const;

export type NavItem = {
  href: string;
  label: string;
  short: string;
  blurb: string;
};

/** Internal product navigation. The repository lives outside this list on purpose. */
export const navItems: readonly NavItem[] = [
  {
    href: "/surveys",
    label: "Surveys",
    short: "Surveys",
    blurb: "Every imported manifest you own, with triage state and deadlines.",
  },
  {
    href: "/analyze",
    label: "Analyze",
    short: "Analyze",
    blurb: "Sweep the quantum-capability horizon across all of your surfaces.",
  },
  {
    href: "/standards",
    label: "Standards",
    short: "Standards",
    blurb: "The published transition dates and quantum resource anchors this app scores against.",
  },
  {
    href: "/agent",
    label: "Agent",
    short: "Agent",
    blurb: "Drive triage over live JSON-RPC 2.0 tools.",
  },
  {
    href: "/export",
    label: "Export",
    short: "Export",
    blurb: "Download the migration plan your board actually reads.",
  },
  {
    href: "/verify",
    label: "Verify",
    short: "Verify",
    blurb: "Replay the append-only seal chain and find the first broken link.",
  },
] as const;