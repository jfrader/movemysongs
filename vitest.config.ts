import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    globalSetup: "./tests/global-setup.ts",
    // SQLite test DB: keep DB-touching test files serial.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      TOKEN_ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      APP_URL: "http://127.0.0.1:3000",
    },
  },
});
