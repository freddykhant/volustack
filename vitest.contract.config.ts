import { configDefaults, defineConfig } from "vitest/config";
import base from "./vitest.config";

// The contract tests make real, billed calls, so the default config excludes them. This
// config collects only them, with the same aliases and setup files. It is built by
// spreading the base config: `mergeConfig` concatenates arrays, which would keep the
// base `exclude` and so still leave both files out. Run through `pnpm test:contract`
// and `pnpm test:coach-contract`, which each name one file.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["src/server/**/contract.test.ts"],
    exclude: [...configDefaults.exclude],
  },
});
