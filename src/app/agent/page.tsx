import Link from "next/link";
import { AgentConsole } from "@/components/agent-console";
import { Card, Note, SectionHead, SpectralRule } from "@/components/plate";
import { site } from "@/config/site";
import { ready } from "@/lib/bootstrap";
import { CLAIMS } from "@/config/claims";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agent console" };

const TOOLS = [
  {
    name: "list_signals",
    kind: "read",
    description: "arXiv, NIST and the normalized advisory feed, each with a live or fallback status.",
  },
  {
    name: "list_surveys",
    kind: "read",
    description: "Every survey the calling owner owns, newest first.",
  },
  { name: "get_survey", kind: "read", description: "One survey with all six factors per surface and the head seal." },
  {
    name: "classify_primitive",
    kind: "analysis",
    description: "The in-repo Naive Bayes model over free text, with the tokens that drove the answer.",
  },
  {
    name: "assess_primitive",
    kind: "analysis",
    description: "The engine, no writes: deadline arithmetic, resource estimate, replacement, factor breakdown.",
  },
  {
    name: "estimate_quantum_resources",
    kind: "analysis",
    description: "Logical qubits and Toffoli counts for a Shor attack on a given key size.",
  },
  {
    name: "import_survey",
    kind: "mutating",
    description: "Parse a manifest or source excerpt, resolve primitives, enrich from deps.dev and OSV. Idempotent.",
  },
  {
    name: "record_decision",
    kind: "mutating",
    description: "Set the decision, rationale and shelf life on a surface. Idempotent, same write as the form.",
  },
  {
    name: "export_survey",
    kind: "read",
    description: "The migration plan as Markdown, JSON or CSV, returned inline.",
  },
  { name: "verify_integrity", kind: "read", description: "Replay the seal chain and report the first broken link." },
  { name: "delete_survey", kind: "mutating", description: "Retire a survey, keeping tombstones so replay still works. Idempotent." },
];

const KIND_TONE: Record<string, string> = {
  read: "border-order-3 text-order-3",
  analysis: "border-order-2 text-order-2",
  mutating: "border-order-1 text-order-1",
};

export default async function AgentPage() {
  const { sessionId } = await ready();

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <SectionHead
        index="Agent"
        title="JSON-RPC 2.0 console"
        lede="Ten typed tools over live HTTP. The mutating ones call the same service functions the buttons on this site call, so an agent cannot reach a state a person could not."
        aside={
          <Link href="/mcp.json" className="border border-rule bg-paper-2 px-3 py-2 text-[0.82rem] font-medium hover:bg-paper-3">
            mcp.json
          </Link>
        }
      />
      <SpectralRule className="mt-5" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <AgentConsole ownerHint={sessionId} />

        <aside className="self-start">
          <Card>
            <p className="plate-label">Tools</p>
            <ul className="mt-3 grid gap-2.5">
              {TOOLS.map((tool) => (
                <li key={tool.name}>
                  <p className="flex items-center gap-2">
                    <span className={`readout border px-1.5 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] ${KIND_TONE[tool.kind]}`}>
                      {tool.kind}
                    </span>
                    <span className="readout text-[0.78rem] font-medium">{tool.name}</span>
                  </p>
                  <p className="mt-0.5 text-[0.78rem] leading-snug text-ink-2">{tool.description}</p>
                </li>
              ))}
            </ul>
          </Card>

          <div className="mt-4">
            <Card>
              <p className="plate-label">Wire it up</p>
              <pre className="readout mt-2 overflow-x-auto border border-rule bg-paper-2/40 p-2.5 text-[0.7rem] leading-relaxed">
{`{
  "mcpServers": {
    "pqc-triage": {
      "type": "http",
      "url": "${site.mcpUrl}"
    }
  }
}`}
              </pre>
              <p className="mt-2 text-[0.78rem] leading-relaxed text-ink-2">
                The same configuration is served from{" "}
                <a href="/mcp.json" className="underline decoration-rule underline-offset-4 hover:text-ink">
                  /mcp.json
                </a>
                .
              </p>
            </Card>
          </div>

          <div className="mt-4 grid gap-3">
            <Note tone="info">
              Tools are scoped to one owner. A browser session is identified by an HttpOnly cookie; an agent that does
              not keep cookies should take the <span className="readout">ownerToken</span> returned by{" "}
              <span className="readout">initialize</span> and send it back as{" "}
              <span className="readout">params.ownerToken</span>.
            </Note>
            <Note tone="warn">
              Mutating tools accept an <span className="readout">idempotencyKey</span>. Replaying the same key returns
              the first result instead of writing twice.
            </Note>
            <p className="text-[0.8rem] leading-relaxed text-ink-3">
              {CLAIMS.deadlineRule}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}