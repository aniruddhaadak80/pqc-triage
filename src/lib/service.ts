import { randomUUID } from "node:crypto";
import { canonicalJson } from "./canonical";
import { classify, trainModel, type Model, type Prediction } from "./classifier";
import { DEFAULT_SETTINGS, getSettings, type Settings } from "./session";
import { findPrimitive, resolvePrimitive } from "./crypto-registry";
import { ENGINE_VERSION, analyzeSurvey, assessPrimitive, engineContext } from "./engine";
import { extractSurfaces, shelfLifeFor } from "./extract";
import { getDb, withTransaction, type SqlExecutor } from "./db/client";
import { ensureSchema } from "./db/migrate";
import type { AuditEventRow, FeedbackRow, SurfaceRow, SurveyRow } from "./db/rows";
import { fetchAdvisories, fetchPackageFacts } from "./live/sources";
import { computeGenesisSeal, computeSeal, replaySealChain, SEAL_ALGORITHM } from "./seal";
import { ApiError } from "./http";
import type {
  ClassifierPrediction,
  CryptoFamily,
  Decision,
  Ecosystem,
  IntegrityReport,
  Surface,
  SurfaceEnrichment,
  Survey,
  SurveySummary,
  Usage,
} from "./types";

/**
 * The only place state changes. The UI, the REST endpoints and the JSON-RPC
 * tools all call these functions, so there is exactly one implementation of
 * "record a decision" and one implementation of the seal chain.
 */

const MAX_ENRICHED_PACKAGES = 6;

