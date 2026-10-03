import { findPrimitive, resolvePrimitive } from "./crypto-registry";
import type { CryptoFamily, Ecosystem, Usage } from "./types";

/**
 * Deterministic discovery. Two independent inputs, one output shape:
 *  - a dependency manifest, parsed per ecosystem, mapped through a curated
 *    package-to-primitive table;
 *  - a source excerpt, scanned line by line for cryptographic call sites.
 *
 * Nothing here guesses. A pattern either matched, with the line it matched on,
 * or it did not. Every surface carries that evidence into the database.
 */

export const MAX_MANIFEST_CHARS = 200_000;
export const MAX_SOURCE_CHARS = 200_000;
export const MAX_SOURCE_LINES = 4_000;
export const MAX_SURFACES = 60;

export type ExtractedSurface = {
  label: string;
  family: CryptoFamily;
  primitive: string;
  keyBits: number | null;
  usage: Usage;
  origin: "dependency" | "source-scan";
  ecosystem: Ecosystem | null;
  packageName: string | null;
  packageVersion: string | null;
  location: string;
  evidence: string;
  shelfLifeYears: number;
};

export type ParsedPackage = {
  ecosystem: Ecosystem;
  name: string;
  version: string | null;
};

export type ExtractResult = {
  surfaces: ExtractedSurface[];
  ecosystem: Ecosystem | null;
  packagesScanned: number;
  cryptoPackages: number;
  linesScanned: number;
  truncated: boolean;
};

/** Default data shelf life per role: how long the protected data must stay secret. */
export const DEFAULT_SHELF_LIFE: Record<Usage, number> = {
  "certificate-authority": 10,
  "code-signing": 10,
  "session-establishment": 5,
  "key-generation": 5,
  "data-at-rest": 7,
  "data-in-transit": 3,
  "password-storage": 0,
  unknown: 5,
};

export function shelfLifeFor(usage: Usage): number {
  return DEFAULT_SHELF_LIFE[usage] ?? 5;
}

// ---------------------------------------------------------------------------
// Ecosystem detection
// ---------------------------------------------------------------------------

export function detectEcosystem(manifest: string): Ecosystem | null {
  const text = manifest.trim();
  if (!text) return null;

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (Array.isArray(parsed.packages) && parsed.packages[0] && typeof parsed.packages[0] === "object") {
        return "packagist";
      }
      if (parsed.lockfileVersion || parsed.packages) return "npm";
      if (parsed.dependencies || parsed.devDependencies || parsed.require) return "npm";
      return "npm";
    } catch {
      /* fall through to text heuristics */
    }
  }

  if (/^\s*<project[\s>]/m.test(text) || /<artifactId>/.test(text)) return "maven";
  if (/^\s*module\s+\S+/m.test(text) && /require\s*\(/.test(text)) return "go";
  if (/^\s*(GEM|remote:|specs:)/m.test(text) || /^\s{4}\S+ \(\d[^)]*\)\s*$/m.test(text)) return "rubygems";
  if (/\[\[package\]\]/.test(text)) return "crates.io";
  if (/^\s*"require"\s*:\s*\{/m.test(text) || /^\s*"packages"\s*:/m.test(text)) return "packagist";
  if (/^[A-Za-z0-9_.\-]+\s*(==|>=|<=|~=|>)\s*\d/m.test(text)) return "pypi";

  return null;
}

// ---------------------------------------------------------------------------
// Manifest parsing
// ---------------------------------------------------------------------------

function cleanVersion(value: string): string | null {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  const match = trimmed.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)?/);
  return match ? match[0] : null;
}

