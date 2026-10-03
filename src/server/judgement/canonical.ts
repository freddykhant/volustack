import { createHash } from "node:crypto";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return value;
}

/** Deterministic JSON: object keys sorted recursively, array order preserved
 * (order is meaningful in our projections). Without this the cache key would
 * depend on property insertion order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
