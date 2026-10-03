"use client";

import { useState } from "react";
import { site } from "@/config/site";
import { Button, Note } from "./plate";

/**
 * A live JSON-RPC 2.0 console. Every button below issues a real request to
 * `/api/mcp` and renders whatever came back, including JSON-RPC errors. The
 * "full loop" button walks the same path the README documents: import, list,
 * read, decide, verify, export.
 */

type LogEntry = {
  id: number;
  label: string;
  request: unknown;
  response: unknown;
  ok: boolean;
  note?: string;
};

type Preset = { label: string; body: unknown };

const PRESETS: Preset[] = [
  { label: "initialize", body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } },
  { label: "tools/list", body: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} } },
  { label: "list_signals", body: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_signals", arguments: {} } } },
  {
    label: "assess_primitive rsa-2048",
    body: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "assess_primitive", arguments: { primitive: "rsa-2048", shelfLifeYears: 25 } },
    },
  },
  {
    label: "classify_primitive",
    body: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "classify_primitive", arguments: { text: "createCipheriv('des-ede3', key, iv) for the legacy store" } },
    },
  },
  {
    label: "estimate_quantum_resources rsa-3072",
    body: {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "estimate_quantum_resources", arguments: { kind: "rsa", keyBits: 3072 } },
    },
  },
  {
    label: "verify_integrity",
    body: { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "verify_integrity", arguments: {} } },
  },
];

const LOOP_MANIFEST = `{
  "dependencies": {
    "jsonwebtoken": "^9.0.2",
    "node-forge": "^1.3.1",
    "bcrypt": "^5.1.1"
  }
}`;

const LOOP_SOURCE = `const token = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' });
const legacy = crypto.createCipheriv('des-ede3', key, iv);
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });`;

let counter = 0;
const nextId = () => ++counter;

