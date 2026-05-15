import { and, asc, eq, sql } from "drizzle-orm";

import type {
  CreateRouteResponseVariantInput,
  ResponsePresetDto,
  RouteResponseVariantDto,
  UpdateRouteResponseVariantInput
} from "@mockdock/shared";
import { formatNormalizedQuery, stringifyNormalizedQuery } from "@mockdock/shared";

import type { DatabaseClient } from "../db/client.js";
import { responsePresets, routeResponseVariants } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { safeJsonParse, serializeJson } from "../lib/json.js";
import { inferResponsePayload } from "../lib/response-payload.js";
import { nowIso } from "../lib/time.js";

export class RouteResponseVariantDeleteError extends Error {
  readonly statusCode = 400;
}

export class RouteResponseVariantRepository {
  constructor(private readonly client: DatabaseClient) {}

  async listByRoute(routePatternId: string): Promise<RouteResponseVariantDto[]> {
    const rows = await this.client.db
      .select()
      .from(routeResponseVariants)
      .where(eq(routeResponseVariants.routePatternId, routePatternId))
      .orderBy(asc(routeResponseVariants.createdAt))
      .all();

    return rows.map((row) => this.mapRow(row));
  }

  async listDefaultByRouteIds(routePatternIds: string[]): Promise<Map<string, RouteResponseVariantDto>> {
    const variants = new Map<string, RouteResponseVariantDto>();
    for (const routePatternId of routePatternIds) {
      const variant = await this.getDefaultByRoute(routePatternId);
      if (variant) {
        variants.set(routePatternId, variant);
      }
    }

    return variants;
  }

  async getById(id: string): Promise<RouteResponseVariantDto | null> {
    const row = await this.client.db
      .select()
      .from(routeResponseVariants)
      .where(eq(routeResponseVariants.id, id))
      .get();

    return row ? this.mapRow(row) : null;
  }

  async getDefaultByRoute(routePatternId: string): Promise<RouteResponseVariantDto | null> {
    const row = await this.client.db
      .select()
      .from(routeResponseVariants)
      .where(
        and(
          eq(routeResponseVariants.routePatternId, routePatternId),
          sql`${routeResponseVariants.querySignature} IS NULL`
        )
      )
      .get();

    return row ? this.mapRow(row) : null;
  }

  async ensureDefaultVariant(routePatternId: string): Promise<RouteResponseVariantDto> {
    const existing = await this.getDefaultByRoute(routePatternId);
    if (existing) {
      return existing;
    }

    const now = nowIso();
    const id = createId();
    await this.client.db.insert(routeResponseVariants).values({
      id,
      routePatternId,
      querySignature: null,
      queryDisplay: "Default response",
      activeResponsePresetId: null,
      createdAt: now,
      updatedAt: now
    }).run();

    return {
      id,
      routePatternId,
      querySignature: null,
      queryDisplay: "Default response",
      activeResponsePresetId: null,
      createdAt: now,
      updatedAt: now
    };
  }

  async create(
    routePatternId: string,
    input: CreateRouteResponseVariantInput
  ): Promise<RouteResponseVariantDto> {
    const normalizedSignature = stringifyNormalizedQuery(input.querySignature);
    const existing = await this.client.db
      .select()
      .from(routeResponseVariants)
      .where(
        and(
          eq(routeResponseVariants.routePatternId, routePatternId),
          normalizedSignature === null
            ? sql`${routeResponseVariants.querySignature} IS NULL`
            : eq(routeResponseVariants.querySignature, normalizedSignature)
        )
      )
      .get();

    if (existing) {
      return this.mapRow(existing);
    }

    const now = nowIso();
    const id = createId();
    const queryDisplay =
      input.querySignature === null ? "Default response" : input.queryDisplay || formatNormalizedQuery(input.querySignature);

    await this.client.db.insert(routeResponseVariants).values({
      id,
      routePatternId,
      querySignature: normalizedSignature,
      queryDisplay,
      activeResponsePresetId: null,
      createdAt: now,
      updatedAt: now
    }).run();

    return {
      id,
      routePatternId,
      querySignature: input.querySignature,
      queryDisplay,
      activeResponsePresetId: null,
      createdAt: now,
      updatedAt: now
    };
  }

  async update(id: string, input: UpdateRouteResponseVariantInput): Promise<RouteResponseVariantDto | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const queryDisplay =
      existing.querySignature === null ? "Default response" : input.queryDisplay || existing.queryDisplay;
    const updatedAt = nowIso();
    await this.client.db
      .update(routeResponseVariants)
      .set({
        queryDisplay,
        updatedAt
      })
      .where(eq(routeResponseVariants.id, id))
      .run();

    return {
      ...existing,
      queryDisplay,
      updatedAt
    };
  }

  async setActivePreset(id: string, presetId: string | null): Promise<void> {
    await this.client.db
      .update(routeResponseVariants)
      .set({
        activeResponsePresetId: presetId,
        updatedAt: nowIso()
      })
      .where(eq(routeResponseVariants.id, id))
      .run();
  }

  async delete(id: string): Promise<RouteResponseVariantDto | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    if (existing.querySignature === null) {
      throw new RouteResponseVariantDeleteError("Default route response cannot be deleted");
    }

    await this.client.db.delete(responsePresets).where(eq(responsePresets.routeResponseVariantId, id)).run();
    await this.client.db.delete(routeResponseVariants).where(eq(routeResponseVariants.id, id)).run();
    return existing;
  }

  async getActivePreset(variantId: string): Promise<ResponsePresetDto | null> {
    const variant = await this.getById(variantId);
    if (!variant?.activeResponsePresetId) {
      return null;
    }

    const preset = await this.client.db
      .select()
      .from(responsePresets)
      .where(eq(responsePresets.id, variant.activeResponsePresetId))
      .get();

    if (!preset) {
      return null;
    }

    const headers = safeJsonParse<Record<string, string>>(preset.headers, {});
    return {
      id: preset.id,
      routeResponseVariantId: preset.routeResponseVariantId,
      isSystem: preset.isSystem,
      name: preset.name,
      statusCode: preset.statusCode,
      headers,
      body: inferResponsePayload(safeJsonParse<unknown>(preset.body, null), headers),
      delayMs: preset.delayMs,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt
    };
  }

  private mapRow(row: typeof routeResponseVariants.$inferSelect): RouteResponseVariantDto {
    return {
      id: row.id,
      routePatternId: row.routePatternId,
      querySignature: safeJsonParse(row.querySignature ?? "null", null),
      queryDisplay: row.queryDisplay,
      activeResponsePresetId: row.activeResponsePresetId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
