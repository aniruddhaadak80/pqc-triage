/**
 * Domain and transport types. External source payloads are normalized here so
 * that no upstream shape leaks into the UI, the engine, or the agent tools.
 */

export type Ecosystem = "npm" | "pypi" | "go" | "rubygems" | "packagist" | "crates.io" | "maven";

export type CryptoFamily =
  | "hash"
  | "mac"
  | "symmetric-cipher"
  | "stream-cipher"
  | "kex-public"
  | "signature-public"
  | "password-hash"
  | "kdf"
  | "rng"
  | "unknown";

export type Usage =
  | "data-at-rest"
  | "data-in-transit"
  | "session-establishment"
  | "code-signing"
  | "certificate-authority"
  | "password-storage"
  | "key-generation"
  | "unknown";

export type Decision = "untriaged" | "migrate-now" | "scheduled" | "accepted-risk" | "not-applicable";

export type SourceStatus = "live" | "fallback";

/** A cryptographic call site or dependency discovered in an imported manifest. */
export type Surface = {
  id: string;
  surveyId: string;
  label: string;
  family: CryptoFamily;
  primitive: string;
  keyBits: number | null;
  usage: Usage;
  origin: "dependency" | "source-scan" | "manual";
  ecosystem: Ecosystem | null;
  packageName: string | null;
  packageVersion: string | null;
  location: string;
  evidence: string;
  /** Years this surface protects data that must stay confidential. */
  shelfLifeYears: number;
  decision: Decision;
  decisionNote: string;
  decidedAt: string | null;
  /** True when the classifier, not the extractor, decided the family. */
  familyFromModel: boolean;
  modelConfidence: number | null;
  enrichment: SurfaceEnrichment;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type SurfaceEnrichment = {
  latestVersion: string | null;
  latestVersionPublishedAt: string | null;
  license: string | null;
  advisoryCount: number;
  worstAdvisory: string | null;
  depsDevStatus: SourceStatus;
  osvStatus: SourceStatus;
  fetchedAt: string;
};

/** Published quantum resource estimate for attacking one primitive. */
export type QuantumResource = {
  basis: "rsa-abstract-circuit" | "ecdlp-linear" | "symmetric-grover" | "none";
  logicalQubits: number | null;
  toffoliGates: number | null;
  physicalQubits: number | null;
  runtimeLabel: string;
  citation: string;
};

export type Factor = {
  key: string;
  label: string;
  weight: number;
  /** Normalized 0..1 severity for this factor. */
  severity: number;
  /** Points this factor contributed to the 0..100 score. */
  contribution: number;
  detail: string;
  evidence: string;
};

export type Replacement = {
  primitive: string;
  standard: string;
  quantumBits: number;
  note: string;
  migrationLeadYears: number;
};

export type SurfaceAssessment = {
  surfaceId: string;
  score: number;
  band: RiskBand;
  quantumBits: number;
  resource: QuantumResource;
  /** Mosca's X + Y: the year migration work must *start* by. */
  mustStartBy: number;
  /** The year captured ciphertext becomes decryptable. */
  decryptableFrom: number;
  /** Years from the assessment clock until that ciphertext is broken. */
  decryptWindowYears: number;
  overdueByYears: number;
  replacement: Replacement;
  residualScore: number;
  factors: Factor[];
  headline: string;
};

export type RiskBand = "critical" | "high" | "medium" | "low" | "clear";

export type SurveyAnalysis = {
  surveyId: string;
  score: number;
  band: RiskBand;
  surfaceCount: number;
  triagedCount: number;
  overdueCount: number;
  weakestSurface: { id: string; label: string; score: number } | null;
  /** Score after the recorded decisions are applied. */
  residualScore: number;
  residualBand: RiskBand;
  exposureYears: number;
  engineVersion: string;
  assessedAt: string;
  surfaces: SurfaceAssessment[];
};

export type Survey = {
  id: string;
  name: string;
  repoHint: string;
  ecosystem: Ecosystem | null;
  horizonYear: number;
  shared: boolean;
  status: "active" | "retired";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  genesisSeal: string;
  lastSeal: string;
  eventCount: number;
  analysis: SurveyAnalysis | null;
  surfaces: Surface[];
};

export type SurveySummary = Omit<Survey, "surfaces"> & { surfaceCount: number };

export type NormalizedSignal = {
  id: string;
  source: string;
  sourceStatus: SourceStatus;
  title: string;
  detail: string;
  href: string | null;
  publishedAt: string | null;
  fetchedAt: string;
};

export type LiveSignals = {
  status: SourceStatus;
  fetchedAt: string;
  horizonYear: number;
  transition: {
    deprecateBy: number;
    disallowFrom: number;
    symmetricFloorBits: number;
    citation: string;
    href: string;
  };
  quantum: NormalizedSignal[];
  advisories: NormalizedSignal[];
  papers: NormalizedSignal[];
  sources: {
    key: string;
    label: string;
    status: SourceStatus;
    latencyMs: number;
    count: number;
    href: string;
  }[];
};

export type ClassifierPrediction = {
  family: CryptoFamily;
  confidence: number;
  ranked: { family: CryptoFamily; probability: number }[];
  topTokens: { token: string; weight: number; family: CryptoFamily }[];
  modelVersion: string;
  trainedExamples: number;
};

export type HealthReport = {
  status: "ok" | "degraded";
  store: "neon-postgres" | "pglite-embedded";
  storeDetail: string;
  writeProbe: boolean;
  engineVersion: string;
  sealAlgorithm: string;
  uptimeSeconds: number;
  checkedAt: string;
};

export type IntegrityReport = {
  surveyId: string;
  valid: boolean;
  eventsChecked: number;
  genesisSeal: string;
  headSeal: string;
  brokenAtSeq: number | null;
  brokenReason: string | null;
  retainedTombstones: number;
  verifiedAt: string;
  algorithm: string;
};