import { sql } from "drizzle-orm";

import type { DatabaseClient } from "./client.js";

export async function bootstrapDatabase(client: DatabaseClient): Promise<void> {
  await client.db.run(sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await client.db.run(sql`
    CREATE TABLE IF NOT EXISTS workspace_settings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE,
      workspace_strategy TEXT NOT NULL,
      default_status_code INTEGER NOT NULL,
      default_body TEXT NOT NULL,
      default_headers TEXT NOT NULL,
      capture_enabled INTEGER NOT NULL,
      max_request_logs INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await client.db.run(sql`
    CREATE TABLE IF NOT EXISTS route_patterns (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      method TEXT NOT NULL,
      pattern TEXT NOT NULL,
      example_path TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'active',
      archived_by_route_pattern_id TEXT,
      hit_count INTEGER NOT NULL,
      last_seen_at TEXT NOT NULL,
      active_response_preset_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, method, pattern)
    )
  `);

  await client.db.run(sql`
    CREATE TABLE IF NOT EXISTS route_response_variants (
      id TEXT PRIMARY KEY,
      route_pattern_id TEXT NOT NULL,
      query_signature TEXT,
      query_display TEXT NOT NULL,
      active_response_preset_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await client.db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_route_response_variants_default
    ON route_response_variants(route_pattern_id)
    WHERE query_signature IS NULL
  `);
  await client.db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_route_response_variants_query
    ON route_response_variants(route_pattern_id, query_signature)
    WHERE query_signature IS NOT NULL
  `);

  await client.db.run(sql`
    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      route_pattern_id TEXT NOT NULL,
      method TEXT NOT NULL,
      raw_path TEXT NOT NULL,
      normalized_path TEXT NOT NULL,
      query TEXT NOT NULL,
      headers TEXT NOT NULL,
      body TEXT NOT NULL,
      ip TEXT NOT NULL,
      response_status_code INTEGER NOT NULL,
      response_body TEXT NOT NULL DEFAULT 'null',
      created_at TEXT NOT NULL
    )
  `);

  await client.db.run(sql`
    CREATE TABLE IF NOT EXISTS response_presets (
      id TEXT PRIMARY KEY,
      route_response_variant_id TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      headers TEXT NOT NULL,
      body TEXT NOT NULL,
      delay_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await client.db.run(sql`
    INSERT INTO route_response_variants (
      id,
      route_pattern_id,
      query_signature,
      query_display,
      active_response_preset_id,
      created_at,
      updated_at
    )
    SELECT
      route_patterns.id || ':default',
      route_patterns.id,
      NULL,
      'Default response',
      route_patterns.active_response_preset_id,
      route_patterns.created_at,
      route_patterns.updated_at
    FROM route_patterns
    LEFT JOIN route_response_variants
      ON route_response_variants.route_pattern_id = route_patterns.id
     AND route_response_variants.query_signature IS NULL
    WHERE route_response_variants.id IS NULL
  `);
}
