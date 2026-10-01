import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // prisma/seed/seed.test.ts is a real integration test: twelve sequential
    // upserts against Neon. That is comfortably past Vitest's 5s default, and
    // a cold Neon compute adds several more seconds on the first connection.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      // Under Next.js, the "react-server" export condition resolves this package
      // to its no-op `empty.js`. Vitest runs in plain Node with no such condition,
      // so without this alias any module-level `import "server-only"` throws the
      // instant it is loaded — even for tests that only exercise a module's pure,
      // non-server-dependent exports.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
