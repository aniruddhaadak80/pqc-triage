import type { CryptoFamily, Replacement, Usage } from "./types";

/**
 * The scoring table. Every row carries the published number it is derived from,
 * because a migration deadline is only useful if you can see where it came from.
 *
 * Sources, referenced by short id and resolved to URLs in CITATIONS below:
 *  - NIST IR 8547 (Transition to Post-Quantum Cryptography Standards): 112-bit
 *    strength public-key algorithms deprecated after 2030 and disallowed after
 *    2035; 128-bit-and-above disallowed after 2035; 112-bit-level symmetric
 *    primitives disallowed in 2030.
 *  - NIST SP 800-57 Part 1 Rev. 5: comparable security strengths and the
 *    symmetric-strength mapping; Grover's algorithm halves symmetric strength.
 *  - Gidney and Eker\u00e5, Quantum 5, 433 (2021): the abstract-circuit Shor cost
 *    model for n-bit RSA (3n + 0.002n lg n logical qubits, 0.3n\u00b3 +
 *    0.0005n\u00b3 lg n Toffolis) and the ~20 million physical qubit / 8 hour
 *    concrete estimate for RSA-2048.
 *  - H\u00e4ner et al., Estimating the resource requirements of breaking ECC (PQCrypto
 *    2020): 2,124 logical qubits for a 256-bit prime-field ECDLP, which is the
 *    anchor for the linear ECDLP model used here.
 *  - FIPS 203 / 204 / 205: ML-KEM, ML-DSA and SLH-DSA parameter sets and their
 *    security categories.
 */

export const CITATIONS = {
  nistIr8547: {
    label: "NIST IR 8547 ipd, Transition to Post-Quantum Cryptography Standards",
    href: "https://csrc.nist.gov/pubs/ir/8547/ipd",
  },
  nistSp80057: {
    label: "NIST SP 800-57 Part 1 Rev. 5, Key Management",
    href: "https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final",
  },
  gidneyEkera2021: {
    label: "Gidney & Eker\u00e5, How to factor 2048 bit RSA integers in 8 hours using 20 million noisy qubits, Quantum 5, 433 (2021)",
    href: "https://quantum-journal.org/papers/q-2021-04-15-433",
  },
  haner2020: {
    label: "H\u00e4ner et al., Estimating the resource requirements of breaking ECC, PQCrypto 2020 / IACR ePrint 2020/1193",
    href: "https://eprint.iacr.org/2020/1193",
  },
  fips203: { label: "FIPS 203, ML-KEM", href: "https://csrc.nist.gov/pubs/fips/203/final" },
  fips204: { label: "FIPS 204, ML-DSA", href: "https://csrc.nist.gov/pubs/fips/204/final" },
  fips205: { label: "FIPS 205, SLH-DSA", href: "https://csrc.nist.gov/pubs/fips/205/final" },
  grover1996: {
    label: "Grover, A fast quantum mechanical algorithm for database search, FOCS 1996",
    href: "https://arxiv.org/abs/quant-ph/9605043",
  },
} as const;

export type PrimitiveRow = {
  id: string;
  label: string;
  family: CryptoFamily;
  keyBits: number | null;
  /** NIST comparable classical security strength in bits. */
  strengthBits: number;
  /** Security in bits against a cryptographically relevant quantum computer. */
  quantumBits: number;
  /** How broken it already is classically, 0 (sound) to 1 (unusable). */
  classicalWeakness: number;
  defaultUsage: Usage;
  /** Year NIST IR 8547 deprecates this strength level; null if not deprecated. */
  deprecateBy: number | null;
  /** Year NIST IR 8547 disallows this strength level. */
  disallowFrom: number;
  replacement: Replacement;
};

const mlKem = (level: "512" | "768" | "1024", bits: number, lead: number): Replacement => ({
  primitive: `ML-KEM-${level} (FIPS 203), hybrid with X25519`,
  standard: "FIPS 203",
  quantumBits: bits,
  note: "Deploy the hybrid so the session stays secure unless both classical and post-quantum parts fail.",
  migrationLeadYears: lead,
});

const mlDsa = (level: "44" | "65" | "87", bits: number, lead: number): Replacement => ({
  primitive: `ML-DSA-${level} (FIPS 204)`,
  standard: "FIPS 204",
  quantumBits: bits,
  note: "Signature sizes grow roughly 10x over RSA; plan PKI and code-signing trust stores before you start.",
  migrationLeadYears: lead,
});

