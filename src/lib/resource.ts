import { CITATIONS } from "./crypto-registry";
import type { QuantumResource } from "./types";

/**
 * Published resource estimates for a cryptographically relevant quantum
 * computer (CRQC) attacking one key. These are literature estimates under
 * stated assumptions, not predictions of a date; the UI labels them as such.
 */

/**
 * Gidney and Eker\u00e5 (Quantum 5, 433, 2021) abstract-circuit model for factoring
 * an n-bit RSA modulus:
 *   logical qubits = 3n + 0.002 n lg n
 *   Toffoli gates  = 0.3 n^3 + 0.0005 n^3 lg n
 * For n = 2048 this yields 6,189 logical qubits and ~2.62e9 Toffolis, which is
 * exactly what the paper reports.
 */
export function rsaLogicalQubits(bits: number): number {
  return Math.round(3 * bits + 0.002 * bits * Math.log2(bits));
}

export function rsaToffolis(bits: number): number {
  const lg = Math.log2(bits);
  return Math.round(0.3 * Math.pow(bits, 3) + 0.0005 * Math.pow(bits, 3) * lg);
}

/**
 * The same paper's concrete RSA-2048 run: ~20 million noisy surface-code qubits
 * for ~8 hours at a 1e-3 physical error rate and a 1 microsecond cycle. Dividing
 * by the 6,189 logical qubits of its own circuit gives the physical-to-logical
 * ratio used here, so the number stays internally consistent with the citation.
 */
export const SURFACE_CODE_RATIO = Math.round(20_000_000 / rsaLogicalQubits(2048));

/**
 * ECDLP over a prime-field curve. The anchor is H\u00e4ner et al. (PQCrypto 2020):
 * 2,124 logical qubits to break a 256-bit curve. Their construction and the
 * later reductions are linear in the key length, so the model here is that
 * anchor scaled linearly, and it is labelled as a linear fit everywhere it is
 * shown. No Toffoli figure is claimed because the published counts for this
 * problem span several orders of magnitude depending on the construction.
 */
export const ECDLP_QUBITS_PER_BIT = 2124 / 256;

export function ecdlpLogicalQubits(bits: number): number {
  return Math.round(ECDLP_QUBITS_PER_BIT * bits);
}

function fmtCount(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} billion`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} million`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} thousand`;
  return String(value);
}

export type ResourceTarget = {
  kind: "rsa" | "ec" | "symmetric" | "none";
  keyBits: number | null;
  quantumBits: number;
};

export function estimateQuantumResources(target: ResourceTarget): QuantumResource {
  if (target.kind === "rsa" && target.keyBits) {
    const logical = rsaLogicalQubits(target.keyBits);
    const toffolis = rsaToffolis(target.keyBits);
    return {
      basis: "rsa-abstract-circuit",
      logicalQubits: logical,
      toffoliGates: toffolis,
      physicalQubits: logical * SURFACE_CODE_RATIO,
      runtimeLabel:
        target.keyBits === 2048
          ? "about 8 hours on ~20 million physical qubits"
          : "scaled from the RSA-2048 estimate under the same assumptions",
      citation: CITATIONS.gidneyEkera2021.label,
    };
  }

  if (target.kind === "ec" && target.keyBits) {
    const logical = ecdlpLogicalQubits(target.keyBits);
    return {
      basis: "ecdlp-linear",
      logicalQubits: logical,
      toffoliGates: null,
      physicalQubits: null,
      runtimeLabel: "linear fit anchored on the published 256-bit ECDLP estimate",
      citation: CITATIONS.haner2020.label,
    };
  }

  if (target.kind === "symmetric") {
    return {
      basis: "symmetric-grover",
      logicalQubits: null,
      toffoliGates: null,
      physicalQubits: null,
      runtimeLabel: `Grover's algorithm halves this to ${target.quantumBits}-bit quantum strength; no Shor-style resource estimate applies`,
      citation: CITATIONS.grover1996.label,
    };
  }

  return {
    basis: "none",
    logicalQubits: null,
    toffoliGates: null,
    physicalQubits: null,
    runtimeLabel: "no cryptographically relevant quantum attack applies to this primitive",
    citation: CITATIONS.nistSp80057.label,
  };
}

/** Map a primitive to the quantum problem that applies to it. */
export function resourceTargetFor(family: string, keyBits: number | null, quantumBits: number): ResourceTarget {
  if (family === "kex-public" || family === "signature-public") {
    if (quantumBits > 0) return { kind: "none", keyBits, quantumBits };
    if (keyBits && keyBits >= 2048) return { kind: "rsa", keyBits, quantumBits };
    if (keyBits) return { kind: "ec", keyBits, quantumBits };
    return { kind: "none", keyBits, quantumBits };
  }
  if (family === "symmetric-cipher" || family === "stream-cipher" || family === "mac" || family === "hash") {
    return { kind: "symmetric", keyBits, quantumBits };
  }
  return { kind: "none", keyBits, quantumBits };
}

export function describeResource(resource: QuantumResource): string {
  if (resource.logicalQubits === null) return resource.runtimeLabel;
  const physical = resource.physicalQubits ? `, about ${fmtCount(resource.physicalQubits)} physical` : "";
  return `${fmtCount(resource.logicalQubits)} logical qubits${physical}, ${resource.runtimeLabel}`;
}