import { createHash } from "node:crypto";

/**
 * Canonical JSON: object keys sorted recursively, arrays preserved in order,
 * numbers serialized through the shortest round-tripping form, and undefined
 * properties dropped. Two structurally equal values always produce byte-equal
 * output, on any platform, which is what makes the seal chain replayable.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const type = typeof value;
  if (type === "number") {
    if (!Number.isFinite(value as number)) return "null";
    return JSON.stringify(value as number);
  }
  if (type === "boolean") return value ? "true" : "false";
  if (type === "string") return JSON.stringify(value as string);
  if (type === "bigint") return JSON.stringify((value as bigint).toString());
  if (type === "undefined") return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item === undefined ? null : item)).join(",")}]`;
  }

  if (type === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const parts = keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`);
    return `{${parts.join(",")}}`;
  }

  return "null";
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}