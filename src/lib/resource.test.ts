import { describe, expect, it } from "vitest";
import { CITATIONS, NIST_TIMELINE, PRIMITIVES, findPrimitive, resolvePrimitive } from "./crypto-registry";
import {
  ECDLP_QUBITS_PER_BIT,
  SURFACE_CODE_RATIO,
  ecdlpLogicalQubits,
  estimateQuantumResources,
  rsaLogicalQubits,
  rsaToffolis,
} from "./resource";

describe("Gidney and Ekera closed form", () => {
  it("reproduces the published RSA-2048 logical qubit count", () => {
    expect(rsaLogicalQubits(2048)).toBe(6189);
  });

  it("reproduces the published RSA-2048 Toffoli count to within a rounding step", () => {
    const toffolis = rsaToffolis(2048);
    expect(toffolis).toBeGreaterThan(2.5e9);
    expect(toffolis).toBeLessThan(2.75e9);
  });

  it("scales upward with the modulus", () => {
    expect(rsaLogicalQubits(3072)).toBeGreaterThan(rsaLogicalQubits(2048));
    expect(rsaLogicalQubits(4096)).toBeGreaterThan(rsaLogicalQubits(3072));
    expect(rsaToffolis(4096)).toBeGreaterThan(rsaToffolis(2048));
  });

  it("keeps the physical ratio consistent with the paper's own run", () => {
    expect(SURFACE_CODE_RATIO).toBe(Math.round(20_000_000 / 6189));
  });
});

describe("ECDLP linear model", () => {
  it("hits the published 256-bit anchor exactly", () => {
    expect(ecdlpLogicalQubits(256)).toBe(2124);
  });

  it("scales linearly, matching the coefficient", () => {
    expect(ECDLP_QUBITS_PER_BIT).toBeCloseTo(2124 / 256, 12);
    expect(ecdlpLogicalQubits(384)).toBe(Math.round(ECDLP_QUBITS_PER_BIT * 384));
  });

  it("claims no Toffoli figure for ECDLP, because the literature disagrees", () => {
    const estimate = estimateQuantumResources({ kind: "ec", keyBits: 256, quantumBits: 0 });
    expect(estimate.toffoliGates).toBeNull();
    expect(estimate.physicalQubits).toBeNull();
    expect(estimate.citation).toBe(CITATIONS.haner2020.label);
  });
});

describe("estimateQuantumResources", () => {
  it("halves symmetric strength and cites Grover", () => {
    const estimate = estimateQuantumResources({ kind: "symmetric", keyBits: 256, quantumBits: 128 });
    expect(estimate.basis).toBe("symmetric-grover");
    expect(estimate.runtimeLabel).toContain("128-bit");
    expect(estimate.citation).toBe(CITATIONS.grover1996.label);
  });

  it("reports no quantum attack for a post-quantum primitive", () => {
    const estimate = estimateQuantumResources({ kind: "none", keyBits: 768, quantumBits: 192 });
    expect(estimate.basis).toBe("none");
    expect(estimate.logicalQubits).toBeNull();
  });

  it("cites Gidney and Ekera for RSA", () => {
    const estimate = estimateQuantumResources({ kind: "rsa", keyBits: 2048, quantumBits: 0 });
    expect(estimate.citation).toBe(CITATIONS.gidneyEkera2021.label);
    expect(estimate.runtimeLabel).toContain("20 million");
  });
});

describe("the scoring table", () => {
  it("gives every primitive a replacement with a standard and a lead time", () => {
    for (const row of PRIMITIVES) {
      expect(row.replacement.primitive.length).toBeGreaterThan(0);
      expect(row.replacement.standard.length).toBeGreaterThan(0);
      expect(row.replacement.migrationLeadYears).toBeGreaterThanOrEqual(0);
    }
  });

  it("never disallows a primitive before it deprecates it", () => {
    for (const row of PRIMITIVES) {
      if (row.deprecateBy === null) continue;
      expect(row.disallowFrom).toBeGreaterThan(row.deprecateBy);
    }
  });

  it("matches the NIST timeline on the 112-bit public key rows", () => {
    const rsa2048 = findPrimitive("rsa-2048")!;
    expect(rsa2048.strengthBits).toBe(112);
    expect(rsa2048.deprecateBy).toBe(NIST_TIMELINE.deprecateBy);
    expect(rsa2048.disallowFrom).toBe(NIST_TIMELINE.disallowFrom);

    const rsa3072 = findPrimitive("rsa-3072")!;
    expect(rsa3072.strengthBits).toBeGreaterThanOrEqual(128);
    expect(rsa3072.deprecateBy).toBeNull();
  });

  it("disallows SHA-1 and 3DES in 2030 as 112-bit-level symmetric primitives", () => {
    expect(findPrimitive("sha-1")!.disallowFrom).toBe(NIST_TIMELINE.symmetricFloorDisallowFrom);
    expect(findPrimitive("triple-des")!.disallowFrom).toBe(NIST_TIMELINE.symmetricFloorDisallowFrom);
    expect(findPrimitive("aes-256")!.disallowFrom).toBeGreaterThan(NIST_TIMELINE.disallowFrom);
  });

  it("leaves healthy post-quantum rows with no disallowance date", () => {
    expect(findPrimitive("ml-kem-768")!.disallowFrom).toBeGreaterThan(9998);
    expect(findPrimitive("aes-256")!.quantumBits).toBe(128);
    expect(findPrimitive("ml-kem-768")!.quantumBits).toBe(192);
  });

  it("marks public key that Shor breaks as zero quantum bits", () => {
    for (const id of ["rsa-2048", "ecdsa-p256", "ecdh-p256", "ed25519", "x25519", "diffie-hellman-2048"]) {
      expect(findPrimitive(id)!.quantumBits).toBe(0);
    }
  });

  it("is internally consistent between classical and quantum strength", () => {
    for (const row of PRIMITIVES) {
      if (row.quantumBits === 0) continue;
      if (row.family === "kex-public" || row.family === "signature-public") continue;
      expect(row.quantumBits).toBeLessThanOrEqual(row.strengthBits);
      expect(row.quantumBits).toBeGreaterThan(0);
    }
  });
});

describe("primitive resolution", () => {
  it("resolves registry ids", () => {
    expect(findPrimitive("rsa-2048")!.label).toBe("RSA-2048");
    expect(findPrimitive("RSA-2048")!.label).toBe("RSA-2048");
    expect(findPrimitive("aes 256 gcm")!.label).toBe("AES-256");
  });

  it("resolves common aliases", () => {
    expect(resolvePrimitive("jsonwebtoken HS256")!.id).toBe("hmac-sha256");
    expect(resolvePrimitive("Kyber768 hybrid KEM")!.id).toBe("ml-kem-768");
    expect(resolvePrimitive("Dilithium signature")!.id).toBe("ml-dsa-65");
    expect(["ecdh-p256", "ecdsa-p256"]).toContain(resolvePrimitive("prime256v1")!.id);
    expect(resolvePrimitive("3DES")!.id).toBe("triple-des");
    expect(resolvePrimitive("argon2id")!.id).toBe("argon2id");
  });

  it("returns null for junk rather than guessing", () => {
    expect(findPrimitive("")).toBeNull();
    expect(findPrimitive("not-a-primitive")).toBeNull();
    expect(resolvePrimitive("the quick brown fox")).toBeNull();
  });

  it("prefers the longest match so aes-256 is not shadowed by aes", () => {
    expect(resolvePrimitive("aes-128-gcm")!.id).toBe("aes-128");
    expect(resolvePrimitive("aes-256-gcm")!.id).toBe("aes-256");
  });
});