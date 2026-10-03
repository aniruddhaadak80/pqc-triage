import { CLASS_LABELS, SEED_CORPUS, STOP_TOKENS, type TrainingExample } from "./corpus";
import type { ClassifierPrediction, CryptoFamily } from "./types";

/**
 * nbc \u2014 a multinomial Naive Bayes text classifier that lives in the repo.
 *
 * It has no weights file, no service call and no API key: it trains from the
 * seed corpus in `corpus.ts` plus every correction a user has taught it, and the
 * learned log-probability table is exportable. Because training rows are sorted
 * before counting, the same corpus always yields the same model, which is what
 * makes it testable and what makes its predictions quotable.
 */

export const MODEL_VERSION = "nbc@1.0.0";
const ALPHA = 1;

export type Token = string;

export function tokenize(text: string): Token[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+\-]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !STOP_TOKENS.has(word));
  const bigrams: Token[] = [];
  for (let index = 0; index + 1 < words.length; index += 1) {
    bigrams.push(`${words[index]}_${words[index + 1]}`);
  }
  return [...words, ...bigrams];
}

type Counts = {
  labelCounts: Map<CryptoFamily, number>;
  tokenCounts: Map<CryptoFamily, Map<Token, number>>;
  vocabulary: Map<Token, number>;
  total: number;
};

export type Model = Counts & {
  version: string;
  trainedExamples: number;
};

function emptyCounts(): Counts {
  return {
    labelCounts: new Map(),
    tokenCounts: new Map(),
    vocabulary: new Map(),
    total: 0,
  };
}

function normalizeExamples(
  seed: readonly TrainingExample[],
  feedback: readonly TrainingExample[],
): TrainingExample[] {
  const rows = [...seed.map((row) => ({ text: row.text, label: row.label }))];
  for (const row of feedback) {
    if (!row.text?.trim() || !row.label) continue;
    rows.push({ text: row.text.trim(), label: row.label });
  }
  // Deterministic ordering: longest text first, then text, then label. Count
  // order does not change multinomial counts, but it makes float addition
  // order deterministic, which does change the last bits of a digest.
  rows.sort((a, b) => b.text.length - a.text.length || a.text.localeCompare(b.text) || a.label.localeCompare(b.label));
  return rows;
}

export function trainModel(
  seed: readonly TrainingExample[] = SEED_CORPUS,
  feedback: readonly TrainingExample[] = [],
): Model {
  const rows = normalizeExamples(seed, feedback);
  const counts = emptyCounts();

  for (const row of rows) {
    if (!CLASS_LABELS.includes(row.label)) continue;
    counts.labelCounts.set(row.label, (counts.labelCounts.get(row.label) ?? 0) + 1);
    counts.total += 1;

    let perLabel = counts.tokenCounts.get(row.label);
    if (!perLabel) {
      perLabel = new Map<Token, number>();
      counts.tokenCounts.set(row.label, perLabel);
    }
    for (const token of tokenize(row.text)) {
      perLabel.set(token, (perLabel.get(token) ?? 0) + 1);
      counts.vocabulary.set(token, (counts.vocabulary.get(token) ?? 0) + 1);
    }
  }

  return { ...counts, version: MODEL_VERSION, trainedExamples: counts.total };
}

export type Prediction = {
  family: CryptoFamily;
  confidence: number;
  ranked: { family: CryptoFamily; probability: number }[];
  topTokens: { token: string; weight: number; family: CryptoFamily }[];
  modelVersion: string;
  trainedExamples: number;
  /** Tokens found in the input that the model actually knows. */
  matchedTokens: string[];
};

export function classify(model: Model, text: string): Prediction {
  const tokens = tokenize(text);
  const vocabSize = model.vocabulary.size;
  const labels = CLASS_LABELS;

  const logScores = labels.map((label) => {
    const labelCount = model.labelCounts.get(label) ?? 0;
    let score = Math.log((labelCount + ALPHA) / (model.total + ALPHA * labels.length));
    const perLabel = model.tokenCounts.get(label) ?? new Map<Token, number>();
    for (const token of tokens) {
      const count = perLabel.get(token) ?? 0;
      score += Math.log((count + ALPHA) / ((model.trainedExamples || 1) + ALPHA * (vocabSize + 1)));
    }
    return { label, score };
  });

  const max = Math.max(...logScores.map((entry) => entry.score));
  const expSum = logScores.reduce((sum, entry) => sum + Math.exp(entry.score - max), 0);
  const ranked = logScores
    .map((entry) => ({
      family: entry.label,
      probability: Math.exp(entry.score - max) / expSum,
    }))
    .sort((a, b) => b.probability - a.probability || a.family.localeCompare(b.family));

  const matchedTokens = tokens.filter((token) => model.vocabulary.has(token));

  const topTokens = discriminativeTokens(model, ranked[0]?.family ?? "unknown")
    .filter((token) => matchedTokens.includes(token.token) || matchedTokens.length === 0)
    .slice(0, 6);

  return {
    family: ranked[0]?.family ?? "unknown",
    confidence: Math.round((ranked[0]?.probability ?? 0) * 1000) / 1000,
    ranked: ranked.map((entry) => ({
      family: entry.family,
      probability: Math.round(entry.probability * 1000) / 1000,
    })),
    topTokens,
    modelVersion: model.version,
    trainedExamples: model.trainedExamples,
    matchedTokens: [...new Set(matchedTokens)].slice(0, 12),
  };
}

/**
 * Tokens that push one class above the others: log P(token|class) minus the
 * mean log P(token|every other class). This is the part of the model a human
 * can argue with, so it is the part the UI shows.
 */
export function discriminativeTokens(
  model: Model,
  label: CryptoFamily,
  limit = 10,
): { token: string; weight: number; family: CryptoFamily }[] {
  const labels = CLASS_LABELS;
  const vocabSize = model.vocabulary.size;
  const perLabel = model.tokenCounts.get(label) ?? new Map<Token, number>();
  const denominator = (model.trainedExamples || 1) + ALPHA * (vocabSize + 1);

  const out: { token: string; weight: number; family: CryptoFamily }[] = [];
  for (const [token, count] of perLabel) {
    const own = Math.log((count + ALPHA) / denominator);
    const others = labels
      .filter((other) => other !== label)
      .map((other) => Math.log(((model.tokenCounts.get(other) ?? new Map<Token, number>()).get(token) ?? 0) + ALPHA));
    const meanOther = others.reduce((sum, value) => sum + value, 0) / Math.max(1, others.length);
    out.push({ token, weight: Math.round((own - meanOther) * 1000) / 1000, family: label });
  }

  return out.sort((a, b) => b.weight - a.weight || a.token.localeCompare(b.token)).slice(0, limit);
}

/** The learned table, exportable so a reviewer can audit what the model believes. */
export function exportWeights(model: Model, perClass = 6): Record<string, { token: string; weight: number }[]> {
  const out: Record<string, { token: string; weight: number }[]> = {};
  for (const label of CLASS_LABELS) {
    out[label] = discriminativeTokens(model, label, perClass).map(({ token, weight }) => ({ token, weight }));
  }
  return out;
}

export function toPrediction(prediction: Prediction): ClassifierPrediction {
  return {
    family: prediction.family,
    confidence: prediction.confidence,
    ranked: prediction.ranked,
    topTokens: prediction.topTokens,
    modelVersion: prediction.modelVersion,
    trainedExamples: prediction.trainedExamples,
  };
}

export function emptyModel(): Model {
  return trainModel([], []);
}