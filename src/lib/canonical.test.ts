import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "./canonical";

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("produces byte-equal output regardless of key insertion order", () => {
    const first = canonicalJson({ z: [1, 2], a: { y: "x", x: "y" } });
    const second = canonicalJson({ a: { x: "y", y: "x" }, z: [1, 2] });
    expect(first).toBe(second);
  });

  it("preserves array order, because order is meaningful", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it("drops undefined properties but keeps nulls", () => {
    expect(canonicalJson({ a: undefined, b: null, c: 1 })).toBe('{"b":null,"c":1}');
  });

  it("normalises non-finite numbers to null instead of throwing", () => {
    expect(canonicalJson({ a: NaN, b: Infinity, c: -Infinity })).toBe('{"a":null,"b":null,"c":null}');
  });

  it("escapes strings the way JSON does", () => {
    expect(canonicalJson({ s: 'quote " and \\ and \n newline' })).toBe(
      '{"s":"quote \\" and \\\\ and \\n newline"}',
    );
  });

  it("is stable across repeated calls with deeply nested input", () => {
    const value = { list: [{ b: 1, a: 2 }, { d: { f: 4, e: 5 } }], top: "x" };
    const once = canonicalJson(value);
    for (let i = 0; i < 25; i += 1) {
      expect(canonicalJson(JSON.parse(JSON.stringify(value)))).toBe(once);
    }
  });

  it("handles an empty object and an empty array", () => {
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });
});

describe("sha256Hex", () => {
  it("matches the published digest of the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});