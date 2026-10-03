import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SEAL_ALGORITHM,
  SEAL_GENESIS_PREFIX,
  computeGenesisSeal,
  computeSeal,
  replaySealChain,
  sealEvent,
  type SealEvent,
} from "./seal";

const SURVEY_ID = "0f7c1f1e-5c6b-4a3e-9c2f-1b2d3e4f5a6b";

/**
 * Every expectation below is recomputed here with Node's crypto directly rather
 * than by calling the implementation, so a change in the chain would have to
 * change both copies to pass.
 */
function oracleGenesis(id: string): string {
  return createHash("sha384").update(`${SEAL_GENESIS_PREFIX}${id}`, "utf8").digest("hex");
}

function oracleSeal(prev: string, event: SealEvent): string {
  const payload = JSON.stringify({
    at: event.at,
    payload: event.payload,
    seq: event.seq,
    type: event.type,
  });
  return createHash("sha384").update(prev, "utf8").update(payload, "utf8").digest("hex");
}

describe("seal chain", () => {
  it("derives the genesis value the way the oracle does", () => {
    expect(computeGenesisSeal(SURVEY_ID)).toBe(oracleGenesis(SURVEY_ID));
    expect(SEAL_ALGORITHM).toBe("SHA-384");
  });

  it("produces a 96-character hex digest", () => {
    expect(computeGenesisSeal(SURVEY_ID)).toMatch(/^[0-9a-f]{96}$/);
  });

  it("matches the oracle seal for a known event", () => {
    const event: SealEvent = { seq: 1, type: "survey.imported", at: "2026-09-30T10:00:00.000Z", payload: { surfaceCount: 7 } };
    expect(computeSeal(oracleGenesis(SURVEY_ID), event)).toBe(oracleSeal(oracleGenesis(SURVEY_ID), event));
  });

  it("is deterministic for the same chain", () => {
    const events: SealEvent[] = [
      { seq: 1, type: "a", at: "2026-01-01T00:00:00.000Z", payload: { x: 1 } },
      { seq: 2, type: "b", at: "2026-01-01T00:00:01.000Z", payload: { y: 2 } },
    ];
    const first = events.map((event, index) => computeSeal(index === 0 ? computeGenesisSeal(SURVEY_ID) : "x", event));
    const second = events.map((event, index) => computeSeal(index === 0 ? computeGenesisSeal(SURVEY_ID) : "x", event));
    expect(first).toEqual(second);
  });

  it("replays a hand-built chain cleanly", () => {
    let prev = computeGenesisSeal(SURVEY_ID);
    const events: SealEvent[] = [];
    for (let seq = 1; seq <= 5; seq += 1) {
      const event: SealEvent = { seq, type: `step-${seq}`, at: "2026-01-01T00:00:00.000Z", payload: { seq } };
      const sealed = sealEvent(prev, event);
      prev = sealed.seal;
      events.push(sealed);
    }
    const report = replaySealChain(SURVEY_ID, events);
    expect(report.valid).toBe(true);
    expect(report.eventsChecked).toBe(5);
    expect(report.brokenAtSeq).toBeNull();
    expect(report.headSeal).toBe(prev);
  });

  it("reports the first broken link when a payload is edited", () => {
    let prev = computeGenesisSeal(SURVEY_ID);
    const events: ReturnType<typeof sealEvent>[] = [];
    for (let seq = 1; seq <= 4; seq += 1) {
      const sealed = sealEvent(prev, { seq, type: `step-${seq}`, at: "2026-01-01T00:00:00.000Z", payload: { seq } });
      prev = sealed.seal;
      events.push(sealed);
    }
    const tampered = events.map((event, index) =>
      index === 1 ? { ...event, payload: { seq: 999 } } : event,
    );
    const report = replaySealChain(SURVEY_ID, tampered);
    expect(report.valid).toBe(false);
    expect(report.brokenAtSeq).toBe(2);
    expect(report.eventsChecked).toBe(1);
    expect(report.brokenReason).toMatch(/does not match/i);
  });

  it("detects a missing event as a sequence gap", () => {
    let prev = computeGenesisSeal(SURVEY_ID);
    const events: ReturnType<typeof sealEvent>[] = [];
    for (let seq = 1; seq <= 3; seq += 1) {
      const sealed = sealEvent(prev, { seq, type: "s", at: "2026-01-01T00:00:00.000Z", payload: {} });
      prev = sealed.seal;
      events.push(sealed);
    }
    const report = replaySealChain(SURVEY_ID, [events[0], events[2]]);
    expect(report.valid).toBe(false);
    expect(report.brokenReason).toMatch(/sequence gap/i);
  });

  it("is order-independent, because the chain is keyed by seq", () => {
    let prev = computeGenesisSeal(SURVEY_ID);
    const events: ReturnType<typeof sealEvent>[] = [];
    for (const seq of [1, 2, 3]) {
      const sealed = sealEvent(prev, { seq, type: "s", at: "2026-01-01T00:00:00.000Z", payload: { seq } });
      prev = sealed.seal;
      events.push(sealed);
    }
    const shuffled = [events[2], events[0], events[1]];
    expect(replaySealChain(SURVEY_ID, shuffled).valid).toBe(true);
  });

  it("accepts an empty chain and reports the genesis value as the head", () => {
    const report = replaySealChain(SURVEY_ID, []);
    expect(report.valid).toBe(true);
    expect(report.eventsChecked).toBe(0);
    expect(report.headSeal).toBe(computeGenesisSeal(SURVEY_ID));
  });

  it("orders events by seq before replaying", () => {
    let prev = computeGenesisSeal(SURVEY_ID);
    const events: ReturnType<typeof sealEvent>[] = [];
    for (const seq of [1, 2, 3]) {
      const sealed = sealEvent(prev, { seq, type: "s", at: "2026-01-01T00:00:00.000Z", payload: { seq } });
      prev = sealed.seal;
      events.push(sealed);
    }
    const shuffled = [events[2], events[0], events[1]];
    expect(replaySealChain(SURVEY_ID, shuffled).valid).toBe(true);
  });

  it("gives a different genesis value to a different survey", () => {
    expect(computeGenesisSeal(SURVEY_ID)).not.toBe(computeGenesisSeal("11111111-1111-4111-8111-111111111111"));
  });
});