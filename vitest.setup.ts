import { config } from "dotenv";

// Vitest does not read .env. src/env.js validates DATABASE_URL and the
// BetterAuth keys at import time, so load them before any test file imports
// anything from ~/server.
config({ path: ".env" });
