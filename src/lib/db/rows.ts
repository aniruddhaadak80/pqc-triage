import type { CryptoFamily, Decision, Ecosystem, Usage } from "../types";

/**
 * Row shapes. Both the Neon and the embedded PGlite adapter speak exactly these
 * types through the `SqlExecutor` contract in `client.ts`, so no query is ever
 * written against a dialect the app does not control.
 */

export type Iso = string;

export type SessionRow = {
  id: string;
  created_at: Iso;
  last_seen_at: Iso;
};

export type SurveyRow = {
  id: string;
  session_id: string;
  name: string;
  repo_hint: string;
  ecosystem: Ecosystem | null;
  horizon_year: number;
  shared: number;
  status: "active" | "retired";
  created_at: Iso;
  updated_at: Iso;
  deleted_at: Iso | null;
  genesis_seal: string;
  last_seal: string;
  event_count: number;
};

export type SurfaceRow = {
  id: string;
  survey_id: string;
  label: string;
  family: CryptoFamily;
  primitive: string;
  key_bits: number | null;
  usage: Usage;
  origin: "dependency" | "source-scan" | "manual";
  ecosystem: Ecosystem | null;
  package_name: string | null;
  package_version: string | null;
  location: string;
  evidence: string;
  shelf_life_years: number;
  decision: Decision;
  decision_note: string;
  decided_at: Iso | null;
  family_from_model: number;
  model_confidence: number | null;
  enrichment: string | null;
  created_at: Iso;
  updated_at: Iso;
  deleted_at: Iso | null;
};

export type AuditEventRow = {
  id: number;
  survey_id: string;
  surface_id: string | null;
  seq: number;
  type: string;
  at: Iso;
  payload: string;
  prev_seal: string;
  seal: string;
};

export type SettingsRow = {
  session_id: string;
  horizon_year: number;
  critical_threshold: number;
  high_threshold: number;
  lead_time_years: number;
  updated_at: Iso;
};

export type FeedbackRow = {
  id: number;
  session_id: string;
  text: string;
  label: CryptoFamily;
  created_at: Iso;
};

export type IdempotencyRow = {
  key: string;
  session_id: string;
  scope: string;
  response: string;
  created_at: Iso;
};