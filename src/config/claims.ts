import { FACTOR_WEIGHTS } from "@/lib/engine";

/**
 * The engine's factor table, in one place, so the method page and the code
 * cannot disagree about what each weight means.
 */
export const CLAIMS = {
  factors: [
    { key: "harvest", label: "Harvest-now-decrypt-later window", weight: FACTOR_WEIGHTS.harvest, question: "How long until ciphertext captured today is decryptable?" },
    { key: "quantumBits", label: "Quantum security strength", weight: FACTOR_WEIGHTS.quantumBits, question: "How many bits of security survive a quantum adversary?" },
    { key: "schedule", label: "Migration headroom", weight: FACTOR_WEIGHTS.schedule, question: "Is there still time to finish before NIST forbids it?" },
    { key: "classical", label: "Classical weakness", weight: FACTOR_WEIGHTS.classical, question: "Is it already broken without a quantum computer at all?" },
    { key: "supply", label: "Dependency supply signal", weight: FACTOR_WEIGHTS.supply, question: "Is the package maintained, and does it carry known advisories?" },
    { key: "usage", label: "What this primitive protects", weight: FACTOR_WEIGHTS.usage, question: "What depends on this key establishment or signature?" },
  ],
  deadlineRule: "Work must start by H - (X + Y): H is the quantum-capability horizon, X the years the data must stay confidential, Y the migration lead time.",
  sealRule: "seal_n = SHA-384(UTF-8(prevSeal) || canonicalJson(event_n)), chained from a genesis value derived from the survey id.",
} as const;