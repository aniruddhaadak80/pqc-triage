import {
  CITATIONS,
  DEFAULT_HORIZON_YEAR,
  MAX_HORIZON_YEAR,
  MAX_SHELF_LIFE,
  MIN_SHELF_LIFE,
  NIST_TIMELINE,
  findPrimitive,
  resolvePrimitive,
  type PrimitiveRow,
} from "./crypto-registry";
import { describeResource, estimateQuantumResources, resourceTargetFor } from "./resource";
import type {
  Decision,
  Factor,
  RiskBand,
  Surface,
  SurfaceAssessment,
  SurveyAnalysis,
  Usage,
} from "./types";

/**
 * hndl \u2014 harvest-now-decrypt-later triage.
 *
 * The deadline arithmetic is Mosca's: if data must stay confidential for X years
 * after capture and the migration takes Y years, and a cryptographically
 * relevant quantum computer arrives in H, then work must start by H - (X + Y).
 * Everything else is a weighted, itemised pressure score over six factors, so a
 * number on screen always comes with the sentence that produced it.
 */

export const ENGINE_VERSION = "hndl@1.0.0";

export const FACTOR_WEIGHTS = {
  harvest: 0.26,
  quantumBits: 0.22,
  schedule: 0.18,
  classical: 0.14,
  supply: 0.12,
  usage: 0.08,
} as const;

const USAGE_SEVERITY: Record<Usage, number> = {
  "session-establishment": 1,
  "key-generation": 0.9,
  "certificate-authority": 0.95,
  "code-signing": 0.85,
  "data-in-transit": 0.8,
  "data-at-rest": 0.6,
  "password-storage": 0.35,
  unknown: 0.5,
};

const USAGE_WEIGHT: Record<Usage, number> = {
  "session-establishment": 1.3,
  "certificate-authority": 1.2,
  "key-generation": 1.15,
  "code-signing": 1.1,
  "data-in-transit": 1,
  "data-at-rest": 0.8,
  "password-storage": 0.6,
  unknown: 0.7,
};

export const BANDS: readonly { band: RiskBand; min: number }[] = [
  { band: "critical", min: 75 },
  { band: "high", min: 55 },
  { band: "medium", min: 35 },
  { band: "low", min: 15 },
  { band: "clear", min: 0 },
];

