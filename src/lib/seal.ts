import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical";

/**
 * Append-only per-survey seal chain.
 *
 *   genesis = SHA-384(UTF-8("pqc-triage/genesis/v1" || surveyId))
 *   seal_n  = SHA-384(UTF-8(prevSeal) || canonicalJson(event_n))
 *
 * The payload is canonical JSON so the digest is stable across engines and
 * platforms. Editing or deleting any event in the middle breaks every seal
 * after it, which is exactly what `replaySealChain` reports.
 */

export const SEAL_ALGORITHM = "SHA-384";
export const SEAL_GENESIS_PREFIX = "pqc-triage/genesis/v1";

export type SealEvent = {
  seq: number;
  type: string;
  at: string;
  payload: Record<string, unknown>;
};

export type SealedEvent = SealEvent & {
  prevSeal: string;
  seal: string;
};

export type ReplayResult = {
  valid: boolean;
  eventsChecked: number;
  genesisSeal: string;
  headSeal: string;
  brokenAtSeq: number | null;
  brokenReason: string | null;
};

export function computeGenesisSeal(surveyId: string): string {
  return createHash("sha384")
    .update(`${SEAL_GENESIS_PREFIX}${surveyId}`, "utf8")
    .digest("hex");
}

export function computeSeal(prevSeal: string, event: SealEvent): string {
  const payload = canonicalJson({
    seq: event.seq,
    type: event.type,
    at: event.at,
    payload: event.payload,
  });
  return createHash("sha384").update(prevSeal, "utf8").update(payload, "utf8").digest("hex");
}

export function sealEvent(prevSeal: string, event: SealEvent): SealedEvent {
  return { ...event, prevSeal, seal: computeSeal(prevSeal, event) };
}

/** Recompute the whole chain and report the first link that does not hold. */
export function replaySealChain(surveyId: string, events: readonly SealEvent[]): ReplayResult {
  const genesisSeal = computeGenesisSeal(surveyId);
  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  let prev = genesisSeal;
  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index];
    const expectedSeq = index + 1;
    if (event.seq !== expectedSeq) {
      return {
        valid: false,
        eventsChecked: index,
        genesisSeal,
        headSeal: prev,
        brokenAtSeq: event.seq,
        brokenReason: `sequence gap: expected seq ${expectedSeq}, found ${event.seq}`,
      };
    }
    const expected = computeSeal(prev, event);
    const actual = (event as { seal?: string }).seal;
    if (actual !== undefined && actual !== expected) {
      return {
        valid: false,
        eventsChecked: index,
        genesisSeal,
        headSeal: prev,
        brokenAtSeq: event.seq,
        brokenReason: "stored seal does not match the recomputed digest for this event",
      };
    }
    prev = expected;
  }

  return {
    valid: true,
    eventsChecked: ordered.length,
    genesisSeal,
    headSeal: prev,
    brokenAtSeq: null,
    brokenReason: null,
  };
}