import { NextResponse } from "next/server";
import { site } from "@/config/site";
import { MAX_HORIZON_YEAR, MAX_SHELF_LIFE, MIN_SHELF_LIFE, MIN_HORIZON_YEAR } from "@/lib/crypto-registry";
import { getDb } from "@/lib/db/client";
import { ensureSchema } from "@/lib/db/migrate";
import { SURFACE_CODE_RATIO, estimateQuantumResources } from "@/lib/resource";
import { LIMITS } from "@/lib/http";
import { buildExport, type ExportFormat } from "@/lib/export";
import { getLiveSignals } from "@/lib/live";
import { currentSessionId, ensureSessionRow, isValidSessionId } from "@/lib/session";
import {
  advisoriesFor,
  assessPrimitiveExport,
  classifyText,
  createSurvey,
  deleteSurvey,
  getSurvey,
  listSurveys,
  readIdempotent,
  settingsFor,
  updateSurface,
  verifySurvey,
  writeIdempotent,
} from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * MCP-style JSON-RPC 2.0 endpoint.
 *
 * Every tool goes through the same service functions the UI uses, so there is
 * no second implementation of triage to drift. Mutating tools accept an
 * `idempotencyKey` and are scoped to one owner.
 */

const PROTOCOL_VERSION = "2025-06-18";

type JsonRpcId = string | number | null;

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
  handler: (args: Record<string, unknown>, owner: string, idempotencyKey: string | null) => Promise<unknown>;
};

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

const invalidParams = (message: string, data?: unknown) => new RpcError(-32602, message, data);