export function bandFor(score: number): RiskBand {
  for (const entry of BANDS) {
    if (score >= entry.min) return entry.band;
  }
  return "clear";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampShelfLife(years: number): number {
  if (!Number.isFinite(years)) return 10;
  return Math.min(MAX_SHELF_LIFE, Math.max(MIN_SHELF_LIFE, Math.round(years)));
}

function monthsSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return (now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

/** Fractional year position, so a horizon set for December is not treated as January. */
function yearFraction(now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const end = Date.UTC(now.getUTCFullYear() + 1, 0, 1);
  const ratio = (now.getTime() - start) / (end - start);
  return now.getUTCFullYear() + clamp01(ratio);
}

export type EngineContext = {
  now: Date;
  horizonYear: number;
};

export function defaultContext(now = new Date()): EngineContext {
  return { now, horizonYear: DEFAULT_HORIZON_YEAR };
}

/** The context every read path uses, so the UI, REST and agent agree by construction. */
export function engineContext(horizonYear: number, now = new Date()): EngineContext {
  return { now, horizonYear };
}

function supplyFactor(surface: Surface, now: Date): { severity: number; evidence: string } {
  const enrichment = surface.enrichment;
  const advisories = Number.isFinite(enrichment.advisoryCount) ? enrichment.advisoryCount : 0;
  const age = monthsSince(enrichment.latestVersionPublishedAt, now);
  const hasLiveSource = enrichment.depsDevStatus === "live" || enrichment.osvStatus === "live";

  if (!hasLiveSource && !enrichment.latestVersion) {
    // No live evidence either way. A neutral score is the honest answer; scoring
    // it as zero would quietly read "nothing is wrong".
    return { severity: 0.5, evidence: "no live supply signal for this surface, scored neutral rather than clean" };
  }

  const stale = age !== null && age > 36 ? 1 : 0;
  const severity = clamp01(Math.min(1, advisories / 5) * 0.6 + stale * 0.4);
  const bits: string[] = [`${advisories} known ${advisories === 1 ? "advisory" : "advisories"}`];
  bits.push(
    age === null
      ? "no upstream release date available"
      : `latest upstream release ${Math.max(0, Math.round(age))} months ago`,
  );
  return { severity, evidence: bits.join(", ") };
}

export type SurfaceScoreInput = {
  row: PrimitiveRow;
  usage: Usage;
  shelfLifeYears: number;
  decision: Decision;
  enrichment: Surface["enrichment"];
};

export type SurfaceScore = {
  score: number;
  band: RiskBand;
  residualScore: number;
  residualBand: RiskBand;
  factors: Factor[];
  residualFactors: Factor[];
  quantumBits: number;
  mustStartBy: number;
  decryptableFrom: number;
  decryptWindowYears: number;
  overdueByYears: number;
  effectiveDeadline: number;
};

function weighted(factors: Factor[]): number {
  const total = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  return Math.round(Math.min(100, Math.max(0, total)));
}

function buildFactors(
  input: SurfaceScoreInput,
  ctx: EngineContext,
  mode: "current" | "residual",
): { factors: Factor[]; effectiveDeadline: number; quantumBits: number } {
  const { row, usage, decision, enrichment } = input;
  const x = clampShelfLife(input.shelfLifeYears);
  const lead = row.replacement.migrationLeadYears;
  const quantumBits = mode === "residual" ? row.replacement.quantumBits : row.quantumBits;

  const nistDeadline = row.disallowFrom >= 9999 ? ctx.horizonYear : Math.min(row.disallowFrom, ctx.horizonYear);
  const deprecationDeadline =
    row.deprecateBy !== null ? Math.min(row.deprecateBy, ctx.horizonYear) : nistDeadline;

  const decryptableFrom = Math.round(ctx.horizonYear - x);
  const mustStartBy = Math.round(ctx.horizonYear - (x + lead));

  const effectiveDeadline =
    mode === "residual" && (decision === "scheduled" || decision === "migrate-now")
      ? decision === "scheduled"
        ? nistDeadline
        : decryptableFrom
      : decryptableFrom;

  const nowYear = yearFraction(ctx.now);

  // A primitive that already survives a quantum adversary has no harvest window
  // and no deadline to beat, so neither factor can apply pressure to it.
  const survivesQuantum = row.quantumBits >= 128;
  const hasDeadline = row.disallowFrom < 9999 || row.deprecateBy !== null;

  const harvestSeverity = survivesQuantum
    ? 0
    : mode === "residual" && (decision === "migrate-now" || decision === "scheduled")
      ? clamp01(1 - Math.max(0, effectiveDeadline - nowYear) / 25)
      : clamp01(1 - Math.max(0, decryptableFrom - nowYear) / 25);

  const headroom = effectiveDeadline - nowYear;
  const scheduleSeverity = survivesQuantum && !hasDeadline ? 0 : clamp01(1 - headroom / 10);

  const supply = supplyFactor(
    { enrichment } as Surface,
    ctx.now,
  );

  const factors: Factor[] = [
    {
      key: "harvest",
      label: "Harvest-now-decrypt-later window",
      weight: FACTOR_WEIGHTS.harvest,
      severity: harvestSeverity,
      contribution: harvestSeverity * FACTOR_WEIGHTS.harvest * 100,
      detail: survivesQuantum
        ? row.family === "password-hash"
          ? `A ${row.label} hash is not decryptable; it is attacked by brute force, so the lever is the work factor rather than a migration deadline.`
          : `${row.label} retains ${row.quantumBits} bits against a quantum adversary, so there is no harvest window to close.`
        : `Data protected for ${x} year${x === 1 ? "" : "s"} is decryptable from ${decryptableFrom} at a ${ctx.horizonYear} quantum-capability horizon, so migration must start by ${mustStartBy}.`,
      evidence: `X=${x}, Y=${lead}, H=${ctx.horizonYear}; NIST ${row.disallowFrom >= 9999 ? "has no disallowance date for this primitive" : `disallows this strength level in ${row.disallowFrom}`}.`,
    },
    {
      key: "quantumBits",
      label: "Quantum security strength",
      weight: FACTOR_WEIGHTS.quantumBits,
      severity: clamp01((128 - quantumBits) / 128),
      contribution: clamp01((128 - quantumBits) / 128) * FACTOR_WEIGHTS.quantumBits * 100,
      detail:
        row.family === "rng"
          ? `${row.label} is predictable today and needs no quantum computer at all to exploit.`
          : quantumBits === 0
            ? `${row.label} is broken outright by Shor's algorithm; there is no quantum security level left to preserve.`
            : `${row.label} retains ${quantumBits} bits against a quantum adversary.`,
      evidence:
        row.family === "rng"
          ? "A non-cryptographic PRNG has no quantum dimension; the risk is classical guessing."
          : `${CITATIONS.nistSp80057.label}; symmetric strength halves under Grover.`,
    },
    {
      key: "schedule",
      label: "Migration headroom",
      weight: FACTOR_WEIGHTS.schedule,
      severity: scheduleSeverity,
      contribution: scheduleSeverity * FACTOR_WEIGHTS.schedule * 100,
      detail:
        survivesQuantum && !hasDeadline
          ? `${row.label} is already standardised post-quantum with no disallowance date, so there is no deadline to miss.`
          : headroom <= 0
            ? "The deprecation deadline has already passed."
            : `${headroom.toFixed(1)} years of headroom remain before ${deprecationDeadline}.`,
      evidence: `Earliest NIST deprecation ${row.deprecateBy ?? "none"}, disallowance ${row.disallowFrom >= 9999 ? "none" : row.disallowFrom}.`,
    },
    {
      key: "classical",
      label: "Classical weakness",
      weight: FACTOR_WEIGHTS.classical,
      severity: mode === "residual" ? 0 : row.classicalWeakness,
      contribution: (mode === "residual" ? 0 : row.classicalWeakness) * FACTOR_WEIGHTS.classical * 100,
      detail:
        mode === "residual"
          ? `The decision removes ${row.label} from the code path.`
          : row.classicalWeakness >= 0.8
            ? `${row.label} is already weak enough to attack without a quantum computer.`
            : `${row.label} is not known to be classically broken.`,
      evidence: `Classical weakness rating ${row.classicalWeakness.toFixed(2)} from ${CITATIONS.nistSp80057.label}.`,
    },
    {
      key: "supply",
      label: "Dependency supply signal",
      weight: FACTOR_WEIGHTS.supply,
      severity: mode === "residual" ? 0 : supply.severity,
      contribution: (mode === "residual" ? 0 : supply.severity) * FACTOR_WEIGHTS.supply * 100,
      detail:
        mode === "residual"
          ? "The replacement is a standards-track algorithm, so upstream package risk no longer applies."
          : supply.evidence,
      evidence: "Live enrichment from deps.dev and OSV when available.",
    },
    {
      key: "usage",
      label: "What this primitive protects",
      weight: FACTOR_WEIGHTS.usage,
      severity: USAGE_SEVERITY[usage],
      contribution: USAGE_SEVERITY[usage] * FACTOR_WEIGHTS.usage * 100,
      detail: `${usage.replace(/-/g, " ")} traffic depends on this primitive.`,
      evidence: `Inherent blast radius of the ${usage.replace(/-/g, " ")} role, not the algorithm.`,
    },
  ];

  return { factors, effectiveDeadline, quantumBits };
}

export function scoreSurface(input: SurfaceScoreInput, ctx: EngineContext): SurfaceScore {
  const { row, decision } = input;

  if (decision === "not-applicable") {
    const empty = (key: string): Factor => ({
      key,
      label: key,
      weight: 0,
      severity: 0,
      contribution: 0,
      detail: "Marked not applicable, so it contributes nothing.",
      evidence: "Recorded decision.",
    });
    const factors = Object.keys(FACTOR_WEIGHTS).map(empty);
    return {
      score: 0,
      band: "clear",
      residualScore: 0,
      residualBand: "clear",
      factors,
      residualFactors: factors,
      quantumBits: row.quantumBits,
      mustStartBy: Math.round(ctx.horizonYear - (clampShelfLife(input.shelfLifeYears) + row.replacement.migrationLeadYears)),
      decryptableFrom: Math.round(ctx.horizonYear - clampShelfLife(input.shelfLifeYears)),
      decryptWindowYears: ctx.horizonYear - clampShelfLife(input.shelfLifeYears) - yearFraction(ctx.now),
      overdueByYears: 0,
      effectiveDeadline: ctx.horizonYear,
    };
  }

  const current = buildFactors(input, ctx, "current");
  const residual = buildFactors(input, ctx, "residual");

  const nowYear = yearFraction(ctx.now);
  const decryptableFrom = Math.round(ctx.horizonYear - clampShelfLife(input.shelfLifeYears));
  const mustStartBy = Math.round(
    ctx.horizonYear - (clampShelfLife(input.shelfLifeYears) + row.replacement.migrationLeadYears),
  );

  const score = weighted(current.factors);
  const residualScore =
    decision === "untriaged" || decision === "accepted-risk" ? score : weighted(residual.factors);

  return {
    score,
    band: bandFor(score),
    residualScore,
    residualBand: bandFor(residualScore),
    factors: current.factors,
    residualFactors: residual.factors,
    quantumBits: row.quantumBits,
    mustStartBy,
    decryptableFrom,
    decryptWindowYears: decryptableFrom - nowYear,
    overdueByYears: Math.max(0, nowYear - mustStartBy),
    effectiveDeadline: current.effectiveDeadline,
  };
}

export function rowForSurface(surface: Surface): PrimitiveRow {
  const found = findPrimitive(surface.primitive) ?? resolvePrimitive(surface.primitive) ?? resolvePrimitive(surface.label);
  if (found) return found;
  return FALLBACK_ROW(surface.family);
}

function FALLBACK_ROW(family: string): PrimitiveRow {
  return {
    id: "unrecognised",
    label: "Unrecognised primitive",
    family: "unknown",
    keyBits: null,
    strengthBits: 0,
    quantumBits: family === "hash" || family === "mac" ? 128 : 0,
    classicalWeakness: 0.5,
    defaultUsage: "unknown",
    deprecateBy: null,
    disallowFrom: NIST_TIMELINE.disallowFrom,
    replacement: {
      primitive: "Triage manually against NIST SP 800-57 and IR 8547",
      standard: "NIST SP 800-57",
      quantumBits: 128,
      note: "This primitive is not in the scoring table. Classify it or map it to a known algorithm.",
      migrationLeadYears: 1,
    },
  };
}

export function assessSurface(surface: Surface, ctx: EngineContext): SurfaceAssessment {
  const row = rowForSurface(surface);
  const scored = scoreSurface(
    {
      row,
      usage: surface.usage === "unknown" ? row.defaultUsage : surface.usage,
      shelfLifeYears: surface.shelfLifeYears,
      decision: surface.decision,
      enrichment: surface.enrichment,
    },
    ctx,
  );

  const resource = estimateQuantumResources(
    resourceTargetFor(row.family, row.keyBits, row.quantumBits),
  );

  const headline = buildHeadline(row, scored, surface.decision);

  return {
    surfaceId: surface.id,
    score: scored.score,
    band: scored.band,
    quantumBits: row.quantumBits,
    resource,
    mustStartBy: scored.mustStartBy,
    decryptableFrom: scored.decryptableFrom,
    decryptWindowYears: Math.round(scored.decryptWindowYears * 10) / 10,
    overdueByYears: Math.round(scored.overdueByYears * 10) / 10,
    replacement: row.replacement,
    residualScore: scored.residualScore,
    factors: scored.factors,
    headline,
  };
}

function buildHeadline(row: PrimitiveRow, scored: SurfaceScore, decision: Decision): string {
  const deadline = `start migration by ${scored.mustStartBy}`;
  if (decision === "not-applicable") return `${row.label} is recorded as not applicable to this system.`;
  if (scored.overdueByYears > 0) {
    return `${row.label} is ${scored.overdueByYears.toFixed(1)} years past the point where work should have started; ${deadline} is already in the past.`;
  }
  if (scored.decryptWindowYears <= 2) {
    return `${row.label} data captured today is decryptable in ${scored.decryptWindowYears.toFixed(1)} years at this horizon; ${deadline}.`;
  }
  return `${row.label} gives ${scored.decryptWindowYears.toFixed(1)} years before captured data is decryptable, so ${deadline}.`;
}

export function analyzeSurvey(
  surveyId: string,
  surfaces: readonly Surface[],
  ctx: EngineContext,
): SurveyAnalysis {
  const live = surfaces.filter((surface) => surface.deletedAt === null);
  const assessments = live
    .map((surface) => ({ surface, assessment: assessSurface(surface, ctx) }))
    .sort((a, b) => b.assessment.score - a.assessment.score || a.surface.label.localeCompare(b.surface.label));

  let weightTotal = 0;
  let weightedScore = 0;
  let weightedResidual = 0;
  for (const { surface, assessment } of assessments) {
    const weight = USAGE_WEIGHT[surface.usage] ?? 1;
    weightTotal += weight;
    weightedScore += assessment.score * weight;
    weightedResidual += assessment.residualScore * weight;
  }

  const score = weightTotal === 0 ? 0 : Math.round(weightedScore / weightTotal);
  const residualScore = weightTotal === 0 ? 0 : Math.round(weightedResidual / weightTotal);
  const exposureYears = assessments.length
    ? Math.min(...assessments.map((entry) => entry.assessment.decryptWindowYears))
    : 0;

  const weakest = assessments[0];
  const overdue = assessments.filter((entry) => entry.assessment.overdueByYears > 0).length;
  const triaged = live.filter((surface) => surface.decision !== "untriaged").length;

  return {
    surveyId,
    score,
    band: bandFor(score),
    surfaceCount: live.length,
    triagedCount: triaged,
    overdueCount: overdue,
    weakestSurface: weakest
      ? { id: weakest.surface.id, label: weakest.surface.label, score: weakest.assessment.score }
      : null,
    residualScore,
    residualBand: bandFor(residualScore),
    exposureYears: Math.round(exposureYears * 10) / 10,
    engineVersion: ENGINE_VERSION,
    assessedAt: ctx.now.toISOString(),
    surfaces: assessments.map((entry) => entry.assessment),
  };
}

export type PrimitiveAssessmentInput = {
  primitive: string;
  usage?: Usage;
  shelfLifeYears?: number;
  horizonYear?: number;
  decision?: Decision;
  now?: Date;
};

export function assessPrimitive(input: PrimitiveAssessmentInput): {
  row: PrimitiveRow;
  assessment: SurfaceAssessment;
} | null {
  const row = findPrimitive(input.primitive) ?? resolvePrimitive(input.primitive);
  if (!row) return null;
  const now = input.now ?? new Date();
  const ctx: EngineContext = {
    now,
    horizonYear: Math.min(MAX_HORIZON_YEAR, Math.max(2028, input.horizonYear ?? DEFAULT_HORIZON_YEAR)),
  };
  const shelfLifeYears = clampShelfLife(input.shelfLifeYears ?? 10);
  const decision = input.decision ?? "untriaged";
  const usage = input.usage ?? row.defaultUsage;

  const scored = scoreSurface(
    {
      row,
      usage,
      shelfLifeYears,
      decision,
      enrichment: {
        latestVersion: null,
        latestVersionPublishedAt: null,
        license: null,
        advisoryCount: 0,
        worstAdvisory: null,
        depsDevStatus: "fallback",
        osvStatus: "fallback",
        fetchedAt: now.toISOString(),
      },
    },
    ctx,
  );

  const resource = estimateQuantumResources(resourceTargetFor(row.family, row.keyBits, row.quantumBits));

  return {
    row,
    assessment: {
      surfaceId: "ad-hoc",
      score: scored.score,
      band: scored.band,
      quantumBits: row.quantumBits,
      resource,
      mustStartBy: scored.mustStartBy,
      decryptableFrom: scored.decryptableFrom,
      decryptWindowYears: Math.round(scored.decryptWindowYears * 10) / 10,
      overdueByYears: Math.round(scored.overdueByYears * 10) / 10,
      replacement: row.replacement,
      residualScore: scored.residualScore,
      factors: scored.factors,
      headline: buildHeadline(row, scored, decision),
    },
  };
}

export function describeAssessment(assessment: SurfaceAssessment): string {
  return `${assessment.headline} ${describeResource(assessment.resource)}`;
}