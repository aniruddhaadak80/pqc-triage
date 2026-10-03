import { describe, expect, it } from "vitest";
import { DEFAULT_HORIZON_YEAR, NIST_TIMELINE } from "./crypto-registry";
import {
  ENGINE_VERSION,
  FACTOR_WEIGHTS,
  analyzeSurvey,
  assessPrimitive,
  assessSurface,
  bandFor,
  engineContext,
  scoreSurface,
} from "./engine";
import type { Surface, SurfaceEnrichment } from "./types";

const NOW = new Date("2026-10-03T12:00:00.000Z");

function enrichment(overrides: Partial<SurfaceEnrichment> = {}): SurfaceEnrichment {
  return {
    latestVersion: null,
    latestVersionPublishedAt: null,
    license: null,
    advisoryCount: 0,
    worstAdvisory: null,
    depsDevStatus: "fallback",
    osvStatus: "fallback",
    fetchedAt: "2026-10-03T00:00:00.000Z",
    ...overrides,
  };
}

function surface(overrides: Partial<Surface> = {}): Surface {
  return {
    id: "s1",
    surveyId: "survey-1",
    label: "RSA-2048 key exchange",
    family: "kex-public",
    primitive: "rsa-2048",
    keyBits: 2048,
    usage: "session-establishment",
    origin: "source-scan",
    ecosystem: null,
    packageName: null,
    packageVersion: null,
    location: "lines 1",
    evidence: "generateKeyPairSync rsa",
    shelfLifeYears: 5,
    decision: "untriaged",
    decisionNote: "",
    decidedAt: null,
    familyFromModel: false,
    modelConfidence: null,
    enrichment: enrichment(),
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("bandFor", () => {
  it("maps scores to bands at the documented thresholds", () => {
    expect(bandFor(100)).toBe("critical");
    expect(bandFor(75)).toBe("critical");
    expect(bandFor(74)).toBe("high");
    expect(bandFor(55)).toBe("high");
    expect(bandFor(54)).toBe("medium");
    expect(bandFor(35)).toBe("medium");
    expect(bandFor(34)).toBe("low");
    expect(bandFor(15)).toBe("low");
    expect(bandFor(14)).toBe("clear");
    expect(bandFor(0)).toBe("clear");
  });
});

describe("assessPrimitive", () => {
  it("returns null for an unknown primitive instead of inventing a score", () => {
    expect(assessPrimitive({ primitive: "not-a-real-primitive", now: NOW })).toBeNull();
    expect(assessPrimitive({ primitive: "", now: NOW })).toBeNull();
  });

  it("scores public key broken by Shor near the top of the range", () => {
    const result = assessPrimitive({ primitive: "rsa-2048", shelfLifeYears: 5, now: NOW })!;
    expect(result.assessment.quantumBits).toBe(0);
    expect(result.assessment.score).toBeGreaterThan(70);
    expect(result.assessment.band).toBe("critical");
    expect(result.assessment.factors).toHaveLength(Object.keys(FACTOR_WEIGHTS).length);
  });

  it("scores a memory-hard password hash low", () => {
    const result = assessPrimitive({ primitive: "argon2id", shelfLifeYears: 0, now: NOW })!;
    expect(result.assessment.score).toBeLessThan(35);
    expect(["low", "clear", "medium"]).toContain(result.assessment.band);
  });

  it("scores a post-quantum key encapsulation near the floor", () => {
    const result = assessPrimitive({ primitive: "ml-kem-768", shelfLifeYears: 0, now: NOW })!;
    expect(result.assessment.score).toBeLessThan(25);
    expect(result.assessment.quantumBits).toBe(192);
  });

  it("handles the zero shelf-life boundary as no harvest window", () => {
    const zero = assessPrimitive({ primitive: "rsa-2048", shelfLifeYears: 0, now: NOW })!;
    const ten = assessPrimitive({ primitive: "rsa-2048", shelfLifeYears: 10, now: NOW })!;
    expect(zero.assessment.decryptableFrom).toBe(DEFAULT_HORIZON_YEAR);
    expect(ten.assessment.decryptableFrom).toBe(DEFAULT_HORIZON_YEAR - 10);
    expect(zero.assessment.score).toBeLessThan(ten.assessment.score);
  });

  it("clamps an absurd shelf life instead of producing a nonsense deadline", () => {
    const result = assessPrimitive({ primitive: "rsa-2048", shelfLifeYears: 100_000, now: NOW })!;
    expect(result.assessment.decryptableFrom).toBe(DEFAULT_HORIZON_YEAR - 60);
    expect(Number.isFinite(result.assessment.decryptWindowYears)).toBe(true);
  });

  it("treats a negative shelf life as zero", () => {
    const result = assessPrimitive({ primitive: "rsa-2048", shelfLifeYears: -5, now: NOW })!;
    expect(result.assessment.decryptableFrom).toBe(DEFAULT_HORIZON_YEAR);
  });

  it("moves the start-by year by exactly X plus Y", () => {
    const result = assessPrimitive({ primitive: "ecdsa-p256", shelfLifeYears: 25, now: NOW })!;
    // P-256 is 128-bit strength, so it is disallowed from 2035 with no 2030 deprecation.
    expect(result.row.deprecateBy).toBeNull();
    expect(result.assessment.mustStartBy).toBe(DEFAULT_HORIZON_YEAR - (25 + result.row.replacement.migrationLeadYears));
  });

  it("reports overdue when the start date has already passed", () => {
    const early = assessPrimitive({ primitive: "rsa-2048", shelfLifeYears: 40, horizonYear: 2028, now: NOW })!;
    expect(early.assessment.overdueByYears).toBeGreaterThan(0);
    const later = assessPrimitive({ primitive: "rsa-2048", shelfLifeYears: 1, horizonYear: 2040, now: NOW })!;
    expect(later.assessment.overdueByYears).toBe(0);
    expect(later.assessment.decryptableFrom).toBe(2039);
  });

  it("is deterministic across repeated calls with the same clock", () => {
    const input = { primitive: "aes-128", shelfLifeYears: 7, usage: "data-at-rest" as const, now: NOW };
    const runs = Array.from({ length: 12 }, () => assessPrimitive(input)!);
    for (const run of runs) {
      expect(JSON.stringify(run.assessment)).toBe(JSON.stringify(runs[0].assessment));
    }
  });

  it("keeps every factor contribution consistent with its weight and severity", () => {
    const result = assessPrimitive({ primitive: "3des", shelfLifeYears: 12, now: NOW })!;
    for (const factor of result.assessment.factors) {
      expect(factor.contribution).toBeCloseTo(factor.weight * factor.severity * 100, 6);
      expect(factor.severity).toBeGreaterThanOrEqual(0);
      expect(factor.severity).toBeLessThanOrEqual(1);
      expect(factor.detail.length).toBeGreaterThan(10);
      expect(factor.evidence.length).toBeGreaterThan(5);
    }
  });
});

describe("scoreSurface decisions", () => {
  const ctx = engineContext(DEFAULT_HORIZON_YEAR, NOW);

  it("does not change the current score when risk is accepted", () => {
    const row = assessPrimitive({ primitive: "rsa-2048", now: NOW })!;
    const untriaged = scoreSurface(
      { row: row.row, usage: "session-establishment", shelfLifeYears: 5, decision: "untriaged", enrichment: enrichment() },
      ctx,
    );
    const accepted = scoreSurface(
      { row: row.row, usage: "session-establishment", shelfLifeYears: 5, decision: "accepted-risk", enrichment: enrichment() },
      ctx,
    );
    expect(accepted.residualScore).toBe(untriaged.score);
  });

  it("drops the residual when the surface is committed to a replacement", () => {
    const row = assessPrimitive({ primitive: "rsa-2048", now: NOW })!;
    const untriaged = scoreSurface(
      { row: row.row, usage: "session-establishment", shelfLifeYears: 5, decision: "untriaged", enrichment: enrichment() },
      ctx,
    );
    const migrating = scoreSurface(
      { row: row.row, usage: "session-establishment", shelfLifeYears: 5, decision: "migrate-now", enrichment: enrichment() },
      ctx,
    );
    expect(migrating.residualScore).toBeLessThan(untriaged.score);
  });

  it("zeroes a surface marked not applicable", () => {
    const row = assessPrimitive({ primitive: "rsa-2048", now: NOW })!;
    const result = scoreSurface(
      { row: row.row, usage: "session-establishment", shelfLifeYears: 5, decision: "not-applicable", enrichment: enrichment() },
      ctx,
    );
    expect(result.score).toBe(0);
    expect(result.band).toBe("clear");
    expect(result.residualScore).toBe(0);
  });
});

describe("assessSurface", () => {
  const ctx = engineContext(DEFAULT_HORIZON_YEAR, NOW);

  it("carries the resource citation onto the assessment", () => {
    const assessment = assessSurface(surface(), ctx);
    expect(assessment.resource.citation).toContain("Gidney");
    expect(assessment.resource.logicalQubits).toBe(6189);
  });

  it("does not throw on an unrecognised primitive", () => {
    const assessment = assessSurface(surface({ primitive: "made-up", label: "made up" }), ctx);
    expect(Number.isFinite(assessment.score)).toBe(true);
    expect(assessment.factors.length).toBeGreaterThan(0);
  });

  it("cites NIST on the deprecation and disallowance factors", () => {
    const assessment = assessSurface(surface(), ctx);
    const schedule = assessment.factors.find((factor) => factor.key === "schedule")!;
    expect(schedule.evidence).toContain(String(NIST_TIMELINE.deprecateBy));
  });

  it("reports the live supply signal honestly when enrichment is missing", () => {
    const assessment = assessSurface(surface({ origin: "dependency", packageName: "nothing" }), ctx);
    const supply = assessment.factors.find((factor) => factor.key === "supply")!;
    expect(supply.detail).toContain("neutral");
    expect(supply.severity).toBeCloseTo(0.5, 6);
  });

  it("uses the advisory count when live enrichment exists", () => {
    const assessment = assessSurface(
      surface({
        origin: "dependency",
        packageName: "x",
        enrichment: enrichment({ advisoryCount: 5, osvStatus: "live", latestVersionPublishedAt: "2015-01-01T00:00:00.000Z" }),
      }),
      ctx,
    );
    const supply = assessment.factors.find((factor) => factor.key === "supply")!;
    expect(supply.detail).toContain("5 known advisories");
    expect(supply.severity).toBeGreaterThan(0.5);
  });
});

describe("analyzeSurvey", () => {
  const ctx = engineContext(DEFAULT_HORIZON_YEAR, NOW);

  it("returns an empty analysis for an empty survey rather than dividing by zero", () => {
    const analysis = analyzeSurvey("empty", [], ctx);
    expect(analysis.score).toBe(0);
    expect(analysis.band).toBe("clear");
    expect(analysis.surfaceCount).toBe(0);
    expect(analysis.weakestSurface).toBeNull();
    expect(analysis.exposureYears).toBe(0);
    expect(analysis.engineVersion).toBe(ENGINE_VERSION);
  });

  it("ignores soft-deleted surfaces", () => {
    const analysis = analyzeSurvey(
      "one",
      [surface({ id: "a" }), surface({ id: "b", deletedAt: "2026-10-02T00:00:00.000Z" })],
      ctx,
    );
    expect(analysis.surfaceCount).toBe(1);
  });

  it("sorts the worst surface first and records it as weakest", () => {
    const analysis = analyzeSurvey(
      "one",
      [surface({ id: "a", primitive: "ml-kem-768" }), surface({ id: "b", primitive: "rsa-2048" })],
      ctx,
    );
    expect(analysis.surfaces[0].surfaceId).toBe("b");
    expect(analysis.weakestSurface?.id).toBe("b");
  });

  it("is deterministic for the same input and clock", () => {
    const surfaces = [
      surface({ id: "a" }),
      surface({ id: "b", primitive: "md5" }),
      surface({ id: "c", primitive: "aes-256" }),
    ];
    const first = JSON.stringify(analyzeSurvey("one", surfaces, ctx));
    for (let i = 0; i < 10; i += 1) {
      expect(JSON.stringify(analyzeSurvey("one", surfaces, ctx))).toBe(first);
    }
  });

  it("lowers the residual score when every surface is committed", () => {
    const surfaces = [surface({ id: "a" }), surface({ id: "b", primitive: "ecdsa-p256" })];
    const before = analyzeSurvey("one", surfaces, ctx);
    const after = analyzeSurvey(
      "one",
      surfaces.map((entry) => ({ ...entry, decision: "migrate-now" as const })),
      ctx,
    );
    expect(after.residualScore).toBeLessThan(before.residualScore);
    expect(after.triagedCount).toBe(2);
  });

  it("counts overdue surfaces", () => {
    const early = engineContext(2028, NOW);
    const analysis = analyzeSurvey("one", [surface({ id: "a", shelfLifeYears: 40 })], early);
    expect(analysis.overdueCount).toBe(1);
  });

  it("exposes the soonest decryption window", () => {
    const analysis = analyzeSurvey(
      "one",
      [surface({ id: "a", shelfLifeYears: 1 }), surface({ id: "b", shelfLifeYears: 30 })],
      ctx,
    );
    expect(analysis.exposureYears).toBeLessThan(3);
  });
});