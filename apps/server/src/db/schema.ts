import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const workspaceSettings = sqliteTable("workspace_settings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().unique(),
  workspaceStrategy: text("workspace_strategy").notNull(),
  defaultStatusCode: integer("default_status_code").notNull(),
  defaultBody: text("default_body").notNull(),
  defaultHeaders: text("default_headers").notNull(),
  captureEnabled: integer("capture_enabled", { mode: "boolean" }).notNull(),
  maxRequestLogs: integer("max_request_logs").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const routePatterns = sqliteTable("route_patterns", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  method: text("method").notNull(),
  pattern: text("pattern").notNull(),
  examplePath: text("example_path").notNull(),
  state: text("state").notNull(),
  archivedByRoutePatternId: text("archived_by_route_pattern_id"),
  hitCount: integer("hit_count").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const routeResponseVariants = sqliteTable("route_response_variants", {
  id: text("id").primaryKey(),
  routePatternId: text("route_pattern_id").notNull(),
  querySignature: text("query_signature"),
  queryDisplay: text("query_display").notNull(),
  activeResponsePresetId: text("active_response_preset_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const requestLogs = sqliteTable("request_logs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  routePatternId: text("route_pattern_id").notNull(),
  method: text("method").notNull(),
  rawPath: text("raw_path").notNull(),
  normalizedPath: text("normalized_path").notNull(),
  query: text("query").notNull(),
  headers: text("headers").notNull(),
  body: text("body").notNull(),
  ip: text("ip").notNull(),
  responseStatusCode: integer("response_status_code").notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: text("created_at").notNull()
});

export const responsePresets = sqliteTable("response_presets", {
  id: text("id").primaryKey(),
  routeResponseVariantId: text("route_response_variant_id").notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull(),
  name: text("name").notNull(),
  statusCode: integer("status_code").notNull(),
  headers: text("headers").notNull(),
  body: text("body").notNull(),
  delayMs: integer("delay_ms").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});
