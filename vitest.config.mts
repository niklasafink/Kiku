import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The in-memory Postgres of the server tests needs a while to start when many test files run at once.
  test: { hookTimeout: 60_000 },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
