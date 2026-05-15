import { asc, eq } from "drizzle-orm";

import type { CreatePresetInput, ResponsePresetDto, UpdatePresetInput } from "@mockdock/shared";

import type { DatabaseClient } from "../db/client.js";
import { responsePresets } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { safeJsonParse, serializeJson } from "../lib/json.js";
import { inferResponsePayload } from "../lib/response-payload.js";
import { nowIso } from "../lib/time.js";

export class PresetRepository {
  constructor(private readonly client: DatabaseClient) {}

  async listByVariant(routeResponseVariantId: string): Promise<ResponsePresetDto[]> {
    const rows = await this.client.db
      .select()
      .from(responsePresets)
      .where(eq(responsePresets.routeResponseVariantId, routeResponseVariantId))
      .orderBy(asc(responsePresets.createdAt))
      .all();

    return rows.map((row) => this.mapRow(row));
  }

  async getById(id: string): Promise<ResponsePresetDto | null> {
    const row = await this.client.db
      .select()
      .from(responsePresets)
      .where(eq(responsePresets.id, id))
      .get();

    return row ? this.mapRow(row) : null;
  }

  async create(
    routeResponseVariantId: string,
    input: CreatePresetInput,
    options: { isSystem?: boolean } = {}
  ): Promise<ResponsePresetDto> {
    const now = nowIso();
    const id = createId();
    const isSystem = options.isSystem ?? false;

    await this.client.db
      .insert(responsePresets)
      .values({
        id,
        routeResponseVariantId,
        isSystem,
        name: input.name,
        statusCode: input.statusCode,
        headers: serializeJson(input.headers),
        body: serializeJson(input.body),
        delayMs: input.delayMs,
        createdAt: now,
        updatedAt: now
      })
      .run();

    return {
      id,
      routeResponseVariantId,
      isSystem,
      name: input.name,
      statusCode: input.statusCode,
      headers: input.headers,
      body: input.body,
      delayMs: input.delayMs,
      createdAt: now,
      updatedAt: now
    };
  }

  async update(id: string, input: UpdatePresetInput): Promise<ResponsePresetDto | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const updatedAt = nowIso();
    await this.client.db
      .update(responsePresets)
      .set({
        name: input.name,
        statusCode: input.statusCode,
        headers: serializeJson(input.headers),
        body: serializeJson(input.body),
        delayMs: input.delayMs,
        updatedAt
      })
      .where(eq(responsePresets.id, id))
      .run();

    return {
      ...existing,
      ...input,
      updatedAt
    };
  }

  async delete(id: string): Promise<ResponsePresetDto | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    await this.client.db.delete(responsePresets).where(eq(responsePresets.id, id)).run();
    return existing;
  }

  private mapRow(row: typeof responsePresets.$inferSelect): ResponsePresetDto {
    const headers = safeJsonParse<Record<string, string>>(row.headers, {});
    const rawBody = safeJsonParse<unknown>(row.body, null);
    return {
      id: row.id,
      routeResponseVariantId: row.routeResponseVariantId,
      isSystem: row.isSystem,
      name: row.name,
      statusCode: row.statusCode,
      headers,
      body: inferResponsePayload(rawBody, headers),
      delayMs: row.delayMs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