export function AgentConsole({ ownerHint }: { ownerHint: string }) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [custom, setCustom] = useState(
    JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  async function rpc(body: unknown, label: string, note?: string) {
    setBusy(true);
    const entry: LogEntry = { id: Date.now() + Math.random(), label, request: body, response: null, ok: true, note };
    setLog((previous) => [entry, ...previous].slice(0, 24));
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      setLog((previous) =>
        previous.map((item) =>
          item.id === entry.id
            ? { ...item, response: payload, ok: !(payload as { error?: unknown }).error }
            : item,
        ),
      );
      return payload as { result?: { structuredContent?: Record<string, unknown> }; error?: { message: string; code: number } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "network failure";
      setLog((previous) =>
        previous.map((item) => (item.id === entry.id ? { ...item, response: { transportError: message }, ok: false } : item)),
      );
      return { error: { message, code: -1 } };
    } finally {
      setBusy(false);
    }
  }

  async function runLoop() {
    const key = `console-loop-${new Date().toISOString().slice(0, 16)}`;
    const imported = await rpc(
      {
        jsonrpc: "2.0",
        id: nextId(),
        method: "tools/call",
        params: {
          name: "import_survey",
          arguments: {
            name: "Agent console loop",
            repoHint: "created over JSON-RPC",
            manifest: LOOP_MANIFEST,
            source: LOOP_SOURCE,
            idempotencyKey: key,
          },
        },
      },
      "tools/call import_survey",
      `idempotencyKey ${key} \u00b7 click Run loop again within the same minute to see the replay`,
    );

    const surveyId =
      (imported.result?.structuredContent as { survey?: { id?: string } } | undefined)?.survey?.id ?? "";

    const listed = await rpc(
      { jsonrpc: "2.0", id: nextId(), method: "tools/call", params: { name: "list_surveys", arguments: {} } },
      "tools/call list_surveys",
    );
    const surveys =
      (listed.result?.structuredContent as { surveys?: { id: string; surfaceCount: number; name: string }[] } | undefined)
        ?.surveys ?? [];
    const target = surveyId || surveys[0]?.id;
    if (!target) return;

    const read = await rpc(
      { jsonrpc: "2.0", id: nextId(), method: "tools/call", params: { name: "get_survey", arguments: { surveyId: target } } },
      "tools/call get_survey",
    );
    const analysis = (read.result?.structuredContent as { analysis?: { surfaces?: { surfaceId: string; score: number }[] } } | undefined)?.analysis;
    const worst = analysis?.surfaces?.[0];
    if (worst) {
      await rpc(
        {
          jsonrpc: "2.0",
          id: nextId(),
          method: "tools/call",
          params: {
            name: "record_decision",
            arguments: {
              surfaceId: worst.surfaceId,
              decision: "migrate-now",
              decisionNote: "Decided over JSON-RPC by the agent console.",
              idempotencyKey: `${key}-decide`,
            },
          },
        },
        "tools/call record_decision",
        `highest-scoring surface at ${worst.score}/100`,
      );
    }

    await rpc(
      { jsonrpc: "2.0", id: nextId(), method: "tools/call", params: { name: "verify_integrity", arguments: { surveyId: target } } },
      "tools/call verify_integrity",
    );
    await rpc(
      { jsonrpc: "2.0", id: nextId(), method: "tools/call", params: { name: "export_survey", arguments: { surveyId: target, format: "md" } } },
      "tools/call export_survey",
    );
  }

  async function sendCustom() {
    setCustomError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(custom);
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : "invalid JSON");
      return;
    }
    await rpc(parsed, "custom");
  }

  return (
    <div className="grid gap-5">
      <div className="border border-rule bg-paper-2/40 p-4">
        <p className="plate-label">Endpoint</p>
        <p className="readout mt-1 break-all text-[0.82rem]">{site.mcpUrl}</p>
        <p className="mt-2 text-[0.8rem] leading-relaxed text-ink-2">
          JSON-RPC 2.0 over HTTP POST. Your anonymous owner scope is <span className="readout">{ownerHint}</span>; an
          agent that does not keep cookies should pass it back as{" "}
          <span className="readout">params.ownerToken</span>. Eleven tools: two read, four analysis, three mutating, plus
          integrity and export.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={runLoop} disabled={busy}>
            {busy ? "Calling…" : "Run the full agent loop"}
          </Button>
          <a
            href="/mcp.json"
            className="inline-flex items-center border border-rule bg-paper px-3 py-2 text-[0.85rem] font-medium hover:bg-paper-3"
          >
            mcp.json
          </a>
        </div>
      </div>

      <div>
        <p className="plate-label">One-click calls</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              disabled={busy}
              onClick={() => rpc({ ...(preset.body as Record<string, unknown>), id: nextId() }, preset.label)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="border border-rule bg-paper-2/40 p-4">
        <label htmlFor="custom-rpc" className="plate-label">
          Custom JSON-RPC request
        </label>
        <textarea
          id="custom-rpc"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          rows={6}
          spellCheck={false}
          className="readout mt-1 w-full border border-rule bg-paper px-2.5 py-2 text-[0.78rem]"
        />
        <div className="mt-2 flex items-center gap-2">
          <Button onClick={sendCustom} disabled={busy}>
            Send
          </Button>
          {customError ? <span className="text-[0.8rem] text-critical">{customError}</span> : null}
        </div>
      </div>

      <div>
        <p className="plate-label">Traffic ({log.length})</p>
        {log.length === 0 ? (
          <Note tone="info">Nothing sent yet. Press a preset or run the full loop.</Note>
        ) : (
          <ol className="mt-2 grid gap-3">
            {log.map((entry) => (
              <li key={entry.id} className="border border-rule bg-paper">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-paper-2/60 px-3 py-2">
                  <span className="readout text-[0.78rem] font-medium">{entry.label}</span>
                  <span
                    className={`readout text-[0.7rem] uppercase tracking-[0.12em] ${
                      entry.ok ? "text-order-4" : "text-critical"
                    }`}
                  >
                    {entry.ok ? "ok" : "error"}
                  </span>
                </div>
                {entry.note ? <p className="px-3 pt-2 text-[0.75rem] text-ink-3">{entry.note}</p> : null}
                <div className="grid gap-2 p-3 md:grid-cols-2">
                  <div>
                    <p className="plate-label">Request</p>
                    <pre className="readout mt-1 max-h-56 overflow-auto border border-rule bg-paper-2/30 p-2 text-[0.7rem] leading-relaxed">
                      {JSON.stringify(entry.request, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="plate-label">Response</p>
                    <pre className="readout mt-1 max-h-56 overflow-auto border border-rule bg-paper-2/30 p-2 text-[0.7rem] leading-relaxed">
                      {entry.response === null ? "waiting…" : JSON.stringify(entry.response, null, 2)}
                    </pre>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}