function parseNpm(manifest: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(manifest) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!parsed) return out;

  const seen = new Set<string>();
  const push = (name: string, version: string | null) => {
    if (!name || name.length > 120) return;
    if (seen.has(name)) return;
    seen.add(name);
    out.push({ ecosystem: "npm", name, version });
  };

  const packages = parsed.packages;
  if (packages && typeof packages === "object" && !Array.isArray(packages)) {
    for (const [key, value] of Object.entries(packages as Record<string, unknown>)) {
      const name = key.includes("node_modules/") ? key.slice(key.lastIndexOf("node_modules/") + 13) : key;
      if (!name) continue;
      const version =
        value && typeof value === "object" && typeof (value as { version?: unknown }).version === "string"
          ? ((value as { version: string }).version ?? null)
          : null;
      push(name, version ? cleanVersion(version) : null);
    }
  }

  const dependencies = parsed.dependencies;
  if (dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)) {
    for (const [name, value] of Object.entries(dependencies as Record<string, unknown>)) {
      const version =
        typeof value === "string"
          ? cleanVersion(value)
          : value && typeof value === "object" && typeof (value as { version?: unknown }).version === "string"
            ? cleanVersion((value as { version: string }).version)
            : null;
      push(name, version);
    }
  }

  for (const field of ["devDependencies", "peerDependencies", "optionalDependencies"] as const) {
    const block = parsed[field];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      for (const [name, range] of Object.entries(block as Record<string, unknown>)) {
        push(name, typeof range === "string" ? cleanVersion(range) : null);
      }
    }
  }

  return out;
}

