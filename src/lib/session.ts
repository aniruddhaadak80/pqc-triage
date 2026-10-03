import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { SqlExecutor } from "./db/client";
import type { SettingsRow } from "./db/rows";
import { DEFAULT_HORIZON_YEAR } from "./crypto-registry";

export const SESSION_COOKIE = "pqc_sid";
export const SESSION_HEADER = "x-pqc-session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;

export type Settings = {
  horizonYear: number;
  criticalThreshold: number;
  highThreshold: number;
  leadTimeYears: number;
};

export const DEFAULT_SETTINGS: Settings = {
  horizonYear: DEFAULT_HORIZON_YEAR,
  criticalThreshold: 75,
  highThreshold: 55,
  leadTimeYears: 3,
};

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

export function newSessionId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Resolve the caller's anonymous session. The edge middleware assigns the cookie
 * before this runs and forwards the id on `x-pqc-session`, so the very first
 * page load already has an owner and no request is ever orphaned.
 */
export async function currentSessionId(): Promise<string> {
  const store = await headers();
  const fromCookie = store.get("cookie") ?? "";
  const match = fromCookie.match(new RegExp(`${SESSION_COOKIE}=([0-9a-f]{32})`));
  if (match) return match[1];
  const forwarded = store.get(SESSION_HEADER);
  if (isValidSessionId(forwarded)) return forwarded;
  return newSessionId();
}

export function settingsFromRow(row: SettingsRow | undefined): Settings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    horizonYear: row.horizon_year,
    criticalThreshold: row.critical_threshold,
    highThreshold: row.high_threshold,
    leadTimeYears: row.lead_time_years,
  };
}

/**
 * Create the session row on first sight and report whether this caller is new.
 * Only the request that actually inserted the row is allowed to seed, which
 * makes the first-run seed safe under concurrent requests.
 */
export async function ensureSessionRow(db: SqlExecutor, sessionId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const inserted = await db.query<{ created: boolean }>(
    `INSERT INTO sessions (id, created_at, last_seen_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
     RETURNING (xmax = 0) AS created`,
    [sessionId, now, now],
  );
  const created = inserted.rows[0]?.created;
  return created === true;
}

export async function getSettings(db: SqlExecutor, sessionId: string): Promise<Settings> {
  const result = await db.query<SettingsRow>(
    "SELECT session_id, horizon_year, critical_threshold, high_threshold, lead_time_years, updated_at FROM settings WHERE session_id = $1",
    [sessionId],
  );
  return settingsFromRow(result.rows[0]);
}

export async function putSettings(db: SqlExecutor, sessionId: string, settings: Settings): Promise<Settings> {
  const now = new Date().toISOString();
  await db.query(
    `INSERT INTO settings (session_id, horizon_year, critical_threshold, high_threshold, lead_time_years, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (session_id) DO UPDATE SET
       horizon_year = EXCLUDED.horizon_year,
       critical_threshold = EXCLUDED.critical_threshold,
       high_threshold = EXCLUDED.high_threshold,
       lead_time_years = EXCLUDED.lead_time_years,
       updated_at = EXCLUDED.updated_at`,
    [sessionId, settings.horizonYear, settings.criticalThreshold, settings.highThreshold, settings.leadTimeYears, now],
  );
  return settings;
}

/** Called by every entry point so the schema exists before the first query. */
export function rateLimitHeaders(limit: number, remaining: number): Record<string, string> {
  return {
    "x-ratelimit-limit": String(limit),
    "x-ratelimit-remaining": String(Math.max(0, remaining)),
  };
}

/**
 * Best-effort in-process write limiter. Documented in the README as
 * best-effort: a serverless runtime can recycle the process at any time, so a
 * hosted rate limiter is the only durable option and there is deliberately no
 * control here that pretends otherwise.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
export const WRITE_LIMIT = 60;
export const WRITE_WINDOW_MS = 60_000;

export function consumeWrite(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WRITE_WINDOW_MS });
    return { allowed: true, remaining: WRITE_LIMIT - 1 };
  }
  bucket.count += 1;
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  return { allowed: bucket.count <= WRITE_LIMIT, remaining: WRITE_LIMIT - bucket.count };
}