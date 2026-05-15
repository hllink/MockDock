import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema.js";

export interface DatabaseClient {
  close(): Promise<void>;
  db: ReturnType<typeof drizzle<typeof schema>>;
}

export function createDatabaseClient(databasePath: string): DatabaseClient {
  const resolvedDatabasePath =
    databasePath === ":memory:"
      ? path.join(os.tmpdir(), `mockdock-${randomUUID()}.sqlite`)
      : databasePath;

  fs.mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });

  const client = createClient({
    url: `file:${resolvedDatabasePath}`
  });

  return {
    db: drizzle({
      client,
      schema
    }),
    async close() {
      await client.close();
      if (databasePath === ":memory:") {
        fs.rmSync(resolvedDatabasePath, { force: true });
      }
    }
  };
}
