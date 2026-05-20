import path from "node:path";

import { MOCKDOCK_VERSION } from "./app-version.js";

export interface AppConfig {
  databasePath: string;
  host: string;
  port: number;
  bodyLimitBytes: number;
  version: string;
}

export function getConfig(): AppConfig {
  return {
    databasePath: process.env.MOCKDOCK_DATABASE_PATH ?? path.resolve(process.cwd(), "data/mockdock.sqlite"),
    host: process.env.MOCKDOCK_HOST ?? "0.0.0.0",
    port: Number(process.env.MOCKDOCK_PORT ?? 52052),
    bodyLimitBytes: Number(process.env.MOCKDOCK_BODY_LIMIT_BYTES ?? 16 * 1024 * 1024),
    version: process.env.MOCKDOCK_VERSION ?? MOCKDOCK_VERSION
  };
}
