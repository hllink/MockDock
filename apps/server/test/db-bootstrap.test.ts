import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { createDatabaseClient } from "../src/db/client.js";
import { bootstrapDatabase } from "../src/db/bootstrap.js";

describe("bootstrapDatabase", () => {
  const clients: Array<ReturnType<typeof createDatabaseClient>> = [];

  afterEach(() => {
    while (clients.length) {
      void clients.pop()?.close();
    }
  });

  it("creates the required sqlite tables on startup", async () => {
    const client = createDatabaseClient(":memory:");
    clients.push(client);

    await bootstrapDatabase(client);

    const result = await client.db.$client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    );
    const tables = result.rows as unknown as Array<{ name: string }>;

    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "workspaces",
        "workspace_settings",
        "route_patterns",
        "request_logs",
        "response_presets"
      ])
    );
  });

  it("keeps the in-memory database visible after a transaction", async () => {
    const client = createDatabaseClient(":memory:");
    clients.push(client);

    await client.db.run(sql`create table test_tx (id text primary key, value text not null)`);
    await client.db.run(sql`insert into test_tx (id, value) values ('1', 'a')`);

    await client.db.transaction(async (tx) => {
      await tx.run(sql`update test_tx set value = 'b' where id = '1'`);
    });

    const result = await client.db.all(sql`select * from test_tx`);
    expect(result).toEqual([{ id: "1", value: "b" }]);
  });
});
