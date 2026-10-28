import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The owner asked that landing and legal copy never read as AI-generated. These are the tells.
const BANNED = [
  /\bseamless/i,
  /\bleverag/i,
  /\bempower/i,
  /\bunlock/i,
  /\belevat/i,
  /\beffortless/i,
  /\brevolution/i,
  /\bjourney\b/i,
  /cutting[- ]edge/i,
  /\brobust\b/i,
  /we value your privacy/i,
  /at mesodapt,? we/i,
  /AI operating system/i,
];

const ROOTS = ["src/app/_components/landing", "src/app/(legal)"];

function sources(dir: string): string[] {
  // (legal) only exists once the privacy and terms pages land; a missing root is simply empty.
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = ROOTS.flatMap(sources);

describe("landing and legal copy", () => {
  it("scans the landing sources", () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it.each(BANNED.map((re) => [re.source, re] as const))("never says %s", (_label, re) => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(re);
  });
});
