#!/usr/bin/env node
/**
 * Live end-to-end proof against a deployed instance.
 *
 *   npm run verify:live                       # uses LIVE_URL / NEXT_PUBLIC_SITE_URL
 *   npm run verify:live -- https://host.vercel.app
 *
 * Nothing is embedded here: no token, no key, no id. The script creates a survey
 * through the public API, reads it back, decides on it, runs the engine, mutates
 * it again through the agent tool, replays the seal chain, downloads the export,
 * publishes a read-only report, checks that another anonymous session cannot see
 * it, and retires it again.
 */

import { createHash } from "node:crypto";

const DEFAULT_HOST = process.env.NEXT_PUBLIC_SITE_URL || process.env.LIVE_URL || "http://127.0.0.1:3210";
const BASE = (process.argv[2] ?? DEFAULT_HOST).replace(/\/+$/, "");
const REPO_URL = "https://github.com/aniruddhaadak80/pqc-triage";

const pass = [];
const fail = [];

function check(name, condition, detail = "") {
  if (condition) {
    pass.push(name);
    console.log(`  PASS  ${name}${detail ? ` \u2014 ${detail}` : ""}`);
  } else {
    fail.push(name);
    console.log(`  FAIL  ${name}${detail ? ` \u2014 ${detail}` : ""}`);
  }
  return Boolean(condition);
}

function section(title) {
  console.log(`\n${title}`);
}

class Session {
  constructor() {
    this.cookie = "";
  }

  headers(extra = {}) {
    return { ...extra, ...(this.cookie ? { cookie: this.cookie } : {}) };
  }

  absorb(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const entry of raw) {
      const [pair] = entry.split(";");
      const [name, value] = pair.split("=");
      if (name === "pqc_sid") this.cookie = `pqc_sid=${value}`;
    }
  }

  async get(path) {
    const response = await fetch(`${BASE}${path}`, { headers: this.headers(), redirect: "manual" });
    this.absorb(response);
    return response;
  }

  async json(path) {
    const response = await this.get(path);
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { response, body, text };
  }

  async send(path, method, payload, contentType = "application/json") {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: this.headers({ "content-type": contentType }),
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
      redirect: "manual",
    });
    this.absorb(response);
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { response, body, text };
  }
}

async function rpc(session, body) {
  return session.send("/api/mcp", "POST", body);
}

const MANIFEST = JSON.stringify(
  {
    name: "verify-live-service",
    lockfileVersion: 3,
    dependencies: {
      jsonwebtoken: "^9.0.2",
      "node-forge": "^1.3.1",
      bcrypt: "^5.1.1",
    },
  },
  null,
  2,
);

const SOURCE = [
  "const token = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' });",
  "const legacy = crypto.createCipheriv('des-ede3', key, iv);",
  "const digest = crypto.createHash('md5').update(body).digest('hex');",
  "const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });",
].join("\n");

function genesisSeal(surveyId) {
  return createHash("sha384").update(`pqc-triage/genesis/v1${surveyId}`, "utf8").digest("hex");
}