function parsePypi(manifest: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  for (const raw of manifest.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    const match = line.match(/^([A-Za-z0-9_.\-]+)\s*(?:\[[^\]]+\])?\s*(==|>=|<=|~=|>|<|!=)\s*([^\s;#]+)/);
    if (match) out.push({ ecosystem: "pypi", name: match[1], version: cleanVersion(match[3]) });
  }
  return out;
}

function parseGo(manifest: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  for (const raw of manifest.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const inBlock = line.replace(/^require\s*\(/, "").replace(/\)$/, "").trim();
    const match = inBlock.match(/^([a-z0-9.\-]+\.[a-z]{2,}\/[^\s]+|[a-z0-9.\-]+\/[^\s]+)\s+(v[^\s]+)$/i);
    if (match) {
      out.push({ ecosystem: "go", name: match[1], version: cleanVersion(match[2]) });
      continue;
    }
    const single = line.match(/^require\s+([^\s]+)\s+(v[^\s]+)$/);
    if (single) out.push({ ecosystem: "go", name: single[1], version: cleanVersion(single[2]) });
  }
  return out;
}

function parseRuby(manifest: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  let inSpecs = false;
  for (const raw of manifest.split(/\r?\n/)) {
    if (/^\s*specs:\s*$/.test(raw)) {
      inSpecs = true;
      continue;
    }
    if (!inSpecs) continue;
    const match = raw.match(/^\s{4}([a-zA-Z0-9_.\-]+)\s+\(([^)]+)\)\s*$/);
    if (match) out.push({ ecosystem: "rubygems", name: match[1], version: cleanVersion(match[2]) });
  }
  return out;
}

function parsePackagist(manifest: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  try {
    const parsed = JSON.parse(manifest) as { packages?: unknown; require?: Record<string, string> };
    if (Array.isArray(parsed.packages)) {
      for (const entry of parsed.packages) {
        if (entry && typeof entry === "object") {
          const item = entry as { name?: unknown; version?: unknown };
          if (typeof item.name === "string") {
            out.push({ ecosystem: "packagist", name: item.name, version: cleanVersion(String(item.version ?? "")) });
          }
        }
      }
    }
    if (parsed.require && typeof parsed.require === "object") {
      for (const [name, range] of Object.entries(parsed.require)) {
        out.push({ ecosystem: "packagist", name, version: cleanVersion(String(range)) });
      }
    }
  } catch {
    /* not JSON */
  }
  return out;
}

function parseCargo(manifest: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  const blocks = manifest.split(/\[\[package\]\]/).slice(1);
  for (const block of blocks) {
    const name = block.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const version = block.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (name) out.push({ ecosystem: "crates.io", name: name[1], version: version ? cleanVersion(version[1]) : null });
  }
  return out;
}

function parseMaven(manifest: string): ParsedPackage[] {
  const out: ParsedPackage[] = [];
  const re = /<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*(?:<version>([^<]+)<\/version>)?/g;
  let match = re.exec(manifest);
  while (match) {
    out.push({
      ecosystem: "maven",
      name: `${match[1].trim()}:${match[2].trim()}`,
      version: match[3] ? cleanVersion(match[3]) : null,
    });
    match = re.exec(manifest);
  }
  return out;
}

export function parseManifest(manifest: string, ecosystem: Ecosystem): ParsedPackage[] {
  switch (ecosystem) {
    case "npm":
      return parseNpm(manifest);
    case "pypi":
      return parsePypi(manifest);
    case "go":
      return parseGo(manifest);
    case "rubygems":
      return parseRuby(manifest);
    case "packagist":
      return parsePackagist(manifest);
    case "crates.io":
      return parseCargo(manifest);
    case "maven":
      return parseMaven(manifest);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Package to primitive hints
// ---------------------------------------------------------------------------

type Hint = { primitive: string; usage: Usage };

const PACKAGE_HINTS: Record<string, Hint[]> = {
  // npm
  "node-forge": [{ primitive: "rsa-2048", usage: "session-establishment" }],
  jsencrypt: [{ primitive: "rsa-2048", usage: "session-establishment" }],
  "node-rsa": [{ primitive: "rsa-sign-2048", usage: "code-signing" }],
  jsonwebtoken: [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  jose: [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  "express-session": [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  "cookie-parser": [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  elliptic: [{ primitive: "ecdsa-p256", usage: "code-signing" }],
  "@noble/curves": [{ primitive: "ecdsa-p256", usage: "code-signing" }],
  tweetnacl: [{ primitive: "x25519", usage: "session-establishment" }],
  "@noble/secp256k1": [{ primitive: "ecdsa-p256", usage: "code-signing" }],
  "libsodium-wrappers": [{ primitive: "chacha20-poly1305", usage: "data-in-transit" }],
  libsodium: [{ primitive: "chacha20-poly1305", usage: "data-in-transit" }],
  bcrypt: [{ primitive: "bcrypt", usage: "password-storage" }],
  bcryptjs: [{ primitive: "bcrypt", usage: "password-storage" }],
  "crypto-js": [{ primitive: "aes-128", usage: "data-at-rest" }],
  "js-sha256": [{ primitive: "sha-256", usage: "unknown" }],
  "sha.js": [{ primitive: "sha-256", usage: "unknown" }],
  ssh2: [{ primitive: "x25519", usage: "session-establishment" }],
  "@peculiar/x509": [{ primitive: "rsa-sign-2048", usage: "certificate-authority" }],
  "node-forge-pki": [{ primitive: "rsa-sign-2048", usage: "certificate-authority" }],
  "@noble/hashes": [{ primitive: "sha-256", usage: "unknown" }],

  // pypi
  pycryptodome: [{ primitive: "rsa-2048", usage: "session-establishment" }],
  pycrypto: [{ primitive: "rsa-2048", usage: "session-establishment" }],
  cryptography: [{ primitive: "rsa-2048", usage: "session-establishment" }],
  pyjwt: [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  passlib: [{ primitive: "bcrypt", usage: "password-storage" }],
  "argon2-cffi": [{ primitive: "argon2id", usage: "password-storage" }],
  ecdsa: [{ primitive: "ecdsa-p256", usage: "code-signing" }],
  pynacl: [{ primitive: "x25519", usage: "session-establishment" }],
  paramiko: [{ primitive: "ecdsa-p256", usage: "session-establishment" }],
  "python-jose": [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  itsdangerous: [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  "oauthlib": [{ primitive: "rsa-sign-2048", usage: "session-establishment" }],

  // go
  "golang.org/x/crypto": [{ primitive: "x25519", usage: "session-establishment" }],
  "github.com/cloudflare/circl": [{ primitive: "ml-kem-768", usage: "session-establishment" }],
  "filippo.io/edwards25519": [{ primitive: "ed25519", usage: "code-signing" }],

  // rubygems
  openssl: [{ primitive: "rsa-2048", usage: "session-establishment" }],
  jwt: [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  "bcrypt-ruby": [{ primitive: "bcrypt", usage: "password-storage" }],
  devise: [{ primitive: "bcrypt", usage: "password-storage" }],

  // packagist
  "defuse/php-encryption": [{ primitive: "aes-256", usage: "data-at-rest" }],
  "phpseclib/phpseclib": [{ primitive: "rsa-2048", usage: "session-establishment" }],
  "lcobucci/jwt": [{ primitive: "hmac-sha256", usage: "session-establishment" }],

  // crates.io
  rsa: [{ primitive: "rsa-2048", usage: "session-establishment" }],
  p256: [{ primitive: "ecdsa-p256", usage: "code-signing" }],
  "x25519-dalek": [{ primitive: "x25519", usage: "session-establishment" }],
  ed25519: [{ primitive: "ed25519", usage: "code-signing" }],
  argon2: [{ primitive: "argon2id", usage: "password-storage" }],
  "aes-gcm": [{ primitive: "aes-256", usage: "data-at-rest" }],
  sha2: [{ primitive: "sha-256", usage: "unknown" }],
  md5: [{ primitive: "md5", usage: "unknown" }],
  "hmac-sha2": [{ primitive: "hmac-sha256", usage: "unknown" }],

  // maven
  "org.bouncycastle:bcprov": [{ primitive: "rsa-2048", usage: "session-establishment" }],
  "com.auth0:java-jwt": [{ primitive: "hmac-sha256", usage: "session-establishment" }],
  "com.nimbusds:nimbus-jose-jwt": [{ primitive: "ecdsa-p256", usage: "session-establishment" }],
  "org.bouncycastle:bcprov-jdk18on": [{ primitive: "rsa-2048", usage: "session-establishment" }],
};

function normalizePackage(name: string): string {
  return name.trim().toLowerCase().replace(/^@([^/]+)\/[^@]+$/, "@$1/*");
}

// ---------------------------------------------------------------------------
// Source scan rules
// ---------------------------------------------------------------------------

type SourceRule = {
  primitive: string;
  usage: Usage;
  re: RegExp;
  /** Extract a key length from a capture group when the rule supports it. */
  bits?: (match: RegExpMatchArray) => number | null;
};

const SECRET_CONTEXT = /(key|secret|token|nonce|salt|iv|password|seed|otp|session|sig)/i;

const SOURCE_RULES: SourceRule[] = [
  { primitive: "md5", usage: "unknown", re: /(?:createHash|hashlib\.new|hashlib\.)\s*\(?\s*['"]?md5['"]?|MD5\b|md5\s*\(/i },
  { primitive: "sha-1", usage: "unknown", re: /(?:createHash|hashlib\.new)\s*\(?\s*['"]?sha-?1['"]?|sha1\s*\(|SHA-?1\b/i },
  { primitive: "sha-256", usage: "unknown", re: /(?:createHash|hashlib\.new)\s*\(?\s*['"]?sha-?256['"]?|sha256\s*\(|SHA-?256\b/i },
  { primitive: "hmac-sha1", usage: "session-establishment", re: /(?:createHmac|hmac\.new)\s*\(?\s*['"]?sha-?1['"]?|hmac-?sha-?1/i },
  { primitive: "hmac-sha256", usage: "session-establishment", re: /(?:createHmac|hmac\.new)\s*\(?\s*['"]?sha-?256['"]?|hmac-?sha-?256|['"]HS256['"]/i },
  { primitive: "rsa-sign-2048", usage: "code-signing", re: /['"](?:RS256|RS384|RS512|PS256|PS384|PS512)['"]/ },
  { primitive: "ecdsa-p256", usage: "code-signing", re: /['"]ES256['"]|ECDSA|createSign\(['"]sha/i },
  { primitive: "rsa-2048", usage: "session-establishment", re: /generateKeyPairSync|createPrivateKey|jsbn|KEY_(?:SIZE|LENGTH)\s*[=:]\s*(\d{3,4})/i, bits: (m) => (m[1] ? Number(m[1]) : 2048) },
  { primitive: "ecdh-p256", usage: "session-establishment", re: /createECDH|ECDH|ecdh\.ECDH/i },
  { primitive: "x25519", usage: "session-establishment", re: /x25519|curve25519|ECDH_ES/ },
  { primitive: "ed25519", usage: "code-signing", re: /ed25519/i },
  { primitive: "diffie-hellman-2048", usage: "session-establishment", re: /createDiffieHellman|DiffieHellmanGroup|dhparam/i },
  { primitive: "ml-kem-768", usage: "session-establishment", re: /ml-?kem|kyber768|kyber/i },
  { primitive: "ml-dsa-65", usage: "code-signing", re: /ml-?dsa|dilithium/i },
  { primitive: "slh-dsa-128s", usage: "code-signing", re: /slh-?dsa|sphincs/i },
  { primitive: "des", usage: "data-at-rest", re: /(?:createCipher\w*|Cipher\.new)\s*\(?\s*['"]des(?:ede)?['"]|\bDES\.ECB\b|\bDES_ECB\b/i },
  { primitive: "triple-des", usage: "data-at-rest", re: /(?:des-ede3|des3|triple-?des|3des)/i },
  { primitive: "aes-128", usage: "data-at-rest", re: /(?:createCipher\w*|Cipher\.new)\s*\(?\s*['"]aes-?128|aes_128|AES_128|AES\.MODE_ECB/i },
  { primitive: "aes-256", usage: "data-at-rest", re: /(?:createCipher\w*|Cipher\.new)\s*\(?\s*['"]aes-?256|aes_256|AES_256|AES\.MODE_GCM/i },
  { primitive: "rc4", usage: "data-in-transit", re: /\brc4\b|ARC4|createCipheriv?\(?\s*['"]rc4/i },
  { primitive: "chacha20-poly1305", usage: "data-in-transit", re: /chacha20-?poly1305|ChaCha20Poly1305|aes-?128-?gcm.*chacha/i },
  { primitive: "pbkdf2-sha1", usage: "password-storage", re: /pbkdf2[_A-Za-z]*\s*\([^)]*sha-?1/i },
  { primitive: "pbkdf2-sha256", usage: "password-storage", re: /\bpbkdf2\b/i },
  { primitive: "bcrypt", usage: "password-storage", re: /\bbcrypt\b/i },
  { primitive: "argon2id", usage: "password-storage", re: /\bargon2(?:id)?\b/i },
  { primitive: "math-random", usage: "key-generation", re: /Math\.random\(\)/ },
];

export type SourceHit = {
  primitive: string;
  family: CryptoFamily;
  keyBits: number | null;
  usage: Usage;
  lines: number[];
  samples: string[];
};

export function scanSource(source: string): SourceHit[] {
  const clipped = source.slice(0, MAX_SOURCE_CHARS);
  const lines = clipped.split(/\r?\n/).slice(0, MAX_SOURCE_LINES);
  const byRule = new Map<string, SourceHit>();

  lines.forEach((line, index) => {
    if (line.length > 600) return;
    for (const rule of SOURCE_RULES) {
      const match = line.match(rule.re);
      if (!match) continue;

      // Math.random() only matters where it feeds a secret.
      if (rule.primitive === "math-random" && !SECRET_CONTEXT.test(line)) continue;

      const keyBits = rule.bits ? rule.bits(match) : null;
      const row = findPrimitive(rule.primitive) ?? resolvePrimitive(rule.primitive);
      const existing = byRule.get(rule.primitive);
      if (existing) {
        if (existing.lines.length < 6) existing.lines.push(index + 1);
        if (existing.samples.length < 3) existing.samples.push(line.trim().slice(0, 160));
        continue;
      }
      byRule.set(rule.primitive, {
        primitive: rule.primitive,
        family: row?.family ?? "unknown",
        keyBits: keyBits ?? row?.keyBits ?? null,
        usage: rule.usage,
        lines: [index + 1],
        samples: [line.trim().slice(0, 160)],
      });
    }
  });

  return [...byRule.values()];
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type ExtractInput = {
  manifest: string;
  source: string;
  name: string;
};

export function extractSurfaces(input: ExtractInput): ExtractResult {
  const manifest = input.manifest.slice(0, MAX_MANIFEST_CHARS);
  const source = input.source.slice(0, MAX_SOURCE_CHARS);
  const ecosystem = detectEcosystem(manifest);
  const packages = ecosystem ? parseManifest(manifest, ecosystem) : [];

  const surfaces: ExtractedSurface[] = [];
  const seen = new Set<string>();
  let cryptoPackages = 0;

  for (const pkg of packages) {
    const normalized = normalizePackage(pkg.name);
    const hints = PACKAGE_HINTS[pkg.name.toLowerCase()] ?? PACKAGE_HINTS[normalized] ?? PACKAGE_HINTS[pkg.name.toLowerCase().replace(/^@([^/]+)\/[^@]+$/, "@$1/*")];
    if (!hints || hints.length === 0) continue;
    cryptoPackages += 1;
    for (const hint of hints) {
      const row = findPrimitive(hint.primitive);
      if (!row) continue;
      const key = `dep:${pkg.name.toLowerCase()}:${hint.primitive}`;
      if (seen.has(key)) continue;
      seen.add(key);
      surfaces.push({
        label: `${pkg.name}${pkg.version ? `@${pkg.version}` : ""} \u00b7 ${row.label}`,
        family: row.family,
        primitive: row.id,
        keyBits: row.keyBits,
        usage: hint.usage,
        origin: "dependency",
        ecosystem: pkg.ecosystem,
        packageName: pkg.name,
        packageVersion: pkg.version,
        location: `${pkg.ecosystem} dependency ${pkg.name}${pkg.version ? `@${pkg.version}` : ""}`,
        evidence: `${pkg.name} is on the curated cryptographic dependency list and typically exercises ${row.label}. Confirm the call sites in the source scan below.`,
        shelfLifeYears: shelfLifeFor(hint.usage),
      });
    }
  }

  const hits = scanSource(source);
  for (const hit of hits) {
    const row = findPrimitive(hit.primitive);
    const primitive = row?.id ?? hit.primitive;
    const key = `src:${primitive}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = row?.label ?? hit.primitive;
    surfaces.push({
      label: `${label} in source`,
      family: hit.family,
      primitive,
      keyBits: hit.keyBits,
      usage: hit.usage,
      origin: "source-scan",
      ecosystem: null,
      packageName: null,
      packageVersion: null,
      location: `lines ${hit.lines.slice(0, 4).join(", ")}`,
      evidence: hit.samples.map((sample) => `L: ${sample}`).join(" \u00b7 "),
      shelfLifeYears: shelfLifeFor(hit.usage),
    });
  }

  const truncated = surfaces.length > MAX_SURFACES;
  return {
    surfaces: surfaces.slice(0, MAX_SURFACES),
    ecosystem,
    packagesScanned: packages.length,
    cryptoPackages,
    linesScanned: Math.min(MAX_SOURCE_LINES, source.split(/\r?\n/).length),
    truncated,
  };
}

/** Ready-made manifests so a first-time visitor can see the loop work immediately. */
export const SAMPLE_MANIFEST = `{
  "name": "billing-gateway",
  "lockfileVersion": 3,
  "dependencies": {
    "jsonwebtoken": "^9.0.2",
    "node-forge": "^1.3.1",
    "bcrypt": "^5.1.1",
    "elliptic": "^6.5.4",
    "libsodium-wrappers": "^0.7.15",
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "tweetnacl": "^1.0.3"
  }
}`;

export const SAMPLE_SOURCE = `# session/auth.js
const TOKEN_TTL = '15m';
const token = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' });

# keys/legacy.js  -- rotated out of the main path but still referenced by the mobile SDK
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const legacyCipher = crypto.createCipheriv('des-ede3', key, iv);

# storage/invoice-pdf.js
const digest = crypto.createHash('md5').update(invoiceXml).digest('hex');
const nonce = Math.random().toString(36).slice(2);

# transport/peering.js
const dh = crypto.createECDH('prime256v1');
const envelope = encryptWithPeer(dh.generateKeys());`;