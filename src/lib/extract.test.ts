import { describe, expect, it } from "vitest";
import {
  MAX_SURFACES,
  SAMPLE_MANIFEST,
  SAMPLE_SOURCE,
  detectEcosystem,
  extractSurfaces,
  parseManifest,
  scanSource,
  shelfLifeFor,
} from "./extract";

const REQUIREMENTS = `# app requirements
requests==2.31.0
pycryptodome>=3.19.0
bcrypt==4.1.2
# a comment
urllib3>=2.0.0
`;

const GO_MOD = `module github.com/acme/gateway

go 1.22

require (
\tgithub.com/golang-jwt/jwt/v5 v5.2.1
\tgithub.com/cloudflare/circl v1.3.7
\tgolang.org/x/crypto v0.23.0
)

require github.com/stretchr/testify v1.9.0 // indirect
`;

describe("ecosystem detection", () => {
  it("detects an npm lockfile", () => {
    expect(detectEcosystem(SAMPLE_MANIFEST)).toBe("npm");
    expect(detectEcosystem('{"dependencies":{"jsonwebtoken":"^9.0.2"}}')).toBe("npm");
  });

  it("detects pypi, go, rubygems, cargo, packagist and maven", () => {
    expect(detectEcosystem(REQUIREMENTS)).toBe("pypi");
    expect(detectEcosystem(GO_MOD)).toBe("go");
    expect(detectEcosystem("GEM\n  remote: https://rubygems.org/\nspecs:\n    jwt (2.7.1)\n")).toBe("rubygems");
    expect(detectEcosystem('[[package]]\nname = "rsa"\nversion = "0.9.6"\n')).toBe("crates.io");
    expect(detectEcosystem('{"packages":[{"name":"defuse/php-encryption","version":"2.4.0"}]}')).toBe("packagist");
    expect(
      detectEcosystem("<project><groupId>org.bouncycastle</groupId><artifactId>bcprov</artifactId><version>1.78</version></project>"),
    ).toBe("maven");
  });

  it("returns null for unrecognised input rather than guessing", () => {
    expect(detectEcosystem("")).toBeNull();
    expect(detectEcosystem("just some prose")).toBeNull();
  });
});

describe("manifest parsing", () => {
  it("reads npm dependencies, dev dependencies and nested node_modules keys", () => {
    const packages = parseManifest(
      '{"lockfileVersion":3,"packages":{"":{"name":"root"},"node_modules/jsonwebtoken":{"version":"9.0.2"},"node_modules/@scope/thing":{"version":"1.0.0"}},"devDependencies":{"vitest":"^3.2.7"}}',
      "npm",
    );
    const names = packages.map((entry) => entry.name).sort();
    expect(names).toContain("jsonwebtoken");
    expect(names).toContain("@scope/thing");
    expect(names).toContain("vitest");
    expect(packages.find((entry) => entry.name === "jsonwebtoken")?.version).toBe("9.0.2");
  });

  it("reads pinned, ranged and commented pypi requirements", () => {
    const packages = parseManifest(REQUIREMENTS, "pypi");
    expect(packages).toHaveLength(4);
    expect(packages.find((entry) => entry.name === "pycryptodome")?.version).toBe("3.19.0");
    expect(packages.some((entry) => entry.name === "urllib3")).toBe(true);
  });

  it("reads go.mod blocks and single-line requires, including indirect ones", () => {
    const packages = parseManifest(GO_MOD, "go");
    const names = packages.map((entry) => entry.name);
    expect(names).toContain("github.com/cloudflare/circl");
    expect(names).toContain("golang.org/x/crypto");
    expect(names).toContain("github.com/stretchr/testify");
  });

  it("reads Cargo.lock packages", () => {
    const packages = parseManifest('[[package]]\nname = "x25519-dalek"\nversion = "2.0.1"\n\n[[package]]\nname = "rsa"\nversion = "0.9.6"\n', "crates.io");
    expect(packages.map((entry) => entry.name)).toEqual(["x25519-dalek", "rsa"]);
  });

  it("reads maven group and artifact ids", () => {
    const packages = parseManifest(
      "<project><dependencies><dependency><groupId>org.bouncycastle</groupId><artifactId>bcprov</artifactId><version>1.78.1</version></dependency></dependencies></project>",
      "maven",
    );
    expect(packages[0].name).toBe("org.bouncycastle:bcprov");
    expect(packages[0].version).toBe("1.78.1");
  });

  it("returns nothing for a malformed payload instead of throwing", () => {
    expect(parseManifest("{not json", "npm")).toEqual([]);
    expect(parseManifest("", "pypi")).toEqual([]);
  });
});

