import type { AppConfig } from "../src/config.js";

export function createTestConfig(): AppConfig {
  return {
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 0,
    bodyLimitBytes: 16 * 1024 * 1024,
    version: "test-version"
  };
}
