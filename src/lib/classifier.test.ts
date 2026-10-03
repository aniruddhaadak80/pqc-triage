import { describe, expect, it } from "vitest";
import { classify, discriminativeTokens, exportWeights, trainModel, tokenize } from "./classifier";
import { CLASS_LABELS, SEED_CORPUS } from "./corpus";

describe("tokenize", () => {
  it("keeps unigrams and bigrams, and drops stop words", () => {
    const tokens = tokenize("createCipheriv aes-256-gcm with the nonce");
    expect(tokens).toContain("createcipheriv");
    expect(tokens).toContain("nonce");
    expect(tokens).not.toContain("the");
    expect(tokens).toContain("createcipheriv_aes-256-gcm");
  });

  it("returns nothing for punctuation-only input", () => {
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("")).toEqual([]);
  });

  it("lowercases and strips punctuation", () => {
    expect(tokenize("SHA-256")).toEqual(["sha-256"]);
  });
});

describe("training", () => {
  it("trains on the seed corpus and reports its size", () => {
    const model = trainModel();
    expect(model.trainedExamples).toBe(SEED_CORPUS.length);
    expect(model.version).toBe("nbc@1.0.0");
  });

  it("covers every declared class", () => {
    const model = trainModel();
    for (const label of CLASS_LABELS) {
      expect(model.labelCounts.get(label) ?? 0).toBeGreaterThan(0);
    }
  });

  it("is deterministic regardless of feedback order", () => {
    const a = trainModel(SEED_CORPUS, [
      { text: "quantum secure transport handshake", label: "kex-public" },
      { text: "aes 256 gcm for the vault", label: "symmetric-cipher" },
    ]);
    const b = trainModel(SEED_CORPUS, [
      { text: "aes 256 gcm for the vault", label: "symmetric-cipher" },
      { text: "quantum secure transport handshake", label: "kex-public" },
    ]);
    expect(JSON.stringify(exportWeights(a))).toBe(JSON.stringify(exportWeights(b)));
  });

  it("ignores an unknown label rather than poisoning the model", () => {
    const model = trainModel(SEED_CORPUS, [{ text: "mystery thing", label: "not-a-label" as never }]);
    expect(model.trainedExamples).toBe(SEED_CORPUS.length);
  });
});

describe("classification", () => {
  const model = trainModel();

  it("picks the right family for an unambiguous example", () => {
    const cases: [string, string][] = [
      ["createHash('md5')", "hash"],
      ["sha256 checksum of the file", "hash"],
      ["jwt with algorithm HS256", "mac"],
      ["aes-256-gcm encryption of the database volume", "symmetric-cipher"],
      ["3des encryption for the legacy protocol", "symmetric-cipher"],
      ["rc4 stream cipher", "stream-cipher"],
      ["chacha20 poly1305 for the tunnel", "stream-cipher"],
      ["rsa key exchange for the tls handshake", "kex-public"],
      ["ecdh prime256v1 shared secret", "kex-public"],
      ["ecdsa p-256 signature on the release", "signature-public"],
      ["ed25519 signature for the artifact", "signature-public"],
      ["bcrypt password hashing", "password-hash"],
      ["pbkdf2 hmac sha256 iteration count", "kdf"],
      ["Math.random for the session token", "rng"],
    ];
    for (const [text, expected] of cases) {
      expect(classify(model, text).family, text).toBe(expected);
    }
  });

  it("returns a probability distribution that sums to one", () => {
    const prediction = classify(model, "createCipheriv('aes-256-gcm', key, iv)");
    const total = prediction.ranked.reduce((sum, entry) => sum + entry.probability, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
    for (const entry of prediction.ranked) {
      expect(entry.probability).toBeGreaterThan(0);
      expect(entry.probability).toBeLessThanOrEqual(1);
    }
  });

  it("sorts the ranking from most to least likely", () => {
    const prediction = classify(model, "hashlib.sha256 for the manifest");
    for (let i = 1; i < prediction.ranked.length; i += 1) {
      expect(prediction.ranked[i - 1].probability).toBeGreaterThanOrEqual(prediction.ranked[i].probability);
    }
  });

  it("is deterministic for the same input", () => {
    const first = JSON.stringify(classify(model, "rsa-2048 key exchange"));
    for (let i = 0; i < 8; i += 1) {
      expect(JSON.stringify(classify(model, "rsa-2048 key exchange"))).toBe(first);
    }
  });

  it("still answers on input it has never seen", () => {
    const prediction = classify(model, "quantum jellyfish interleaving routine");
    expect(prediction.family).toBeTruthy();
    expect(prediction.ranked.length).toBeGreaterThan(0);
  });

  it("handles empty input without throwing", () => {
    const prediction = classify(model, "");
    expect(prediction.ranked.length).toBe(CLASS_LABELS.length);
    expect(prediction.confidence).toBeGreaterThan(0);
  });
});

describe("learning from corrections", () => {
  it("moves a prediction after the user corrects it", () => {
    const base = trainModel();
    const phrase = "brand new widget calibration sheet for the launch page";
    const before = classify(base, phrase);

    const taught = trainModel(SEED_CORPUS, [
      { text: phrase, label: "hash" },
      { text: "calibration widget sheet", label: "hash" },
    ]);
    const after = classify(taught, phrase);

    expect(after.family).toBe("hash");
    expect(before.family).not.toBe("hash");
    expect(taught.trainedExamples).toBe(SEED_CORPUS.length + 2);
  });
});

describe("interpretability", () => {
  it("surfaces tokens that argue for a class over its rivals", () => {
    const model = trainModel();
    const tokens = discriminativeTokens(model, "kex-public", 10);
    expect(tokens.length).toBeGreaterThan(0);
    for (let i = 1; i < tokens.length; i += 1) {
      expect(tokens[i - 1].weight).toBeGreaterThanOrEqual(tokens[i].weight);
    }
    expect(tokens.every((token) => token.family === "kex-public")).toBe(true);
  });

  it("reports discriminative tokens that actually appear in the input", () => {
    const model = trainModel();
    const prediction = classify(model, "jwt.sign with algorithm HS256 over the webhook body");
    const tokens = prediction.topTokens.map((token) => token.token);
    if (tokens.length > 0) {
      const input = tokenize("jwt.sign with algorithm HS256 over the webhook body");
      for (const token of tokens) {
        expect(input).toContain(token);
      }
    }
  });

  it("exports one weight list per class", () => {
    const weights = exportWeights(trainModel(), 4);
    expect(Object.keys(weights).sort()).toEqual([...CLASS_LABELS].sort());
    for (const label of CLASS_LABELS) {
      expect(weights[label].length).toBeGreaterThan(0);
      expect(weights[label].length).toBeLessThanOrEqual(4);
    }
  });

  it("lists the tokens the model actually matched", () => {
    const prediction = classify(trainModel(), "argon2id password hashing with memory cost");
    expect(prediction.matchedTokens.length).toBeGreaterThan(0);
    expect(prediction.matchedTokens).toContain("argon2id");
  });
});