describe("source scanning", () => {
  it("finds a hash, a legacy cipher and a non-cryptographic PRNG feeding a secret", () => {
    const hits = scanSource(SAMPLE_SOURCE);
    const ids = hits.map((hit) => hit.primitive);
    expect(ids).toContain("md5");
    expect(ids).toContain("triple-des");
    expect(ids).toContain("rsa-2048");
    expect(ids).toContain("hmac-sha256");
    expect(ids).toContain("math-random");
    expect(ids).toContain("ecdh-p256");
  });

  it("reports the line numbers it matched", () => {
    const hits = scanSource("const a = 1;\nconst h = crypto.createHash('md5');\n");
    const md5 = hits.find((hit) => hit.primitive === "md5")!;
    expect(md5.lines).toEqual([2]);
    expect(md5.samples[0]).toContain("md5");
  });

  it("ignores Math.random when it is not feeding a secret", () => {
    const hits = scanSource("const jitter = Math.random() * 0.1;");
    expect(hits.map((hit) => hit.primitive)).not.toContain("math-random");
  });

  it("finds Math.random when a nonce is derived from it", () => {
    const hits = scanSource("const nonce = Math.random().toString(36);");
    expect(hits.map((hit) => hit.primitive)).toContain("math-random");
  });

  it("collapses repeated occurrences of one primitive into a single hit", () => {
    const hits = scanSource(Array.from({ length: 40 }, () => "crypto.createHash('md5')").join("\n"));
    expect(hits.filter((hit) => hit.primitive === "md5")).toHaveLength(1);
  });

  it("returns nothing for an empty or unrelated file", () => {
    expect(scanSource("")).toEqual([]);
    expect(scanSource("const total = price * quantity;")).toEqual([]);
  });

  it("skips absurdly long lines rather than stalling on minified code", () => {
    const hits = scanSource(`const x = "a".repeat(0);${"/*".repeat(400)}`);
    expect(Array.isArray(hits)).toBe(true);
  });
});

describe("extractSurfaces", () => {
  it("combines dependency hints with source hits and reports what it scanned", () => {
    const result = extractSurfaces({ manifest: SAMPLE_MANIFEST, source: SAMPLE_SOURCE, name: "test" });
    expect(result.ecosystem).toBe("npm");
    expect(result.packagesScanned).toBeGreaterThan(0);
    expect(result.cryptoPackages).toBeGreaterThan(0);
    expect(result.surfaces.length).toBeGreaterThan(0);
    expect(result.surfaces.some((entry) => entry.origin === "dependency")).toBe(true);
    expect(result.surfaces.some((entry) => entry.origin === "source-scan")).toBe(true);
  });

  it("carries evidence on every surface", () => {
    const result = extractSurfaces({ manifest: SAMPLE_MANIFEST, source: SAMPLE_SOURCE, name: "test" });
    for (const entry of result.surfaces) {
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.location.length).toBeGreaterThan(0);
      expect(entry.shelfLifeYears).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every surface a shelf life that matches its role", () => {
    const result = extractSurfaces({ manifest: SAMPLE_MANIFEST, source: SAMPLE_SOURCE, name: "test" });
    for (const entry of result.surfaces) {
      expect(entry.shelfLifeYears).toBe(shelfLifeFor(entry.usage));
    }
  });

  it("is deterministic", () => {
    const first = JSON.stringify(extractSurfaces({ manifest: SAMPLE_MANIFEST, source: SAMPLE_SOURCE, name: "t" }));
    const second = JSON.stringify(extractSurfaces({ manifest: SAMPLE_MANIFEST, source: SAMPLE_SOURCE, name: "t" }));
    expect(first).toBe(second);
  });

  it("produces nothing from empty input without throwing", () => {
    const result = extractSurfaces({ manifest: "", source: "", name: "t" });
    expect(result.ecosystem).toBeNull();
    expect(result.surfaces).toEqual([]);
    expect(result.packagesScanned).toBe(0);
  });

  it("works from source alone when no manifest is supplied", () => {
    const result = extractSurfaces({ manifest: "", source: "jwt.sign(p, s, { algorithm: 'RS256' })", name: "t" });
    expect(result.ecosystem).toBeNull();
    expect(result.surfaces.some((entry) => entry.primitive === "rsa-sign-2048")).toBe(true);
  });

  it("caps the surface list and says so", () => {
    const noisy = Array.from({ length: 400 }, (_, index) => `const v${index} = crypto.createHash('md5');`).join("\n");
    const result = extractSurfaces({ manifest: "", source: noisy, name: "t" });
    expect(result.surfaces.length).toBeLessThanOrEqual(MAX_SURFACES);
  });
});