export const PRIMITIVES: readonly PrimitiveRow[] = [
  // ---- Public key: broken by Shor ------------------------------------------
  {
    id: "rsa-1024",
    label: "RSA-1024",
    family: "signature-public",
    keyBits: 1024,
    strengthBits: 80,
    quantumBits: 0,
    classicalWeakness: 1,
    defaultUsage: "data-in-transit",
    deprecateBy: 2030,
    disallowFrom: 2035,
    replacement: {
      primitive: "ML-KEM-768 (FIPS 203)",
      standard: "FIPS 203",
      quantumBits: 192,
      note: "1024-bit RSA is already factorable by well-resourced attackers today; treat this as an incident, not a migration.",
      migrationLeadYears: 2,
    },
  },
  {
    id: "rsa-2048",
    label: "RSA-2048",
    family: "kex-public",
    keyBits: 2048,
    strengthBits: 112,
    quantumBits: 0,
    classicalWeakness: 0.1,
    defaultUsage: "session-establishment",
    deprecateBy: 2030,
    disallowFrom: 2035,
    replacement: mlKem("768", 192, 3),
  },
  {
    id: "rsa-3072",
    label: "RSA-3072",
    family: "kex-public",
    keyBits: 3072,
    strengthBits: 128,
    quantumBits: 0,
    classicalWeakness: 0.02,
    defaultUsage: "session-establishment",
    deprecateBy: null,
    disallowFrom: 2035,
    replacement: mlKem("768", 192, 3),
  },
  {
    id: "rsa-4096",
    label: "RSA-4096",
    family: "kex-public",
    keyBits: 4096,
    strengthBits: 152,
    quantumBits: 0,
    classicalWeakness: 0.01,
    defaultUsage: "session-establishment",
    deprecateBy: null,
    disallowFrom: 2035,
    replacement: mlKem("1024", 256, 3),
  },
  {
    id: "rsa-sign-2048",
    label: "RSA-2048 signature",
    family: "signature-public",
    keyBits: 2048,
    strengthBits: 112,
    quantumBits: 0,
    classicalWeakness: 0.1,
    defaultUsage: "code-signing",
    deprecateBy: 2030,
    disallowFrom: 2035,
    replacement: mlDsa("65", 192, 3),
  },
  {
    id: "ecdsa-p224",
    label: "ECDSA P-224",
    family: "signature-public",
    keyBits: 224,
    strengthBits: 112,
    quantumBits: 0,
    classicalWeakness: 0.35,
    defaultUsage: "code-signing",
    deprecateBy: 2030,
    disallowFrom: 2035,
    replacement: mlDsa("44", 128, 3),
  },
  {
    id: "ecdsa-p256",
    label: "ECDSA P-256",
    family: "signature-public",
    keyBits: 256,
    strengthBits: 128,
    quantumBits: 0,
    classicalWeakness: 0.05,
    defaultUsage: "code-signing",
    deprecateBy: null,
    disallowFrom: 2035,
    replacement: mlDsa("65", 192, 3),
  },
  {
    id: "ecdsa-p384",
    label: "ECDSA P-384",
    family: "signature-public",
    keyBits: 384,
    strengthBits: 192,
    quantumBits: 0,
    classicalWeakness: 0.03,
    defaultUsage: "certificate-authority",
    deprecateBy: null,
    disallowFrom: 2035,
    replacement: mlDsa("65", 192, 3),
  },
  {
    id: "ecdh-p256",
    label: "ECDH P-256",
    family: "kex-public",
    keyBits: 256,
    strengthBits: 128,
    quantumBits: 0,
    classicalWeakness: 0.05,
    defaultUsage: "session-establishment",
    deprecateBy: null,
    disallowFrom: 2035,
    replacement: mlKem("768", 192, 3),
  },
  {
    id: "ecdh-p384",
    label: "ECDH P-384",
    family: "kex-public",
    keyBits: 384,
    strengthBits: 192,
    quantumBits: 0,
    classicalWeakness: 0.03,
    defaultUsage: "session-establishment",
    deprecateBy: null,
    disallowFrom: 2035,
    replacement: mlKem("768", 192, 3),
  },
  {
    id: "diffie-hellman-2048",
    label: "Finite-field Diffie-Hellman 2048",
    family: "kex-public",
    keyBits: 2048,
    strengthBits: 112,
    quantumBits: 0,
    classicalWeakness: 0.15,
    defaultUsage: "session-establishment",
    deprecateBy: 2030,
    disallowFrom: 2035,
    replacement: mlKem("768", 192, 3),
  },
  {
    id: "ed25519",
    label: "Ed25519",
    family: "signature-public",
    keyBits: 256,
    strengthBits: 128,
    quantumBits: 0,
    classicalWeakness: 0.02,
    defaultUsage: "code-signing",
    deprecateBy: null,
    disallowFrom: 2035,
    replacement: mlDsa("65", 192, 4),
  },
  {
    id: "x25519",
    label: "X25519",
    family: "kex-public",
    keyBits: 256,
    strengthBits: 128,
    quantumBits: 0,
    classicalWeakness: 0.02,
    defaultUsage: "session-establishment",
    deprecateBy: null,
    disallowFrom: 2035,
    replacement: mlKem("768", 192, 2),
  },

  // ---- Post-quantum, already standardised ---------------------------------
  {
    id: "ml-kem-512",
    label: "ML-KEM-512",
    family: "kex-public",
    keyBits: 512,
    strengthBits: 128,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "session-establishment",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep ML-KEM-512",
      standard: "FIPS 203",
      quantumBits: 128,
      note: "Category 1. Already quantum-resistant; pair it with AES-256-GCM for confidentiality.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "ml-kem-768",
    label: "ML-KEM-768",
    family: "kex-public",
    keyBits: 768,
    strengthBits: 192,
    quantumBits: 192,
    classicalWeakness: 0,
    defaultUsage: "session-establishment",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep ML-KEM-768",
      standard: "FIPS 203",
      quantumBits: 192,
      note: "Category 3, the NIST-recommended general-purpose key establishment set.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "ml-dsa-44",
    label: "ML-DSA-44",
    family: "signature-public",
    keyBits: 1312,
    strengthBits: 128,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "code-signing",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep ML-DSA-44",
      standard: "FIPS 204",
      quantumBits: 128,
      note: "Category 1. The NIST baseline post-quantum signature.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "ml-dsa-65",
    label: "ML-DSA-65",
    family: "signature-public",
    keyBits: 1952,
    strengthBits: 192,
    quantumBits: 192,
    classicalWeakness: 0,
    defaultUsage: "code-signing",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep ML-DSA-65",
      standard: "FIPS 204",
      quantumBits: 192,
      note: "Category 3. The NIST-recommended general-purpose signature set.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "slh-dsa-128s",
    label: "SLH-DSA-SHA2-128s",
    family: "signature-public",
    keyBits: 128,
    strengthBits: 128,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "code-signing",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep SLH-DSA-SHA2-128s",
      standard: "FIPS 205",
      quantumBits: 128,
      note: "Hash-based and stateless, the conservative choice for very long-lived signatures.",
      migrationLeadYears: 0,
    },
  },

  // ---- Symmetric ----------------------------------------------------------
  {
    id: "md5",
    label: "MD5",
    family: "hash",
    keyBits: 128,
    strengthBits: 0,
    quantumBits: 0,
    classicalWeakness: 1,
    defaultUsage: "unknown",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "SHA-256",
      standard: "FIPS 180-4",
      quantumBits: 128,
      note: "MD5 collisions are practical today. Replace it and then hunt for the places that relied on it for integrity.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "sha-1",
    label: "SHA-1",
    family: "hash",
    keyBits: 160,
    strengthBits: 80,
    quantumBits: 30,
    classicalWeakness: 0.9,
    defaultUsage: "unknown",
    deprecateBy: null,
    disallowFrom: 2030,
    replacement: {
      primitive: "SHA-256 or SHA-384",
      standard: "FIPS 180-4",
      quantumBits: 128,
      note: "Chosen-prefix SHA-1 collisions are demonstrated publicly. 112-bit-level symmetric primitives are disallowed in 2030.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "sha-256",
    label: "SHA-256",
    family: "hash",
    keyBits: 256,
    strengthBits: 128,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "unknown",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep SHA-256",
      standard: "FIPS 180-4",
      quantumBits: 128,
      note: "Grover reduces SHA-256 to 128-bit quantum strength, which NIST still treats as acceptable.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "sha-384",
    label: "SHA-384",
    family: "hash",
    keyBits: 384,
    strengthBits: 192,
    quantumBits: 192,
    classicalWeakness: 0,
    defaultUsage: "unknown",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep SHA-384",
      standard: "FIPS 180-4",
      quantumBits: 192,
      note: "Comfortably above the post-quantum floor.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "hmac-sha256",
    label: "HMAC-SHA-256",
    family: "mac",
    keyBits: 256,
    strengthBits: 128,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "unknown",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep HMAC-SHA-256",
      standard: "FIPS 198-1",
      quantumBits: 128,
      note: "Grover-based generic attacks leave HMAC-SHA-256 well above the 128-bit floor.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "hmac-sha1",
    label: "HMAC-SHA-1",
    family: "mac",
    keyBits: 160,
    strengthBits: 80,
    quantumBits: 40,
    classicalWeakness: 0.75,
    defaultUsage: "unknown",
    deprecateBy: null,
    disallowFrom: 2030,
    replacement: {
      primitive: "HMAC-SHA-256",
      standard: "FIPS 198-1",
      quantumBits: 128,
      note: "Inherits SHA-1's 112-bit-level problem and is disallowed in 2030.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "aes-128",
    label: "AES-128",
    family: "symmetric-cipher",
    keyBits: 128,
    strengthBits: 128,
    quantumBits: 64,
    classicalWeakness: 0.05,
    defaultUsage: "data-at-rest",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "AES-256-GCM",
      standard: "FIPS 197 + SP 800-38D",
      quantumBits: 128,
      note: "AES-128 drops to 64-bit quantum strength under Grover. Acceptable for many uses, but not for long-lived secrets.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "aes-256",
    label: "AES-256",
    family: "symmetric-cipher",
    keyBits: 256,
    strengthBits: 256,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "data-at-rest",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep AES-256-GCM",
      standard: "FIPS 197 + SP 800-38D",
      quantumBits: 128,
      note: "Holds 128-bit quantum strength. Pair with an AEAD mode and a PQ key establishment.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "des",
    label: "DES",
    family: "symmetric-cipher",
    keyBits: 56,
    strengthBits: 56,
    quantumBits: 28,
    classicalWeakness: 1,
    defaultUsage: "data-at-rest",
    deprecateBy: null,
    disallowFrom: 2030,
    replacement: {
      primitive: "AES-256-GCM",
      standard: "FIPS 197 + SP 800-38D",
      quantumBits: 128,
      note: "56-bit keys are brute-forceable in hours on a single machine. Treat every DES use as an active compromise.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "triple-des",
    label: "3DES",
    family: "symmetric-cipher",
    keyBits: 112,
    strengthBits: 112,
    quantumBits: 56,
    classicalWeakness: 0.8,
    defaultUsage: "data-at-rest",
    deprecateBy: null,
    disallowFrom: 2030,
    replacement: {
      primitive: "AES-256-GCM",
      standard: "FIPS 197 + SP 800-38D",
      quantumBits: 128,
      note: "Sweet32 birthday bounds bite at roughly 2^32 blocks; NIST disallows 112-bit-level symmetric primitives in 2030.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "rc4",
    label: "RC4",
    family: "stream-cipher",
    keyBits: 128,
    strengthBits: 0,
    quantumBits: 0,
    classicalWeakness: 1,
    defaultUsage: "data-in-transit",
    deprecateBy: null,
    disallowFrom: 2030,
    replacement: {
      primitive: "ChaCha20-Poly1305 or AES-256-GCM",
      standard: "SP 800-38D / RFC 8439",
      quantumBits: 128,
      note: "RC4 keystream biases are practical to exploit. Remove it.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "chacha20-poly1305",
    label: "ChaCha20-Poly1305",
    family: "stream-cipher",
    keyBits: 256,
    strengthBits: 256,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "data-in-transit",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep ChaCha20-Poly1305",
      standard: "RFC 8439",
      quantumBits: 128,
      note: "Software-friendly AEAD that keeps 128-bit quantum strength.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "pbkdf2-sha256",
    label: "PBKDF2-HMAC-SHA-256",
    family: "kdf",
    keyBits: 256,
    strengthBits: 128,
    quantumBits: 128,
    classicalWeakness: 0.2,
    defaultUsage: "password-storage",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Argon2id or scrypt",
      standard: "RFC 9106 / RFC 7914",
      quantumBits: 128,
      note: "Not quantum-vulnerable, but a high work factor is the only thing protecting the hash.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "pbkdf2-sha1",
    label: "PBKDF2-HMAC-SHA-1",
    family: "kdf",
    keyBits: 160,
    strengthBits: 80,
    quantumBits: 40,
    classicalWeakness: 0.6,
    defaultUsage: "password-storage",
    deprecateBy: null,
    disallowFrom: 2030,
    replacement: {
      primitive: "Argon2id",
      standard: "RFC 9106",
      quantumBits: 128,
      note: "Legacy iteration counts assumed fast hardware; combine with a memory-hard KDF.",
      migrationLeadYears: 1,
    },
  },
  {
    id: "bcrypt",
    label: "bcrypt",
    family: "password-hash",
    keyBits: 0,
    strengthBits: 128,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "password-storage",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep bcrypt or move to Argon2id",
      standard: "OpenBSD bcrypt",
      quantumBits: 128,
      note: "Memory-hard enough that Grover does not change the attack model. Cap the input length.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "argon2id",
    label: "Argon2id",
    family: "password-hash",
    keyBits: 0,
    strengthBits: 128,
    quantumBits: 128,
    classicalWeakness: 0,
    defaultUsage: "password-storage",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "Keep Argon2id",
      standard: "RFC 9106",
      quantumBits: 128,
      note: "The current recommendation for new password storage.",
      migrationLeadYears: 0,
    },
  },
  {
    id: "math-random",
    label: "Math.random() for a secret",
    family: "rng",
    keyBits: 0,
    strengthBits: 0,
    quantumBits: 0,
    classicalWeakness: 1,
    defaultUsage: "key-generation",
    deprecateBy: null,
    disallowFrom: 9999,
    replacement: {
      primitive: "crypto.randomBytes / secrets.token_bytes",
      standard: "FIPS 140-3 approved DRBG",
      quantumBits: 128,
      note: "A non-cryptographic PRNG is guessable today, long before quantum matters. Fix this first.",
      migrationLeadYears: 0.25,
    },
  },
] as const;

export function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Keyed by the normalized id so "RSA-2048", "rsa-2048" and "rsa 2048" all hit. */
const BY_ID = new Map<string, PrimitiveRow>(PRIMITIVES.map((row) => [normalizeToken(row.id), row]));

/**
 * Canonical aliases seen in manifests, source scans and agent arguments.
 * Keys are already lowercased and stripped of non-alphanumerics by the caller.
 */
const ALIASES: Record<string, string> = {
  rsa2048: "rsa-2048",
  rsa: "rsa-2048",
  rsasha256: "rsa-sign-2048",
  rsasha1: "rsa-sign-2048",
  rsapss: "rsa-sign-2048",
  rsablowfish: "rsa-1024",
  rsatre: "rsa-2048",
  rsa1024: "rsa-1024",
  rsa3072: "rsa-3072",
  rsa4096: "rsa-4096",
  pss: "rsa-sign-2048",
  pkcs1: "rsa-sign-2048",
  pkcs8: "rsa-sign-2048",
  ecdh: "ecdh-p256",
  ecdhp256: "ecdh-p256",
  ecdsa: "ecdsa-p256",
  ecdsap256: "ecdsa-p256",
  p256: "ecdh-p256",
  p384: "ecdh-p384",
  prime256v1: "ecdsa-p256",
  secp256k1: "ecdsa-p256",
  secp256r1: "ecdsa-p256",
  curve25519: "x25519",
  x25519: "x25519",
  ed25519: "ed25519",
  dh: "diffie-hellman-2048",
  diffiehellman: "diffie-hellman-2048",
  dhe: "diffie-hellman-2048",
  mlkem: "ml-kem-768",
  mlkem512: "ml-kem-512",
  mlkem768: "ml-kem-768",
  mlkem1024: "ml-kem-1024",
  kyber: "ml-kem-768",
  kyber768: "ml-kem-768",
  mldsa: "ml-dsa-65",
  mldsa44: "ml-dsa-44",
  mldsa65: "ml-dsa-65",
  dilithium: "ml-dsa-65",
  slhdsa: "slh-dsa-128s",
  sphinx: "slh-dsa-128s",
  hs256: "hmac-sha256",
  hs384: "hmac-sha256",
  hs512: "hmac-sha256",
  rs256: "rsa-sign-2048",
  rs384: "rsa-sign-2048",
  rs512: "rsa-sign-2048",
  ps256: "rsa-sign-2048",
  ps384: "rsa-sign-2048",
  ps512: "rsa-sign-2048",
  es256: "ecdsa-p256",
  es384: "ecdsa-p384",
  es512: "ecdsa-p384",
  eddsa: "ed25519",
  diffiehellman2048: "diffie-hellman-2048",
  dh2048: "diffie-hellman-2048",
  md5: "md5",
  sha1: "sha-1",
  sha256: "sha-256",
  sha384: "sha-384",
  sha512: "sha-256",
  sha3: "sha-256",
  blake2: "sha-256",
  hmacsha256: "hmac-sha256",
  hmacsha1: "hmac-sha1",
  hmac: "hmac-sha256",
  hmacsha512: "hmac-sha256",
  aeadchacha20poly1305: "chacha20-poly1305",
  chacha20: "chacha20-poly1305",
  chacha20poly1305: "chacha20-poly1305",
  aes: "aes-128",
  aes128: "aes-128",
  aes128gcm: "aes-128",
  aescbc: "aes-128",
  aesecb: "aes-128",
  aes256: "aes-256",
  aes256gcm: "aes-256",
  tripledes: "triple-des",
  "3des": "triple-des",
  desede: "triple-des",
  des: "des",
  rc4: "rc4",
  pbkdf2: "pbkdf2-sha256",
  pbkdf2sha256: "pbkdf2-sha256",
  pbkdf2sha1: "pbkdf2-sha1",
  bcrypt: "bcrypt",
  argon2: "argon2id",
  argon2id: "argon2id",
  scrypt: "argon2id",
  mathrandom: "math-random",
};


export function findPrimitive(token: string): PrimitiveRow | null {
  const normalized = normalizeToken(token);
  if (!normalized) return null;
  const direct = BY_ID.get(normalized);
  if (direct) return direct;
  const alias = ALIASES[normalized];
  return alias ? BY_ID.get(normalizeToken(alias)) ?? null : null;
}

/**
 * Resolve free text to a primitive. Longest match wins so that "aes-256-gcm"
 * is not shadowed by "aes".
 */
export function resolvePrimitive(text: string): PrimitiveRow | null {
  const normalized = normalizeToken(text);
  if (!normalized) return null;
  let best: { row: PrimitiveRow; length: number } | null = null;
  for (const candidate of PRIMITIVES) {
    const needle = normalizeToken(candidate.id);
    if (needle && normalized.includes(needle)) {
      if (!best || needle.length > best.length) best = { row: candidate, length: needle.length };
    }
  }
  for (const [alias, id] of Object.entries(ALIASES)) {
    if (alias.length >= 4 && normalized.includes(alias)) {
      const row = BY_ID.get(normalizeToken(id));
      if (row && (!best || alias.length > best.length)) best = { row, length: alias.length };
    }
  }
  return best?.row ?? null;
}

/** How exposed a primitive is to a quantum adversary, independent of schedule. */
export function quantumExposureBits(row: PrimitiveRow): number {
  return row.quantumBits;
}

export const NIST_TIMELINE = {
  /** 112-bit strength public-key: deprecated after this year. */
  deprecateBy: 2030,
  /** All quantum-vulnerable public-key: disallowed from this year. */
  disallowFrom: 2035,
  /** 112-bit-level symmetric primitives disallowed here. */
  symmetricFloorDisallowFrom: 2030,
  transitionHref: CITATIONS.nistIr8547.href,
} as const;

export const DEFAULT_HORIZON_YEAR = 2033;
export const MIN_HORIZON_YEAR = 2028;
export const MAX_HORIZON_YEAR = 2040;
export const MIN_SHELF_LIFE = 0;
export const MAX_SHELF_LIFE = 60;