const TOOLS: ToolDefinition[] = [
  {
    name: "list_signals",
    title: "Read live quantum and supply signals",
    description:
      "Current post-quantum research from arXiv, standards news from NIST, and the normalized advisory feed. Each source reports live or fallback so a sealed sample is never mistaken for current data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async handler(_args, owner) {
      const settings = await settingsFor(owner);
      const surveys = await listSurveys(owner);
      const details = await Promise.all(surveys.slice(0, 5).map((summary) => getSurvey(owner, summary.id, settings)));
      const advisories = await advisoriesFor(details.flatMap((survey) => survey?.surfaces ?? []));
      const signals = await getLiveSignals({ horizonYear: settings.horizonYear, advisories });
      return {
        status: signals.status,
        fetchedAt: signals.fetchedAt,
        horizonYear: signals.horizonYear,
        transition: signals.transition,
        sources: signals.sources,
        papers: signals.papers.slice(0, 5),
        advisories: signals.advisories.slice(0, 5),
      };
    },
  },
  {
    name: "list_surveys",
    title: "List the surveys this owner owns",
    description: "Every non-deleted survey for the calling owner, newest first, with its score and surface count.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async handler(_args, owner) {
      const surveys = await listSurveys(owner);
      return { count: surveys.length, surveys };
    },
  },
  {
    name: "get_survey",
    title: "Read one survey with its scored surfaces",
    description:
      "A survey with every discovered surface, the six factor breakdown for each, the replacement primitive, the must-start-by year and the head seal.",
    inputSchema: {
      type: "object",
      properties: { surveyId: { type: "string", format: "uuid", description: "Survey id. Defaults to the newest survey." } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async handler(args, owner) {
      const surveys = await listSurveys(owner);
      const id = typeof args.surveyId === "string" ? args.surveyId : surveys[0]?.id;
      if (!id) throw invalidParams("This owner has no surveys yet. Call import_survey first.");
      const survey = await getSurvey(owner, id);
      if (!survey) throw new RpcError(-32602, `No survey with id ${id} belongs to this owner.`);
      return survey;
    },
  },
  {
    name: "classify_primitive",
    title: "Classify a cryptographic call site",
    description:
      "Runs the in-repo multinomial Naive Bayes model over free text and returns the ranked families with the tokens that drove the answer. No external model and no API key.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", minLength: 2, maxLength: 4000, description: "Algorithm name, config string, or one line of code." } },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async handler(args, owner) {
      const text = String(args.text ?? "");
      if (text.trim().length < 2) throw invalidParams("text must be at least 2 characters.");
      const prediction = await classifyText(owner, text);
      return {
        family: prediction.family,
        confidence: prediction.confidence,
        ranked: prediction.ranked,
        topTokens: prediction.topTokens,
        matchedTokens: prediction.matchedTokens,
        modelVersion: prediction.modelVersion,
        trainedExamples: prediction.trainedExamples,
      };
    },
  },
  {
    name: "assess_primitive",
    title: "Score a primitive without storing it",
    description:
      "The same deterministic engine the UI uses: Mosca deadline arithmetic, NIST IR 8547 bands, published Shor resource estimates, six itemised factors, and the recommended replacement. Pure, clock injected, nothing written.",
    inputSchema: {
      type: "object",
      properties: {
        primitive: { type: "string", description: "For example rsa-2048, ECDSA P-256, AES-128-GCM, md5, bcrypt." },
        shelfLifeYears: { type: "integer", minimum: MIN_SHELF_LIFE, maximum: MAX_SHELF_LIFE, default: 10 },
        horizonYear: { type: "integer", minimum: MIN_HORIZON_YEAR, maximum: MAX_HORIZON_YEAR },
        usage: {
          type: "string",
          enum: ["data-at-rest", "data-in-transit", "session-establishment", "code-signing", "certificate-authority", "password-storage", "key-generation", "unknown"],
        },
        now: { type: "string", format: "date-time", description: "Injected clock, for reproducible scoring." },
      },
      required: ["primitive"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async handler(args) {
      const primitive = String(args.primitive ?? "");
      const result = assessPrimitiveExport({
        primitive,
        shelfLifeYears: typeof args.shelfLifeYears === "number" ? args.shelfLifeYears : undefined,
        horizonYear: typeof args.horizonYear === "number" ? args.horizonYear : undefined,
        usage: typeof args.usage === "string" ? (args.usage as never) : undefined,
        now: typeof args.now === "string" ? new Date(args.now) : new Date(),
      });
      if (!result) throw invalidParams(`"${primitive}" is not in the scoring table. Try rsa-2048, ecdsa-p256, aes-128, md5, bcrypt, ml-kem-768.`);
      return result;
    },
  },
  {
    name: "estimate_quantum_resources",
    title: "Estimate the quantum cost of breaking one key",
    description:
      "Logical qubits and Toffoli counts for a Shor attack on a key size, from the Gidney and Ekera closed form for RSA and the linear ECDLP model anchored on the published 256-bit estimate.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["rsa", "ec"] },
        keyBits: { type: "integer", minimum: 256, maximum: 8192 },
      },
      required: ["kind", "keyBits"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async handler(args) {
      const kind = String(args.kind ?? "");
      const keyBits = Number(args.keyBits ?? 0);
      if (kind !== "rsa" && kind !== "ec") throw invalidParams("kind must be rsa or ec.");
      if (!Number.isInteger(keyBits) || keyBits < 256 || keyBits > 8192) throw invalidParams("keyBits must be an integer between 256 and 8192.");
      return {
        ...estimateQuantumResources({ kind, keyBits, quantumBits: 0 }),
        physicalToLogicalRatio: SURFACE_CODE_RATIO,
      };
    },
  },
  {
    name: "import_survey",
    title: "Import a manifest or source excerpt as a new survey",
    description:
      "Runs the same extractor as the import form: parses the manifest for its ecosystem, scans the source excerpt for cryptographic call sites, resolves each one to a primitive, enriches up to eight dependencies from deps.dev and OSV, and writes an audit event.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: LIMITS.nameChars },
        repoHint: { type: "string", maxLength: 160, default: "" },
        manifest: { type: "string", maxLength: LIMITS.manifestChars, default: "" },
        source: { type: "string", maxLength: LIMITS.sourceChars, default: "" },
        idempotencyKey: { type: "string", maxLength: 120, description: "Replaying the same key returns the first result instead of importing twice." },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async handler(args, owner, idempotencyKey) {
      const cached = await readIdempotent(owner, "import_survey", idempotencyKey);
      if (cached) return { ...(cached as Record<string, unknown>), idempotentReplay: true };
      if (!String(args.manifest ?? "").trim() && !String(args.source ?? "").trim()) {
        throw invalidParams("Provide manifest, source, or both.");
      }
      const result = await createSurvey(owner, {
        name: String(args.name),
        repoHint: String(args.repoHint ?? ""),
        manifest: String(args.manifest ?? ""),
        source: String(args.source ?? ""),
      });
      const payload = { survey: result.survey, extraction: result.extraction };
      await writeIdempotent(owner, "import_survey", idempotencyKey, payload);
      return payload;
    },
  },
  {
    name: "record_decision",
    title: "Record a triage decision on one surface",
    description:
      "Sets the decision, the rationale and the data shelf life for a surface. This is the same write the workbench form performs, so the audit chain and the recomputed residual score are identical either way.",
    inputSchema: {
      type: "object",
      properties: {
        surfaceId: { type: "string", format: "uuid" },
        decision: { type: "string", enum: ["untriaged", "migrate-now", "scheduled", "accepted-risk", "not-applicable"] },
        decisionNote: { type: "string", maxLength: LIMITS.noteInputChars, default: "" },
        shelfLifeYears: { type: "integer", minimum: MIN_SHELF_LIFE, maximum: MAX_SHELF_LIFE },
        idempotencyKey: { type: "string", maxLength: 120 },
      },
      required: ["surfaceId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async handler(args, owner, idempotencyKey) {
      const cached = await readIdempotent(owner, "record_decision", idempotencyKey);
      if (cached) return { ...(cached as Record<string, unknown>), idempotentReplay: true };
      const surfaceId = String(args.surfaceId ?? "");
      if (!surfaceId) throw invalidParams("surfaceId is required.");
      const patch: Record<string, unknown> = {};
      if (typeof args.decision === "string") patch.decision = args.decision;
      if (typeof args.decisionNote === "string") patch.decisionNote = args.decisionNote;
      if (typeof args.shelfLifeYears === "number") patch.shelfLifeYears = args.shelfLifeYears;
      if (Object.keys(patch).length === 0) throw invalidParams("Send decision, decisionNote or shelfLifeYears.");
      const surface = await updateSurface(owner, surfaceId, patch as never);
      const survey = await getSurvey(owner, surface.surveyId);
      const payload = { surface, analysis: survey?.analysis ?? null, seal: survey?.lastSeal ?? null };
      await writeIdempotent(owner, "record_decision", idempotencyKey, payload);
      return payload;
    },
  },
  {
    name: "verify_integrity",
    title: "Replay the append-only seal chain",
    description: "Recomputes every SHA-384 seal from the genesis value and reports the first broken link, if any.",
    inputSchema: {
      type: "object",
      properties: { surveyId: { type: "string", format: "uuid" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async handler(args, owner) {
      const surveys = await listSurveys(owner, { includeRetired: true });
      const id = typeof args.surveyId === "string" ? args.surveyId : surveys[0]?.id;
      if (!id) throw invalidParams("This owner has no surveys yet.");
      return verifySurvey(owner, id);
    },
  },
  {
    name: "export_survey",
    title: "Build the migration plan document",
    description: "The same Markdown, JSON or CSV the export route serves, returned inline so an agent can hand the plan back to a user.",
    inputSchema: {
      type: "object",
      properties: {
        surveyId: { type: "string", format: "uuid" },
        format: { type: "string", enum: ["md", "json", "csv"], default: "md" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async handler(args, owner) {
      const surveys = await listSurveys(owner);
      const id = typeof args.surveyId === "string" ? args.surveyId : surveys[0]?.id;
      if (!id) throw invalidParams("This owner has no surveys yet.");
      const survey = await getSurvey(owner, id);
      if (!survey) throw new RpcError(-32602, `No survey with id ${id} belongs to this owner.`);
      const format = (typeof args.format === "string" ? args.format : "md") as ExportFormat;
      const payload = buildExport(survey, format);
      return { filename: payload.filename, contentType: payload.contentType, body: payload.body };
    },
  },
  {
    name: "delete_survey",
    title: "Retire a survey, keeping its audit trail",
    description:
      "Soft-deletes the survey and its surfaces. Rows are retained as tombstones so the seal chain stays replayable, and the public share link is revoked.",
    inputSchema: {
      type: "object",
      properties: {
        surveyId: { type: "string", format: "uuid" },
        idempotencyKey: { type: "string", maxLength: 120 },
      },
      required: ["surveyId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async handler(args, owner, idempotencyKey) {
      const cached = await readIdempotent(owner, "delete_survey", idempotencyKey);
      if (cached) return { ...(cached as Record<string, unknown>), idempotentReplay: true };
      const result = await deleteSurvey(owner, String(args.surveyId ?? ""));
      const payload = { ...result, tombstone: true };
      await writeIdempotent(owner, "delete_survey", idempotencyKey, payload);
      return payload;
    },
  },
];

const toolSchemas = TOOLS.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  annotations: tool.annotations,
}));

function ok(id: JsonRpcId, result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: { "cache-control": "no-store" } });
}

function err(id: JsonRpcId, code: number, message: string, data?: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message, data: data ?? null } }, { status: 200 });
}

async function resolveOwner(body: Record<string, unknown>): Promise<string> {
  const params = (body.params ?? {}) as Record<string, unknown>;
  const token = params.ownerToken ?? (body as { ownerToken?: unknown }).ownerToken;
  if (isValidSessionId(token)) {
    const db = await getDb();
    await ensureSchema(db);
    await ensureSessionRow(db, token);
    return token;
  }
  return currentSessionId();
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return err(null, -32700, "Parse error: the request body was not valid JSON.");
  }

  const body = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return err(null, -32600, "Invalid Request: expected a JSON-RPC object.");
  if (body.jsonrpc !== "2.0") return err((body.id as JsonRpcId) ?? null, -32600, "Invalid Request: jsonrpc must be \"2.0\".");

  const id = (body.id ?? null) as JsonRpcId;
  const method = typeof body.method === "string" ? body.method : "";

  if (id === null || id === undefined) {
    // Notification: no response body is required by JSON-RPC.
    return new Response(null, { status: 202 });
  }

  if (method === "initialize") {
    const owner = await resolveOwner(body);
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "pqc-triage", version: site.version, repository: site.repoUrl },
      instructions: `Post-quantum migration triage. Call import_survey with a real dependency manifest and/or source excerpt, then get_survey to read the scored surfaces, record_decision to triage each one, and export_survey to produce the plan. Owner scope: pass ownerToken (from this response) as params.ownerToken on later calls if your client does not keep cookies. ${site.repoUrl}`,
      ownerToken: owner,
    });
  }

  if (method === "ping") return ok(id, {});

  if (method === "tools/list") return ok(id, { tools: toolSchemas });

  if (method !== "tools/call") {
    return err(id, -32601, `Method not found: ${method}. This server implements initialize, ping, tools/list and tools/call.`);
  }

  const params = (body.params ?? {}) as Record<string, unknown>;
  const name = typeof params.name === "string" ? params.name : "";
  const tool = TOOLS.find((entry) => entry.name === name);
  if (!tool) {
    return err(id, -32602, `Unknown tool: ${name || "(missing)"}. Call tools/list for the available tools.`, {
      available: TOOLS.map((entry) => entry.name),
    });
  }

  const args = (params.arguments ?? {}) as Record<string, unknown>;
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return err(id, -32602, "Invalid params: arguments must be a JSON object.");
  }

  let owner: string;
  try {
    owner = await resolveOwner(body);
  } catch (error) {
    return err(id, -32603, "Internal error while resolving the owner scope.", {
      hint: error instanceof Error ? error.message : "unknown",
    });
  }

  const idempotencyKey =
    typeof args.idempotencyKey === "string" ? args.idempotencyKey : typeof params.idempotencyKey === "string" ? params.idempotencyKey : null;

  try {
    const result = await tool.handler(args, owner, idempotencyKey);
    return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false });
  } catch (error) {
    if (error instanceof RpcError) return err(id, error.code, error.message, error.data);
    if (error instanceof Error && error.name === "ApiError") {
      const apiError = error as Error & { code?: string };
      return err(id, -32602, error.message, { code: apiError.code ?? "validation_error" });
    }
    return err(id, -32603, "Internal error: the tool could not complete.", {
      hint: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      protocol: "mcp",
      protocolVersion: PROTOCOL_VERSION,
      transport: "http-jsonrpc",
      endpoint: site.mcpUrl,
      manifest: `${site.liveUrl}/mcp.json`,
      tools: toolSchemas.map((tool) => ({ name: tool.name, description: tool.description })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}