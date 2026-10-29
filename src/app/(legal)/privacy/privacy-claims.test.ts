import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const page = readFileSync("src/app/(legal)/privacy/page.tsx", "utf8").replace(/\s+/g, " ");

// Better Auth never sweeps expired session rows: the IP and user agent stay until sign-out or account deletion.
it("doesn't claim session records go away after seven days", () => {
  expect(page).not.toMatch(/Sessions expire after seven days of not being used/);
  expect(page).toMatch(/stays until you sign out or delete your account/);
});
