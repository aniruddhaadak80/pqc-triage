import { describe, expect, it } from "vitest";
import { DEFAULT_HORIZON_YEAR } from "./crypto-registry";
import { analyzeSurvey, engineContext } from "./engine";
import { buildCsv, buildExport, buildJson, buildMarkdown } from "./export";
import type { Surface, Survey, SurveyAnalysis } from "./types";

const NOW = new Date("2026-10-03T12:00:00.000Z");

function surface(overrides: Partial<Surface>): Surface {
  return {
    id: "s1",
    surveyId: "survey-1",
    label: "node-forge RSA key exchange",
    family: "kex-public",
    primitive: "rsa-2048",
    keyBits: 2048,
    usage: "session-establishment",
    origin: "dependency",
    ecosystem: "npm",
    packageName: "node-forge",
    packageVersion: "1.3.1",
    location: "npm dependency node-forge@1.3.1",
    evidence: "node-forge is on the curated cryptographic dependency list.",
    shelfLifeYears: 5,
    decision: "migrate-now",
    decisionNote: "Hybrid KEM in the next release train.",
    decidedAt: "2026-10-02T00:00:00.000Z",
    familyFromModel: false,
    modelConfidence: null,
    enrichment: {
      latestVersion: "1.3.1",
      latestVersionPublishedAt: "2022-03-24T00:00:00.000Z",
      license: "BSD-3-Clause",
      advisoryCount: 2,
      worstAdvisory: "GHSA-x4jg-mjrx-434g",
      depsDevStatus: "live",
      osvStatus: "live",
      fetchedAt: "2026-10-03T00:00:00.000Z",
    },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function survey(overrides: Partial<Survey> = {}): Survey {
  const surfaces = [surface({})];
  const analysis: SurveyAnalysis = analyzeSurvey("survey-1", surfaces, engineContext(DEFAULT_HORIZON_YEAR, NOW));
  return {
    id: "survey-1",
    name: "billing-gateway",
    repoHint: "repo:acme/gateway",
    ecosystem: "npm",
    horizonYear: DEFAULT_HORIZON_YEAR,
    shared: false,
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    deletedAt: null,
    genesisSeal: "a".repeat(96),
    lastSeal: "b".repeat(96),
    eventCount: 3,
    analysis,
    surfaces,
    ...overrides,
  };
}

describe("markdown export", () => {
  const body = buildMarkdown(survey());

  it("leads with the survey name and an outcome line", () => {
    expect(body).toContain("# billing-gateway");
    expect(body).toContain("post-quantum migration plan");
  });

  it("states the deadline rule and the horizon it used", () => {
    expect(body).toContain("Mosca");
    expect(body).toContain(String(DEFAULT_HORIZON_YEAR));
  });

  it("carries a per-surface row with the start-by year and the replacement", () => {
    expect(body).toContain("| Surface | Primitive | Role | X (yrs) | Score | Start by |");
    expect(body).toContain("rsa-2048");
    expect(body).toContain("ML-KEM-768");
  });

  it("includes the six factor rows for the surface", () => {
    expect(body).toContain("Harvest-now-decrypt-later window");
    expect(body).toContain("Quantum security strength");
    expect(body).toContain("Migration headroom");
    expect(body).toContain("Classical weakness");
    expect(body).toContain("Dependency supply signal");
    expect(body).toContain("What this primitive protects");
  });

  it("records the seals, the algorithm and the replay URL", () => {
    expect(body).toContain("SHA-384");
    expect(body).toContain("a".repeat(96));
    expect(body).toContain("b".repeat(96));
    expect(body).toContain("/api/integrity?survey=survey-1");
  });

  it("records live provenance per dependency with its source status", () => {
    expect(body).toContain("node-forge");
    expect(body).toContain("2022-03-24");
    expect(body).toContain("BSD-3-Clause");
    expect(body).toContain("deps.dev");
    expect(body).toContain("OSV");
  });

  it("carries a safety disclaimer and the citation list", () => {
    expect(body.toLowerCase()).toContain("not an assurance");
    expect(body).toContain("Gidney");
    expect(body).toContain("NIST IR 8547");
  });

  it("escapes pipe characters so the table cannot be broken by data", () => {
    const hostile = survey({ surfaces: [surface({ label: "a | b" })] });
    const hostileAnalysis = analyzeSurvey("survey-1", hostile.surfaces, engineContext(DEFAULT_HORIZON_YEAR, NOW));
    const output = buildMarkdown({ ...hostile, analysis: hostileAnalysis });
    const row = output.split("\n").find((line) => line.includes("a | b") || line.includes("a / b"))!;
    expect(row).toBeDefined();
    for (const cell of row.split("|")) expect(cell.trim()).not.toBe("");
  });
});

describe("json export", () => {
  it("is valid JSON with the survey, analysis and citations", () => {
    const parsed = JSON.parse(buildJson(survey())) as Record<string, unknown>;
    expect(parsed.product).toBe("PQC Triage");
    expect(parsed.survey).toMatchObject({ id: "survey-1", name: "billing-gateway" });
    expect(Array.isArray(parsed.surfaces)).toBe(true);
    expect((parsed.surfaces as unknown[]).length).toBe(1);
    expect(parsed.citations).toBeTruthy();
    expect(parsed.sealAlgorithm).toBe("SHA-384");
  });

  it("is stable for the same survey", () => {
    const a = JSON.parse(buildJson(survey())) as Record<string, unknown>;
    const b = JSON.parse(buildJson(survey())) as Record<string, unknown>;
    expect((a.survey as Record<string, unknown>).id).toBe((b.survey as Record<string, unknown>).id);
  });
});

describe("csv export", () => {
  const csv = buildCsv(survey());

  it("has a header row and one row per surface", () => {
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("must_start_by");
    expect(lines[0]).toContain("decrypt_window_years");
    expect(lines[1]).toContain("rsa-2048");
  });

  it("quotes and escapes values containing commas or quotes", () => {
    const hostile = survey({ surfaces: [surface({ label: 'weird, "label"' })] });
    const analysis = analyzeSurvey("survey-1", hostile.surfaces, engineContext(DEFAULT_HORIZON_YEAR, NOW));
    const row = buildCsv({ ...hostile, analysis }).trim().split("\n")[1];
    expect(row).toContain('"weird, ""label"""');
  });
});

describe("buildExport", () => {
  it("returns the right content type and filename per format", () => {
    const md = buildExport(survey(), "md");
    expect(md.contentType).toContain("text/markdown");
    expect(md.filename).toBe("billing-gateway-migration-plan.md");

    const json = buildExport(survey(), "json");
    expect(json.contentType).toContain("application/json");
    expect(json.filename).toBe("billing-gateway-migration-plan.json");

    const csv = buildExport(survey(), "csv");
    expect(csv.contentType).toContain("text/csv");
    expect(csv.filename).toBe("billing-gateway-migration-plan.csv");
  });

  it("slugifies awkward names so the filename is safe", () => {
    const awkward = survey({ name: "  ACME / Gateway (prod)  " });
    expect(buildExport(awkward, "md").filename).toBe("acme-gateway-prod-migration-plan.md");
  });

  it("falls back to a usable filename when the name has no safe characters", () => {
    expect(buildExport(survey({ name: "***" }), "md").filename).toBe("survey-migration-plan.md");
  });

  it("handles an empty survey without throwing", () => {
    const empty = survey({ surfaces: [], analysis: analyzeSurvey("survey-1", [], engineContext(DEFAULT_HORIZON_YEAR, NOW)) });
    expect(buildMarkdown(empty)).toContain("Nothing was discovered");
    expect(buildCsv(empty).trim().split("\n")).toHaveLength(1);
    expect(() => JSON.parse(buildJson(empty))).not.toThrow();
  });
});