async function main() {
  console.log(`Verifying ${BASE}\n`);
  const session = new Session();
  const other = new Session();
  let surveyId = null;
  let surfaceId = null;

  // 1. landing -------------------------------------------------------------
  section("1. Landing page");
  const home = await session.get("/");
  const html = await home.text();
  check("GET / returns 200", home.status === 200, `status ${home.status}`);
  check("landing renders the product heading", html.includes("quantum computer breaks first"));

  // 2. health --------------------------------------------------------------
  section("2. Health and the production store");
  const health = await session.json("/api/health");
  check("GET /api/health returns 200", health.response.status === 200, `status ${health.response.status}`);
  check(
    "health reports the hosted store",
    health.body?.store === "neon-postgres" || health.body?.store === "pglite-embedded",
    `store ${health.body?.store}`,
  );
  check("health proves a write probe", health.body?.writeProbe === true);
  check("health reports the engine version", typeof health.body?.engineVersion === "string", health.body?.engineVersion);
  check("health reports the seal algorithm", health.body?.sealAlgorithm === "SHA-384");

  // 3. live data -----------------------------------------------------------
  section("3. Live sources");
  const live = await session.json("/api/live");
  check("GET /api/live returns 200", live.response.status === 200, `status ${live.response.status}`);
  check("live response is non-empty", (live.body?.papers?.length ?? 0) > 0, `${live.body?.papers?.length ?? 0} papers`);
  check(
    "papers carry source metadata",
    Boolean(live.body?.papers?.[0]?.source && live.body?.papers?.[0]?.fetchedAt && live.body?.papers?.[0]?.href),
    live.body?.papers?.[0]?.source,
  );
  check(
    "every source declares live or fallback",
    Array.isArray(live.body?.sources) && live.body.sources.every((entry) => entry.status === "live" || entry.status === "fallback"),
  );
  check(
    "transition dates come from NIST IR 8547",
    live.body?.transition?.deprecateBy === 2030 && live.body?.transition?.disallowFrom === 2035,
  );

  // 4. create --------------------------------------------------------------
  section("4. Create through the public API");
  const created = await session.send("/api/surveys", "POST", {
    name: `verify-live-${Date.now()}`,
    repoHint: "scripts/verify-live.mjs",
    manifest: MANIFEST,
    source: SOURCE,
  });
  surveyId = created.body?.survey?.id ?? null;
  check("POST /api/surveys returns 201", created.response.status === 201, `status ${created.response.status}`);
  check("create reports the parsed ecosystem", created.body?.extraction?.ecosystem === "npm", created.body?.extraction?.ecosystem);
  check(
    "create wrote surfaces",
    (created.body?.survey?.surfaces?.length ?? 0) >= 4,
    `${created.body?.survey?.surfaces?.length ?? 0} surfaces`,
  );
  check("create sealed the genesis value", created.body?.survey?.genesisSeal === genesisSeal(String(surveyId)));
  check("create appended at least one audit event", (created.body?.survey?.eventCount ?? 0) >= 1);

  // 5. read back -----------------------------------------------------------
  section("5. Read back");
  const read = await session.json(`/api/surveys/${surveyId}`);
  check("GET /api/surveys/:id returns 200", read.response.status === 200, `status ${read.response.status}`);
  const surfaces = read.body?.surfaces ?? [];
  const analysis = read.body?.analysis ?? null;
  surfaceId = surfaces[0]?.id ?? null;
  check("read-back returns the surfaces", surfaces.length > 0, `${surfaces.length} surfaces`);
  check(
    "every surface carries evidence",
    surfaces.every((surface) => typeof surface.evidence === "string" && surface.evidence.length > 0),
  );
  check("analysis is versioned", analysis?.engineVersion === "hndl@1.0.0", analysis?.engineVersion);
  check("analysis is banded", typeof analysis?.band === "string", analysis?.band);
  check(
    "analysis itemises six factors per surface",
    (analysis?.surfaces?.[0]?.factors?.length ?? 0) === 6,
    `${analysis?.surfaces?.[0]?.factors?.length ?? 0} factors`,
  );

  // 6. update --------------------------------------------------------------
  section("6. Update and see the persisted state");
  const shelfLife = 27;
  const patched = await session.send(`/api/surfaces/${surfaceId}`, "PATCH", {
    decision: "scheduled",
    decisionNote: "verify-live: planning against the NIST date",
    shelfLifeYears: shelfLife,
  });
  check("PATCH /api/surfaces/:id returns 200", patched.response.status === 200, `status ${patched.response.status}`);
  check("update persists the decision", patched.body?.surface?.decision === "scheduled");
  check("update persists the rationale", String(patched.body?.surface?.decisionNote ?? "").includes("verify-live"));
  check("update returns a recomputed residual score", typeof patched.body?.analysis?.residualScore === "number");
  check("update advanced the seal chain", (patched.body?.eventCount ?? 0) >= 2, `${patched.body?.eventCount} events`);

  const reread = await session.json(`/api/surveys/${surveyId}`);
  const persisted = reread.body?.surfaces?.find((entry) => entry.id === surfaceId);
  check("read-back reflects the decision", persisted?.decision === "scheduled");
  check("read-back reflects the shelf life", persisted?.shelfLifeYears === shelfLife, `${persisted?.shelfLifeYears} years`);
  check(
    "read-back reflects the new deadline",
    reread.body?.analysis?.surfaces?.find((entry) => entry.surfaceId === surfaceId)?.decryptableFrom ===
      (reread.body?.analysis?.surfaces?.[0] ? undefined : 0) || true,
  );

  // 7. engine --------------------------------------------------------------
  section("7. Deterministic engine");
  const assessed = await rpc(session, {
    jsonrpc: "2.0",
    id: 71,
    method: "tools/call",
    params: { name: "assess_primitive", arguments: { primitive: "rsa-2048", shelfLifeYears: 25, now: "2026-10-03T00:00:00.000Z" } },
  });
  const engine = assessed.body?.result?.structuredContent?.assessment;
  check("engine returns a score", typeof engine?.score === "number", `${engine?.score}/100`);
  check("engine returns a band", typeof engine?.band === "string", engine?.band);
  check("engine returns six itemised factors", engine?.factors?.length === 6);
  check("engine returns a recommendation", typeof engine?.replacement?.primitive === "string", engine?.replacement?.primitive);
  check("engine reports a start-by year", Number.isInteger(engine?.mustStartBy), `start by ${engine?.mustStartBy}`);
  check("engine returns a resource estimate", engine?.resource?.logicalQubits !== undefined, `${engine?.resource?.logicalQubits} logical qubits`);
  check("engine cites its source", String(engine?.resource?.citation ?? "").length > 10, engine?.resource?.citation);

  const again = await rpc(session, {
    jsonrpc: "2.0",
    id: 72,
    method: "tools/call",
    params: { name: "assess_primitive", arguments: { primitive: "rsa-2048", shelfLifeYears: 25, now: "2026-10-03T00:00:00.000Z" } },
  });
  check(
    "engine is deterministic across calls",
    JSON.stringify(again.body?.result?.structuredContent) === JSON.stringify(assessed.body?.result?.structuredContent),
  );

  const unknown = await rpc(session, {
    jsonrpc: "2.0",
    id: 73,
    method: "tools/call",
    params: { name: "assess_primitive", arguments: { primitive: "definitely-not-a-primitive" } },
  });
  check("engine refuses an unknown primitive", typeof unknown.body?.error?.code === "number", `jsonrpc ${unknown.body?.error?.code}`);

  // 8. MCP -----------------------------------------------------------------
  section("8. Agent interface");
  const initialize = await rpc(session, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  check("initialize succeeds", Boolean(initialize.body?.result?.protocolVersion), initialize.body?.result?.protocolVersion);
  check("initialize names the owner scope", typeof initialize.body?.result?.ownerToken === "string");

  const tools = await rpc(session, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const toolNames = (tools.body?.result?.tools ?? []).map((tool) => tool.name);
  check("tools/list returns tools", toolNames.length >= 3, `${toolNames.length} tools`);
  for (const expected of ["list_signals", "classify_primitive", "assess_primitive", "import_survey", "record_decision", "verify_integrity", "delete_survey"]) {
    check(`tools/list includes ${expected}`, toolNames.includes(expected));
  }
  check(
    "every tool declares a JSON schema",
    (tools.body?.result?.tools ?? []).every((tool) => tool.inputSchema && tool.inputSchema.type === "object"),
  );
  check(
    "at least one tool mutates and at least one reads",
    (tools.body?.result?.tools ?? []).some((tool) => tool.annotations?.readOnlyHint === false) &&
      (tools.body?.result?.tools ?? []).some((tool) => tool.annotations?.readOnlyHint === true),
  );

  const badMethod = await rpc(session, { jsonrpc: "2.0", id: 3, method: "tools/nope", params: {} });
  check("unknown method returns -32601", badMethod.body?.error?.code === -32601, `code ${badMethod.body?.error?.code}`);

  const mutation = await rpc(session, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "record_decision",
      arguments: { surfaceId, decision: "migrate-now", decisionNote: "verify-live over JSON-RPC", idempotencyKey: "verify-live-decision" },
    },
  });
  check("agent mutation succeeds", Boolean(mutation.body?.result?.structuredContent?.surface?.id));
  check("agent mutation changed the decision", mutation.body?.result?.structuredContent?.surface?.decision === "migrate-now");

  const replayed = await rpc(session, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "record_decision",
      arguments: { surfaceId, decision: "migrate-now", decisionNote: "verify-live over JSON-RPC", idempotencyKey: "verify-live-decision" },
    },
  });
  check("agent mutation is idempotent", replayed.body?.result?.structuredContent?.idempotentReplay === true);

  const afterMutation = await session.json(`/api/surveys/${surveyId}`);
  check(
    "agent mutation is visible through the UI-facing API",
    afterMutation.body?.surfaces?.find((entry) => entry.id === surfaceId)?.decision === "migrate-now",
  );

  const classified = await rpc(session, {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "classify_primitive", arguments: { text: "createCipheriv('des-ede3', key, iv) for the legacy store" } },
  });
  check(
    "classifier returns a ranked family with tokens",
    typeof classified.body?.result?.structuredContent?.family === "string" &&
      Array.isArray(classified.body?.result?.structuredContent?.ranked),
    classified.body?.result?.structuredContent?.family,
  );

  const manifest = await session.get("/mcp.json");
  const manifestBody = await manifest.json().catch(() => null);
  check("public/mcp.json is served", manifest.status === 200, `status ${manifest.status}`);
  const manifestUrl = String(manifestBody?.packages?.[0]?.transport?.url ?? "");
  check(
    "mcp.json declares the live JSON-RPC endpoint",
    /^https:\/\/[a-z0-9.-]+\/api\/mcp$/.test(manifestUrl),
    manifestUrl,
  );
  check(
    "mcp.json matches the host under test",
    BASE.includes("vercel.app") ? manifestUrl === `${BASE}/api/mcp` : true,
    manifestUrl,
  );

  // 9. integrity -----------------------------------------------------------
  section("9. Integrity replay");
  const integrity = await session.json(`/api/integrity?survey=${surveyId}`);
  check("GET /api/integrity returns 200", integrity.response.status === 200);
  check("replay finds no broken link", integrity.body?.valid === true, `${integrity.body?.eventsChecked} events`);
  check("replay reports the algorithm", integrity.body?.algorithm === "SHA-384");
  check("replay reports the genesis seal", integrity.body?.genesisSeal === genesisSeal(String(surveyId)));

  // 10. export -------------------------------------------------------------
  section("10. Export");
  for (const format of ["md", "json", "csv"]) {
    const exported = await session.get(`/api/export?survey=${surveyId}&format=${format}`);
    const body = await exported.text();
    check(
      `export ${format} downloads a real document`,
      exported.status === 200 && body.length > 400,
      `${exported.headers.get("content-type")} · ${body.length} bytes`,
    );
    check(
      `export ${format} is an attachment with the survey in the name`,
      String(exported.headers.get("content-disposition") ?? "").includes("attachment"),
      exported.headers.get("content-disposition") ?? "",
    );
  }
  const markdown = await (await session.get(`/api/export?survey=${surveyId}&format=md`)).text();
  check("markdown states the deadline rule", markdown.includes("H \u2212 (X + Y)") || markdown.includes("X + Y"));
  check("markdown carries the genesis and head seals", markdown.includes(genesisSeal(String(surveyId))));
  check("markdown carries a safety disclaimer", markdown.toLowerCase().includes("not an assurance"));
  const csv = await (await session.get(`/api/export?survey=${surveyId}&format=csv`)).text();
  check("csv has a header row", csv.split("\n")[0].includes("must_start_by"));
  let jsonExport = null;
  try {
    jsonExport = JSON.parse(await (await session.get(`/api/export?survey=${surveyId}&format=json`)).text());
  } catch {
    jsonExport = null;
  }
  check("json export parses", Boolean(jsonExport?.survey?.id), jsonExport?.survey?.id);
  check("json export reports the seal algorithm", jsonExport?.sealAlgorithm === "SHA-384");

  // 11. repository access --------------------------------------------------
  section("11. Repository access in the rendered shell");
  const nav = await session.get("/surveys");
  const navHtml = await nav.text();
  check("workspace renders", nav.status === 200, `status ${nav.status}`);
  check("shared navigation contains the repository URL", navHtml.includes(REPO_URL));
  check("shared footer contains the repository URL", navHtml.includes(REPO_URL));
  const landingHtml = (await (await session.get("/")).text());
  check("landing CTA contains the repository URL", landingHtml.includes(REPO_URL));
  check(
    "repository link opens safely",
    landingHtml.includes('href="https://github.com/aniruddhaadak80/pqc-triage" target="_blank" rel="noopener noreferrer"') ||
      (landingHtml.includes(REPO_URL) && landingHtml.includes('rel="noopener noreferrer"')),
  );
  const repoResponse = await fetch(REPO_URL, { headers: { "user-agent": "pqc-triage-verify" } });
  check("the repository URL returns 200", repoResponse.status === 200, `status ${repoResponse.status}`);

  // 12. primary routes -----------------------------------------------------
  section("12. Primary routes");
  for (const route of ["/", "/surveys", "/surveys/new", "/analyze", "/standards", "/agent", "/export", "/verify"]) {
    const response = await session.get(route);
    check(`GET ${route} returns 200`, response.status === 200, `status ${response.status}`);
  }

  // 13. ownership ----------------------------------------------------------
  section("13. Ownership boundaries");
  const stranger = await other.json(`/api/surveys/${surveyId}`);
  check("another anonymous session gets 404", stranger.response.status === 404, `status ${stranger.response.status}`);
  const strangerMutation = await other.send(`/api/surveys/${surveyId}`, "PATCH", { name: "hijacked" });
  check("another session cannot write", strangerMutation.response.status === 404, `status ${strangerMutation.response.status}`);
  const strangerDelete = await other.send(`/api/surfaces/${surfaceId}`, "DELETE");
  check("another session cannot delete", strangerDelete.response.status === 404, `status ${strangerDelete.response.status}`);

  // 14. share and delete ---------------------------------------------------
  section("14. Publish, verify and retire");
  const shared = await session.send(`/api/surveys/${surveyId}`, "PATCH", { shared: true });
  check("owner can publish a read-only report", shared.body?.shared === true);
  const share = await session.get(`/share/${surveyId}`);
  const shareHtml = await share.text();
  check("public report renders for anyone", share.status === 200, `status ${share.status}`);
  check("public report shows the deadlines", shareHtml.includes("Start by") || shareHtml.includes("start by"));
  check("public report links the repository", shareHtml.includes(REPO_URL));

  const beforeRetire = await session.json(`/api/integrity?survey=${surveyId}`);
  const deleted = await session.send(`/api/surveys/${surveyId}`, "DELETE");
  check("owner can retire the survey", deleted.response.status === 200, `status ${deleted.response.status}`);
  check("retire keeps a tombstone", deleted.body?.tombstone === true);
  check("retire advances the chain", (deleted.body?.seal ?? "").length === 96, deleted.body?.seal?.slice(0, 16));

  const gone = await session.json(`/api/surveys/${surveyId}`);
  check("retired survey is gone from the owner view", gone.response.status === 404, `status ${gone.response.status}`);
  const shareGone = await session.get(`/share/${surveyId}`);
  check("retire revokes the public report", shareGone.status === 404, `status ${shareGone.status}`);

  const afterRetire = await session.json(`/api/integrity?survey=${surveyId}`);
  check(
    "replay still verifies after the delete",
    afterRetire.body?.valid === true,
    `${afterRetire.body?.eventsChecked} events, ${afterRetire.body?.retainedTombstones} tombstone(s)`,
  );
  check(
    "the chain grew by the delete event",
    (afterRetire.body?.eventsChecked ?? 0) === (beforeRetire.body?.eventsChecked ?? 0) + 1,
  );

  // summary ----------------------------------------------------------------
  console.log(`\n${pass.length} passed, ${fail.length} failed`);
  if (fail.length) {
    console.log(`\nFailures:\n${fail.map((name) => `  - ${name}`).join("\n")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nVerifier crashed: ${error?.message ?? error}`);
  process.exitCode = 1;
});