const EMPTY_ENRICHMENT: SurfaceEnrichment = {
  latestVersion: null,
  latestVersionPublishedAt: null,
  license: null,
  advisoryCount: 0,
  worstAdvisory: null,
  depsDevStatus: "fallback",
  osvStatus: "fallback",
  fetchedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function parseEnrichment(raw: string | null): SurfaceEnrichment {
  if (!raw) return { ...EMPTY_ENRICHMENT };
  try {
    const parsed = JSON.parse(raw) as Partial<SurfaceEnrichment>;
    return { ...EMPTY_ENRICHMENT, ...parsed };
  } catch {
    return { ...EMPTY_ENRICHMENT };
  }
}

function mapSurface(row: SurfaceRow): Surface {
  return {
    id: row.id,
    surveyId: row.survey_id,
    label: row.label,
    family: row.family,
    primitive: row.primitive,
    keyBits: row.key_bits,
    usage: row.usage,
    origin: row.origin,
    ecosystem: row.ecosystem,
    packageName: row.package_name,
    packageVersion: row.package_version,
    location: row.location,
    evidence: row.evidence,
    shelfLifeYears: row.shelf_life_years,
    decision: row.decision,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    familyFromModel: row.family_from_model === 1,
    modelConfidence: row.model_confidence,
    enrichment: parseEnrichment(row.enrichment),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapSurveySummary(row: SurveyRow, surfaceCount: number): SurveySummary {
  return {
    id: row.id,
    name: row.name,
    repoHint: row.repo_hint,
    ecosystem: row.ecosystem,
    horizonYear: row.horizon_year,
    shared: row.shared === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    genesisSeal: row.genesis_seal,
    lastSeal: row.last_seal,
    eventCount: row.event_count,
    analysis: null,
    surfaceCount,
  };
}

function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError("validation_error", `"${value}" is not a valid id.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Audit chain
// ---------------------------------------------------------------------------

export async function appendAudit(
  db: SqlExecutor,
  surveyId: string,
  type: string,
  payload: Record<string, unknown>,
  surfaceId?: string | null,
): Promise<{ seq: number; seal: string }> {
  const head = await db.query<SurveyRow>(
    "SELECT id, session_id, name, repo_hint, ecosystem, horizon_year, shared, status, created_at, updated_at, deleted_at, genesis_seal, last_seal, event_count FROM surveys WHERE id = $1",
    [surveyId],
  );
  const row = head.rows[0];
  if (!row) throw new ApiError("not_found", "That survey does not exist.");

  const seq = row.event_count + 1;
  const at = new Date().toISOString();
  const event = { seq, type, at, payload };
  const seal = computeSeal(row.last_seal, event);

  await db.query(
    `INSERT INTO audit_events (survey_id, seq, type, at, payload, prev_seal, seal, surface_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [surveyId, seq, type, at, canonicalJson(payload), row.last_seal, seal, surfaceId ?? null],
  );
  await db.query(
    "UPDATE surveys SET last_seal = $1, event_count = $2, updated_at = $3 WHERE id = $4",
    [seal, seq, at, surveyId],
  );

  return { seq, seal };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSurveys(sessionId: string, options: { includeRetired?: boolean } = {}): Promise<SurveySummary[]> {
  const db = await getDb();
  await ensureSchema(db);
  const rows = await db.query<SurveyRow>(
    options.includeRetired
      ? `SELECT id, session_id, name, repo_hint, ecosystem, horizon_year, shared, status, created_at, updated_at, deleted_at, genesis_seal, last_seal, event_count
         FROM surveys WHERE session_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`
      : `SELECT id, session_id, name, repo_hint, ecosystem, horizon_year, shared, status, created_at, updated_at, deleted_at, genesis_seal, last_seal, event_count
         FROM surveys WHERE session_id = $1 AND deleted_at IS NULL AND status = 'active' ORDER BY created_at DESC LIMIT 100`,
    [sessionId],
  );
  if (rows.rows.length === 0) return [];
  const ids = rows.rows.map((row) => row.id);
  const counts = await db.query<{ survey_id: string; n: number }>(
    `SELECT survey_id, COUNT(*)::int AS n FROM surfaces
     WHERE survey_id IN (${ids.map((_, index) => `$${index + 1}`).join(", ")}) AND deleted_at IS NULL
     GROUP BY survey_id`,
    ids,
  );
  const bySurvey = new Map(counts.rows.map((row) => [row.survey_id, row.n]));
  return rows.rows.map((row) => mapSurveySummary(row, bySurvey.get(row.id) ?? 0));
}

export async function getSurvey(sessionId: string, id: string, settings?: Settings): Promise<Survey | null> {
  const db = await getDb();
  await ensureSchema(db);
  return loadSurvey(db, sessionId, uuid(id), settings, false);
}

export async function getSharedSurvey(id: string): Promise<Survey | null> {
  const db = await getDb();
  await ensureSchema(db);
  const rows = await db.query<SurveyRow>(
    "SELECT id, session_id, name, repo_hint, ecosystem, horizon_year, shared, status, created_at, updated_at, deleted_at, genesis_seal, last_seal, event_count FROM surveys WHERE id = $1 AND shared = 1 AND deleted_at IS NULL",
    [uuid(id)],
  );
  const row = rows.rows[0];
  if (!row) return null;
  return loadSurvey(db, null, row.id, undefined, true);
}

async function loadSurvey(
  db: SqlExecutor,
  sessionId: string | null,
  id: string,
  settings?: Settings,
  isShared = false,
): Promise<Survey | null> {
  const rows = await db.query<SurveyRow>(
    sessionId
      ? "SELECT id, session_id, name, repo_hint, ecosystem, horizon_year, shared, status, created_at, updated_at, deleted_at, genesis_seal, last_seal, event_count FROM surveys WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL"
      : "SELECT id, session_id, name, repo_hint, ecosystem, horizon_year, shared, status, created_at, updated_at, deleted_at, genesis_seal, last_seal, event_count FROM surveys WHERE id = $1",
    sessionId ? [id, sessionId] : [id],
  );
  const row = rows.rows[0];
  if (!row) return null;

  const surfaceRows = await db.query<SurfaceRow>(
    "SELECT id, survey_id, label, family, primitive, key_bits, usage, origin, ecosystem, package_name, package_version, location, evidence, shelf_life_years, decision, decision_note, decided_at, family_from_model, model_confidence, enrichment, created_at, updated_at, deleted_at FROM surfaces WHERE survey_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC",
    [id],
  );
  const surfaces = surfaceRows.rows.map(mapSurface);
  const effective = settings ?? (isShared ? { ...DEFAULT_SETTINGS, horizonYear: row.horizon_year } : await getSettings(db, sessionId ?? ""));
  const ctx = engineContext(effective.horizonYear);
  const analysis = analyzeSurvey(row.id, surfaces, ctx);

  return {
    ...mapSurveySummary(row, surfaces.length),
    surfaces,
    analysis,
  };
}

// ---------------------------------------------------------------------------
// Live enrichment
// ---------------------------------------------------------------------------

export type AdvisoryRow = {
  id: string;
  source: string;
  sourceStatus: "live" | "fallback";
  title: string;
  detail: string;
  href: string | null;
  publishedAt: string | null;
  fetchedAt: string;
};

async function enrichSurfaces(surfaces: Surface[]): Promise<Map<string, SurfaceEnrichment>> {
  const result = new Map<string, SurfaceEnrichment>();
  const targets = surfaces
    .filter((surface) => surface.origin === "dependency" && surface.packageName && surface.ecosystem)
    .slice(0, MAX_ENRICHED_PACKAGES);

  await Promise.all(
    targets.map(async (surface) => {
      const [deps, osv] = await Promise.all([
        fetchPackageFacts(surface.ecosystem as Ecosystem, surface.packageName as string),
        fetchAdvisories(surface.ecosystem as Ecosystem, surface.packageName as string),
      ]);
      result.set(surface.id, {
        latestVersion: deps.latestVersion,
        latestVersionPublishedAt: deps.publishedAt,
        license: deps.license,
        advisoryCount: osv.count,
        worstAdvisory: osv.worstId,
        depsDevStatus: deps.status,
        osvStatus: osv.status,
        fetchedAt: new Date().toISOString(),
      });
    }),
  );

  return result;
}

export async function advisoriesFor(surfaces: Surface[]): Promise<AdvisoryRow[]> {
  const out: AdvisoryRow[] = [];
  const seen = new Set<string>();
  const fetchedAt = new Date().toISOString();
  for (const surface of surfaces) {
    const enrichment = surface.enrichment;
    if (enrichment.advisoryCount <= 0) continue;
    const packageLabel = surface.packageName ?? surface.label;
    const id = `osv-${packageLabel}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      source: "OSV (osv.dev)",
      sourceStatus: enrichment.osvStatus,
      title: `${enrichment.advisoryCount} published ${enrichment.advisoryCount === 1 ? "advisory" : "advisories"} for ${packageLabel}`,
      detail: enrichment.worstAdvisory
        ? `Highest-ranked record ${enrichment.worstAdvisory}. Source status ${enrichment.osvStatus}.`
        : `Source status ${enrichment.osvStatus}.`,
      href: surface.packageName ? `https://osv.dev/list?q=${encodeURIComponent(surface.packageName)}` : "https://osv.dev",
      publishedAt: surface.updatedAt,
      fetchedAt,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type CreateSurveyInput = {
  name: string;
  repoHint: string;
  manifest: string;
  source: string;
};

export async function createSurvey(
  sessionId: string,
  input: CreateSurveyInput,
): Promise<{ survey: Survey; extraction: ReturnType<typeof extractSurfaces> }> {
  const db = await getDb();
  await ensureSchema(db);

  const extraction = extractSurfaces({ manifest: input.manifest, source: input.source, name: input.name });
  const settings = await getSettings(db, sessionId);
  const now = new Date().toISOString();
  const id = randomUUID();
  const genesisSeal = computeGenesisSeal(id);

  const provisionalSurfaces: Surface[] = extraction.surfaces.map((surface) => {
    const row = findPrimitive(surface.primitive) ?? resolvePrimitive(surface.primitive);
    return {
      id: `${surface.origin}:${surface.packageName ?? ""}:${surface.primitive}`,
      surveyId: id,
      label: surface.label,
      family: surface.family ?? row?.family ?? "unknown",
      primitive: surface.primitive,
      keyBits: surface.keyBits ?? row?.keyBits ?? null,
      usage: surface.usage,
      origin: surface.origin,
      ecosystem: surface.ecosystem,
      packageName: surface.packageName,
      packageVersion: surface.packageVersion,
      location: surface.location,
      evidence: surface.evidence,
      shelfLifeYears: surface.shelfLifeYears,
      decision: "untriaged" as Decision,
      decisionNote: "",
      decidedAt: null,
      familyFromModel: false,
      modelConfidence: null,
      enrichment: { ...EMPTY_ENRICHMENT },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  });

  const enrichment = await enrichSurfaces(provisionalSurfaces);

  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO surveys (id, session_id, name, repo_hint, ecosystem, horizon_year, shared, status, created_at, updated_at, deleted_at, genesis_seal, last_seal, event_count)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'active', $7, $7, NULL, $8, $8, 0)`,
      [id, sessionId, input.name, input.repoHint, extraction.ecosystem, settings.horizonYear, now, genesisSeal],
    );

    for (const surface of provisionalSurfaces) {
      const facts = enrichment.get(surface.id) ?? { ...EMPTY_ENRICHMENT };
      await tx.query(
        `INSERT INTO surfaces (id, survey_id, label, family, primitive, key_bits, usage, origin, ecosystem, package_name, package_version, location, evidence, shelf_life_years, decision, decision_note, decided_at, family_from_model, model_confidence, enrichment, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'untriaged', '', NULL, 0, NULL, $15, $16, $16, NULL)`,
        [
          randomUUID(),
          id,
          surface.label,
          surface.family,
          surface.primitive,
          surface.keyBits,
          surface.usage,
          surface.origin,
          surface.ecosystem,
          surface.packageName,
          surface.packageVersion,
          surface.location,
          surface.evidence,
          surface.shelfLifeYears,
          JSON.stringify(facts),
          now,
        ],
      );
    }

    await appendAudit(
      tx,
      id,
      "survey.imported",
      {
        manifestChars: input.manifest.length,
        sourceChars: input.source.length,
        ecosystem: extraction.ecosystem,
        packagesScanned: extraction.packagesScanned,
        cryptoPackages: extraction.cryptoPackages,
        linesScanned: extraction.linesScanned,
        surfaceCount: provisionalSurfaces.length,
        truncated: extraction.truncated,
      },
    );
  });

  const survey = await loadSurvey(db, sessionId, id, settings);
  if (!survey) throw new ApiError("internal_error", "The survey was created but could not be read back.");
  return { survey, extraction };
}

export type UpdateSurveyPatch = {
  name?: string;
  shared?: boolean;
  horizonYear?: number;
};

export async function updateSurvey(sessionId: string, id: string, patch: UpdateSurveyPatch): Promise<Survey> {
  const db = await getDb();
  await ensureSchema(db);
  const surveyId = uuid(id);
  const owned = await db.query("SELECT id FROM surveys WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL", [surveyId, sessionId]);
  if (owned.rows.length === 0) throw new ApiError("not_found", "That survey does not exist.");

  const sets: string[] = [];
  const params: unknown[] = [];
  const changes: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
    changes.name = patch.name;
  }
  if (patch.shared !== undefined) {
    params.push(patch.shared ? 1 : 0);
    sets.push(`shared = $${params.length}`);
    changes.shared = patch.shared;
  }
  if (patch.horizonYear !== undefined) {
    params.push(patch.horizonYear);
    sets.push(`horizon_year = $${params.length}`);
    changes.horizonYear = patch.horizonYear;
  }

  if (sets.length === 0) {
    const existing = await loadSurvey(db, sessionId, surveyId);
    if (!existing) throw new ApiError("not_found", "That survey does not exist.");
    return existing;
  }

  params.push(new Date().toISOString());
  sets.push(`updated_at = $${params.length}`);
  params.push(surveyId);

  await withTransaction(async (tx) => {
    await tx.query(`UPDATE surveys SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    await appendAudit(tx, surveyId, "survey.updated", changes);
  });

  const updated = await loadSurvey(db, sessionId, surveyId);
  if (!updated) throw new ApiError("not_found", "That survey does not exist.");
  return updated;
}

export async function deleteSurvey(sessionId: string, id: string): Promise<{ id: string; tombstone: true; seal: string }> {
  const db = await getDb();
  await ensureSchema(db);
  const surveyId = uuid(id);
  const owned = await db.query("SELECT id FROM surveys WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL", [surveyId, sessionId]);
  if (owned.rows.length === 0) throw new ApiError("not_found", "That survey does not exist.");

  const now = new Date().toISOString();
  const seal = await withTransaction(async (tx) => {
    const count = await tx.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM surfaces WHERE survey_id = $1 AND deleted_at IS NULL",
      [surveyId],
    );
    await tx.query("UPDATE surfaces SET deleted_at = $1, updated_at = $1 WHERE survey_id = $2 AND deleted_at IS NULL", [now, surveyId]);
    await tx.query("UPDATE surveys SET deleted_at = $1, updated_at = $1, status = 'retired', shared = 0 WHERE id = $2", [now, surveyId]);
    const event = await appendAudit(tx, surveyId, "survey.deleted", {
      reason: "owner requested deletion",
      surfacesRetained: count.rows[0]?.n ?? 0,
      tombstone: true,
    });
    return event.seal;
  });

  return { id: surveyId, tombstone: true, seal };
}

export type AddSurfaceInput = {
  label: string;
  primitive: string;
  usage?: Usage;
  shelfLifeYears?: number;
  location?: string;
  evidence?: string;
};

export async function addSurface(sessionId: string, surveyId: string, input: AddSurfaceInput): Promise<Surface> {
  const db = await getDb();
  await ensureSchema(db);
  const id = uuid(surveyId);
  const owned = await db.query("SELECT id FROM surveys WHERE id = $1 AND session_id = $2 AND deleted_at IS NULL", [id, sessionId]);
  if (owned.rows.length === 0) throw new ApiError("not_found", "That survey does not exist.");

  const row = findPrimitive(input.primitive) ?? resolvePrimitive(input.primitive);
  const primitive = row?.id ?? input.primitive.trim();
  const usage = input.usage ?? row?.defaultUsage ?? "unknown";
  const surfaceId = randomUUID();
  const now = new Date().toISOString();

  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO surfaces (id, survey_id, label, family, primitive, key_bits, usage, origin, ecosystem, package_name, package_version, location, evidence, shelf_life_years, decision, decision_note, decided_at, family_from_model, model_confidence, enrichment, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', NULL, NULL, NULL, $8, $9, $10, 'untriaged', '', NULL, 0, NULL, $11, $12, $12, NULL)`,
      [
        surfaceId,
        id,
        input.label,
        row?.family ?? "unknown",
        primitive,
        row?.keyBits ?? null,
        usage,
        input.location ?? "added manually",
        input.evidence ?? `Added manually as ${primitive}.`,
        input.shelfLifeYears ?? shelfLifeFor(usage),
        JSON.stringify({ ...EMPTY_ENRICHMENT }),
        now,
      ],
    );
    await appendAudit(
      tx,
      id,
      "surface.added",
      { surfaceId, primitive, usage, shelfLifeYears: input.shelfLifeYears ?? shelfLifeFor(usage), origin: "manual" },
      surfaceId,
    );
  });

  const created = await db.query<SurfaceRow>(
    "SELECT id, survey_id, label, family, primitive, key_bits, usage, origin, ecosystem, package_name, package_version, location, evidence, shelf_life_years, decision, decision_note, decided_at, family_from_model, model_confidence, enrichment, created_at, updated_at, deleted_at FROM surfaces WHERE id = $1",
    [surfaceId],
  );
  return mapSurface(created.rows[0]);
}

export type UpdateSurfacePatch = {
  decision?: Decision;
  decisionNote?: string;
  shelfLifeYears?: number;
  usage?: Usage;
  family?: CryptoFamily;
  familyFromModel?: boolean;
  modelConfidence?: number | null;
};

export async function updateSurface(sessionId: string, surfaceId: string, patch: UpdateSurfacePatch): Promise<Surface> {
  const db = await getDb();
  await ensureSchema(db);
  const id = uuid(surfaceId);
  const existing = await db.query<SurfaceRow>(
    `SELECT s.id, s.survey_id, s.label, s.family, s.primitive, s.key_bits, s.usage, s.origin, s.ecosystem, s.package_name, s.package_version, s.location, s.evidence, s.shelf_life_years, s.decision, s.decision_note, s.decided_at, s.family_from_model, s.model_confidence, s.enrichment, s.created_at, s.updated_at, s.deleted_at
     FROM surfaces s JOIN surveys v ON v.id = s.survey_id
     WHERE s.id = $1 AND s.deleted_at IS NULL AND v.session_id = $2 AND v.deleted_at IS NULL`,
    [id, sessionId],
  );
  const row = existing.rows[0];
  if (!row) throw new ApiError("not_found", "That surface does not exist.");

  const sets: string[] = [];
  const params: unknown[] = [];
  const changes: Record<string, unknown> = {};

  const push = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.decision !== undefined) {
    push("decision", patch.decision);
    push("decided_at", patch.decision === "untriaged" ? null : new Date().toISOString());
    changes.decision = patch.decision;
  }
  if (patch.decisionNote !== undefined) {
    push("decision_note", patch.decisionNote);
    changes.decisionNote = patch.decisionNote;
  }
  if (patch.shelfLifeYears !== undefined) {
    push("shelf_life_years", patch.shelfLifeYears);
    changes.shelfLifeYears = patch.shelfLifeYears;
  }
  if (patch.usage !== undefined) {
    push("usage", patch.usage);
    changes.usage = patch.usage;
  }
  if (patch.family !== undefined) {
    push("family", patch.family);
    changes.family = patch.family;
  }
  if (patch.familyFromModel !== undefined) {
    push("family_from_model", patch.familyFromModel ? 1 : 0);
  }
  if (patch.modelConfidence !== undefined) {
    push("model_confidence", patch.modelConfidence);
  }

  if (sets.length === 0) throw new ApiError("validation_error", "Nothing to update.");

  params.push(new Date().toISOString());
  sets.push(`updated_at = $${params.length}`);
  params.push(id);

  const eventType = patch.decision !== undefined ? "surface.decided" : "surface.updated";

  await withTransaction(async (tx) => {
    await tx.query(`UPDATE surfaces SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    await appendAudit(tx, row.survey_id, eventType, { surfaceId: id, ...changes, previousDecision: row.decision }, id);
  });

  const updated = await db.query<SurfaceRow>(
    "SELECT id, survey_id, label, family, primitive, key_bits, usage, origin, ecosystem, package_name, package_version, location, evidence, shelf_life_years, decision, decision_note, decided_at, family_from_model, model_confidence, enrichment, created_at, updated_at, deleted_at FROM surfaces WHERE id = $1",
    [id],
  );
  return mapSurface(updated.rows[0]);
}

export async function deleteSurface(sessionId: string, surfaceId: string): Promise<{ id: string; seal: string }> {
  const db = await getDb();
  await ensureSchema(db);
  const id = uuid(surfaceId);
  const existing = await db.query<SurfaceRow>(
    `SELECT s.id, s.survey_id, s.label, s.family, s.primitive, s.key_bits, s.usage, s.origin, s.ecosystem, s.package_name, s.package_version, s.location, s.evidence, s.shelf_life_years, s.decision, s.decision_note, s.decided_at, s.family_from_model, s.model_confidence, s.enrichment, s.created_at, s.updated_at, s.deleted_at
     FROM surfaces s JOIN surveys v ON v.id = s.survey_id
     WHERE s.id = $1 AND s.deleted_at IS NULL AND v.session_id = $2 AND v.deleted_at IS NULL`,
    [id, sessionId],
  );
  const row = existing.rows[0];
  if (!row) throw new ApiError("not_found", "That surface does not exist.");

  const now = new Date().toISOString();
  const seal = await withTransaction(async (tx) => {
    await tx.query("UPDATE surfaces SET deleted_at = $1, updated_at = $1 WHERE id = $2", [now, id]);
    const event = await appendAudit(tx, row.survey_id, "surface.deleted", { surfaceId: id, label: row.label, primitive: row.primitive, tombstone: true }, id);
    return event.seal;
  });

  return { id, seal };
}

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------

export async function verifySurvey(sessionId: string, surveyId: string): Promise<IntegrityReport> {
  const db = await getDb();
  await ensureSchema(db);
  const id = uuid(surveyId);
  const owned = await db.query("SELECT id FROM surveys WHERE id = $1 AND session_id = $2", [id, sessionId]);
  if (owned.rows.length === 0) throw new ApiError("not_found", "That survey does not exist.");

  const events = await db.query<AuditEventRow>(
    "SELECT survey_id, seq, type, at, payload, prev_seal, seal FROM audit_events WHERE survey_id = $1 ORDER BY seq ASC",
    [id],
  );
  const tombstones = await db.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM surfaces WHERE survey_id = $1 AND deleted_at IS NOT NULL",
    [id],
  );

  const replay = replaySealChain(
    id,
    events.rows.map((row) => ({ seq: row.seq, type: row.type, at: row.at, payload: JSON.parse(row.payload) as Record<string, unknown> })),
  );

  return {
    surveyId: id,
    valid: replay.valid,
    eventsChecked: replay.eventsChecked,
    genesisSeal: replay.genesisSeal,
    headSeal: replay.headSeal,
    brokenAtSeq: replay.brokenAtSeq,
    brokenReason: replay.brokenReason,
    retainedTombstones: tombstones.rows[0]?.n ?? 0,
    verifiedAt: new Date().toISOString(),
    algorithm: SEAL_ALGORITHM,
  };
}

export async function auditTrail(sessionId: string, surveyId: string) {
  const db = await getDb();
  await ensureSchema(db);
  const id = uuid(surveyId);
  const owned = await db.query("SELECT id FROM surveys WHERE id = $1 AND session_id = $2", [id, sessionId]);
  if (owned.rows.length === 0) throw new ApiError("not_found", "That survey does not exist.");
  const events = await db.query<AuditEventRow>(
    "SELECT survey_id, seq, type, at, payload, prev_seal, seal FROM audit_events WHERE survey_id = $1 ORDER BY seq ASC",
    [id],
  );
  return events.rows;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export async function modelForSession(sessionId: string): Promise<Model> {
  const db = await getDb();
  await ensureSchema(db);
  const rows = await db.query<FeedbackRow>(
    "SELECT id, session_id, text, label, created_at FROM classifier_feedback WHERE session_id = $1 ORDER BY id ASC",
    [sessionId],
  );
  return trainModel(
    undefined,
    rows.rows.map((row) => ({ text: row.text, label: row.label })),
  );
}

export async function classifyText(sessionId: string, text: string): Promise<Prediction> {
  const model = await modelForSession(sessionId);
  return classify(model, text);
}

export async function teachClassifier(
  sessionId: string,
  text: string,
  label: CryptoFamily,
): Promise<{ prediction: Prediction; trainedExamples: number }> {
  const db = await getDb();
  await ensureSchema(db);
  await db.query(
    "INSERT INTO classifier_feedback (session_id, text, label, created_at) VALUES ($1, $2, $3, $4)",
    [sessionId, text, label, new Date().toISOString()],
  );
  const model = await modelForSession(sessionId);
  return { prediction: classify(model, text), trainedExamples: model.trainedExamples };
}

export async function classifierPrediction(sessionId: string, text: string): Promise<ClassifierPrediction> {
  const prediction = await classifyText(sessionId, text);
  return {
    family: prediction.family,
    confidence: prediction.confidence,
    ranked: prediction.ranked,
    topTokens: prediction.topTokens,
    modelVersion: prediction.modelVersion,
    trainedExamples: prediction.trainedExamples,
  };
}

// ---------------------------------------------------------------------------
// Idempotency for agent mutations
// ---------------------------------------------------------------------------

export async function readIdempotent(
  sessionId: string,
  scope: string,
  key: string | null | undefined,
): Promise<unknown | null> {
  if (!key) return null;
  const db = await getDb();
  await ensureSchema(db);
  const rows = await db.query<{ response: string }>(
    "SELECT response FROM idempotency_keys WHERE key = $1 AND session_id = $2 AND scope = $3",
    [key, sessionId, scope],
  );
  const row = rows.rows[0];
  return row ? (JSON.parse(row.response) as unknown) : null;
}

export async function writeIdempotent(
  sessionId: string,
  scope: string,
  key: string | null | undefined,
  response: unknown,
): Promise<void> {
  if (!key) return;
  const db = await getDb();
  await db.query(
    `INSERT INTO idempotency_keys (key, session_id, scope, response, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id, scope, key) DO NOTHING`,
    [key, sessionId, scope, JSON.stringify(response), new Date().toISOString()],
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function settingsFor(sessionId: string): Promise<Settings> {
  const db = await getDb();
  await ensureSchema(db);
  return getSettings(db, sessionId);
}

/**
 * Score a primitive the same way the UI and the workbench do, with no state
 * written. Shared by the REST route and the agent tool so the numbers agree.
 */
export function assessPrimitiveExport(input: Parameters<typeof assessPrimitive>[0]) {
  const result = assessPrimitive(input);
  if (!result) return null;
  return {
    primitive: result.row.id,
    label: result.row.label,
    family: result.row.family,
    defaultUsage: result.row.defaultUsage,
    classicalStrengthBits: result.row.strengthBits,
    nist: {
      deprecateBy: result.row.deprecateBy,
      disallowFrom: result.row.disallowFrom >= 9999 ? null : result.row.disallowFrom,
      citation: "NIST IR 8547 ipd",
    },
    engineVersion: ENGINE_VERSION,
    assessment: result.assessment,
  };
}
