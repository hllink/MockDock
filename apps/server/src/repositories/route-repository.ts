import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type {
  HttpMethod,
  ResponsePresetDto,
  RoutePatternDto,
  RouteSummaryDto
} from "@mockdock/shared";
import { stringifyNormalizedQuery, type NormalizedQuery, type RouteResponseVariantDto } from "@mockdock/shared";
import { compareRoutePatterns, isValidRoutePattern, matchRoutePattern } from "@mockdock/route-inference";

import type { DatabaseClient } from "../db/client.js";
import {
  requestLogs,
  responsePresets,
  routePatterns,
  routeResponseVariants,
  workspaceSettings,
  workspaces
} from "../db/schema.js";
import { createId } from "../lib/id.js";
import { safeJsonParse } from "../lib/json.js";
import { inferResponsePayload } from "../lib/response-payload.js";
import { nowIso } from "../lib/time.js";
import { RouteResponseVariantRepository } from "./route-response-variant-repository.js";

export class RouteMoveConflictError extends Error {
  readonly statusCode = 409;
}

export class RouteMoveNotFoundError extends Error {
  readonly statusCode = 404;
}

export class RouteDeleteNotFoundError extends Error {
  readonly statusCode = 404;
}

export class RoutePatternValidationError extends Error {
  readonly statusCode = 400;
}

export class RoutePatternConflictError extends Error {
  readonly statusCode = 409;
}

export class RouteRepository {
  private readonly variants: RouteResponseVariantRepository;

  constructor(private readonly client: DatabaseClient) {
    this.variants = new RouteResponseVariantRepository(client);
  }

  async findOrCreate(params: {
    workspaceId: string;
    method: HttpMethod;
    pattern: string;
    examplePath: string;
  }): Promise<RoutePatternDto> {
    const existing = await this.client.db
      .select()
      .from(routePatterns)
      .where(
        and(
          eq(routePatterns.workspaceId, params.workspaceId),
          eq(routePatterns.method, params.method),
          eq(routePatterns.pattern, params.pattern)
        )
      )
      .get();

    if (existing) {
      const updatedAt = nowIso();
      await this.client.db
        .update(routePatterns)
        .set({
          examplePath: params.examplePath,
          hitCount: existing.hitCount + 1,
          lastSeenAt: updatedAt,
          updatedAt
        })
        .where(eq(routePatterns.id, existing.id))
        .run();

      await this.variants.ensureDefaultVariant(existing.id);
      return this.mapRoute({
        ...existing,
        examplePath: params.examplePath,
        hitCount: existing.hitCount + 1,
        lastSeenAt: updatedAt,
        updatedAt
      });
    }

    const now = nowIso();
    const routeId = createId();

    await this.client.db
      .insert(routePatterns)
      .values({
        id: routeId,
        workspaceId: params.workspaceId,
        method: params.method,
        pattern: params.pattern,
        examplePath: params.examplePath,
        state: "active",
        hitCount: 1,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now
      })
      .run();

    await this.variants.ensureDefaultVariant(routeId);

    return {
      id: routeId,
      workspaceId: params.workspaceId,
      method: params.method,
      pattern: params.pattern,
      examplePath: params.examplePath,
      hitCount: 1,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now
    };
  }

  async createManual(params: {
    workspaceId: string;
    method: HttpMethod;
    pattern: string;
    examplePath?: string;
  }): Promise<{ route: RoutePatternDto; created: boolean }> {
    if (!isValidRoutePattern(params.pattern)) {
      throw new RoutePatternValidationError("Route pattern is invalid");
    }

    const existing = await this.client.db
      .select()
      .from(routePatterns)
      .where(
        and(
          eq(routePatterns.workspaceId, params.workspaceId),
          eq(routePatterns.method, params.method),
          eq(routePatterns.pattern, params.pattern)
        )
      )
      .get();

    if (existing) {
      await this.variants.ensureDefaultVariant(existing.id);
      return {
        route: this.mapRoute(existing),
        created: false
      };
    }

    const now = nowIso();
    const routeId = createId();
    const examplePath = params.examplePath ?? params.pattern;

    await this.client.db
      .insert(routePatterns)
      .values({
        id: routeId,
        workspaceId: params.workspaceId,
        method: params.method,
        pattern: params.pattern,
        examplePath,
        state: "active",
        hitCount: 0,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now
      })
      .run();

    await this.variants.ensureDefaultVariant(routeId);

    return {
      route: {
        id: routeId,
        workspaceId: params.workspaceId,
        method: params.method,
        pattern: params.pattern,
        examplePath,
        hitCount: 0,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now
      },
      created: true
    };
  }

  async listByWorkspaceAndMethod(workspaceId: string, method: HttpMethod): Promise<RoutePatternDto[]> {
    const rows = await this.client.db
      .select()
      .from(routePatterns)
      .where(and(eq(routePatterns.workspaceId, workspaceId), eq(routePatterns.method, method)))
      .all();

    return rows.map((row) => this.mapRoute(row));
  }

  async listMatchingRoutes(
    workspaceId: string,
    method: HttpMethod,
    normalizedPath: string
  ): Promise<RoutePatternDto[]> {
    const routes = await this.listByWorkspaceAndMethod(workspaceId, method);
    return routes
      .filter((route) => matchRoutePattern(route.pattern, normalizedPath))
      .sort((left, right) => compareRoutePatterns(left.pattern, right.pattern));
  }

  async findMatchingRoutes(params: {
    workspaceId: string;
    method: HttpMethod;
    normalizedPath: string;
  }): Promise<RoutePatternDto[]> {
    return this.listMatchingRoutes(params.workspaceId, params.method, params.normalizedPath);
  }

  async getWorkspaceRoutes(workspaceId: string): Promise<RouteSummaryDto[]> {
    const rows = await this.client.db
      .select()
      .from(routePatterns)
      .where(eq(routePatterns.workspaceId, workspaceId))
      .orderBy(desc(routePatterns.lastSeenAt))
      .all();

    return Promise.all(
      rows.map(async (row) => {
        const route = this.mapRoute(row);
        const defaultVariant = await this.variants.ensureDefaultVariant(route.id);
        const activePreset = defaultVariant.activeResponsePresetId
          ? await this.getPreset(defaultVariant.activeResponsePresetId)
          : null;

        return {
          route,
          defaultVariant,
          activePreset
        };
      })
    );
  }

  async getById(routeId: string): Promise<RoutePatternDto | null> {
    const row = await this.client.db
      .select()
      .from(routePatterns)
      .where(eq(routePatterns.id, routeId))
      .get();

    return row ? this.mapRoute(row) : null;
  }

  async getDefaultVariant(routeId: string): Promise<RouteResponseVariantDto | null> {
    return this.variants.getDefaultByRoute(routeId);
  }

  async touchRoute(routeId: string): Promise<RoutePatternDto | null> {
    const route = await this.getById(routeId);
    if (!route) {
      return null;
    }

    const updatedAt = nowIso();
    await this.client.db
      .update(routePatterns)
      .set({
        hitCount: route.hitCount + 1,
        lastSeenAt: updatedAt,
        updatedAt
      })
      .where(eq(routePatterns.id, routeId))
      .run();

    return {
      ...route,
      hitCount: route.hitCount + 1,
      lastSeenAt: updatedAt,
      updatedAt
    };
  }

  async findVariantByRouteAndQuery(
    routeId: string,
    query: NormalizedQuery
  ): Promise<RouteResponseVariantDto | null> {
    const variants = await this.variants.listByRoute(routeId);
    const querySignature = stringifyNormalizedQuery(query);
    return (
      variants.find((variant) => stringifyNormalizedQuery(variant.querySignature) === querySignature) ??
      null
    );
  }

  async updatePattern(input: {
    routeId: string;
    pattern: string;
    examplePath?: string;
  }): Promise<RoutePatternDto>;
  async updatePattern(routeId: string, pattern: string): Promise<RoutePatternDto>;
  async updatePattern(
    routeIdOrInput: string | { routeId: string; pattern: string; examplePath?: string },
    pattern?: string
  ): Promise<RoutePatternDto> {
    if (typeof routeIdOrInput === "string") {
      return this.updatePatternInternal(routeIdOrInput, pattern ?? "");
    }

    return this.updatePatternInternal(
      routeIdOrInput.routeId,
      routeIdOrInput.pattern,
      routeIdOrInput.examplePath
    );
  }

  async replacePatternSegment(input: {
    routeId: string;
    index: number;
    value: string;
  }): Promise<RoutePatternDto> {
    const route = await this.getById(input.routeId);
    if (!route) {
      throw new RouteMoveNotFoundError("Route not found");
    }

    const segments = route.pattern === "/" ? [] : route.pattern.split("/").filter(Boolean);
    if (input.index < 0 || input.index >= segments.length) {
      throw new RoutePatternValidationError("Route segment index is out of bounds");
    }

    segments[input.index] = input.value;
    return this.updatePatternInternal(input.routeId, segments.length > 0 ? `/${segments.join("/")}` : "/");
  }

  async getVariants(routeId: string): Promise<RouteResponseVariantDto[]> {
    return this.variants.listByRoute(routeId);
  }

  async getVariantById(variantId: string): Promise<RouteResponseVariantDto | null> {
    return this.variants.getById(variantId);
  }

  async createVariant(input: {
    routePatternId: string;
    querySignature: NormalizedQuery | null;
    queryDisplay?: string;
  }): Promise<RouteResponseVariantDto> {
    return this.variants.create(input.routePatternId, {
      querySignature: input.querySignature,
      queryDisplay: input.queryDisplay
    });
  }

  async updateVariant(input: {
    variantId: string;
    querySignature: NormalizedQuery | null;
    queryDisplay?: string;
  }): Promise<RouteResponseVariantDto | null> {
    return this.variants.update(input.variantId, {
      querySignature: input.querySignature,
      queryDisplay: input.queryDisplay
    });
  }

  async deleteVariant(variantId: string): Promise<RouteResponseVariantDto | null> {
    return this.variants.delete(variantId);
  }

  async setActivePresetForVariant(variantId: string, presetId: string | null): Promise<void> {
    await this.variants.setActivePreset(variantId, presetId);
  }

  async listMatchedRoutes(routeId: string): Promise<RoutePatternDto[]> {
    const anchorRoute = await this.getById(routeId);
    if (!anchorRoute) {
      return [];
    }

    const routes = await this.listByWorkspaceAndMethod(anchorRoute.workspaceId, anchorRoute.method);
    return routes.filter((route) => matchRoutePattern(anchorRoute.pattern, route.examplePath));
  }

  private async updatePatternInternal(
    routeId: string,
    pattern: string,
    examplePath?: string
  ): Promise<RoutePatternDto> {
    if (!isValidRoutePattern(pattern)) {
      throw new RoutePatternValidationError("Route pattern is invalid");
    }

    const route = await this.getById(routeId);
    if (!route) {
      throw new RouteMoveNotFoundError("Route not found");
    }

    await this.assertPatternConflict(this.client.db, route, pattern);

    const updatedAt = nowIso();
    await this.client.db
      .update(routePatterns)
      .set({
        pattern,
        examplePath: examplePath ?? route.examplePath,
        updatedAt
      })
      .where(eq(routePatterns.id, routeId))
      .run();

    return {
      ...route,
      pattern,
      examplePath: examplePath ?? route.examplePath,
      updatedAt
    };
  }

  async move(routeId: string, destinationWorkspaceId: string): Promise<RoutePatternDto> {
    return this.client.db.transaction(async (tx) => {
      const route = await tx.select().from(routePatterns).where(eq(routePatterns.id, routeId)).get();
      if (!route) {
        throw new RouteMoveNotFoundError("Route not found");
      }

      const destinationWorkspace = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, destinationWorkspaceId))
        .get();
      if (!destinationWorkspace) {
        throw new RouteMoveNotFoundError("Workspace not found");
      }

      const conflictingRoute = await tx
        .select({ id: routePatterns.id })
        .from(routePatterns)
        .where(
          and(
            eq(routePatterns.workspaceId, destinationWorkspaceId),
            eq(routePatterns.method, route.method),
            eq(routePatterns.pattern, route.pattern)
          )
        )
        .get();

      if (conflictingRoute && conflictingRoute.id !== route.id) {
        throw new RouteMoveConflictError("Route already exists in destination workspace");
      }

      const updatedAt = nowIso();
      await tx
        .update(routePatterns)
        .set({
          workspaceId: destinationWorkspaceId,
          updatedAt
        })
        .where(eq(routePatterns.id, route.id))
        .run();

      await tx
        .update(requestLogs)
        .set({
          workspaceId: destinationWorkspaceId
        })
        .where(eq(requestLogs.routePatternId, route.id))
        .run();

      const remainingRouteCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(routePatterns)
        .where(eq(routePatterns.workspaceId, route.workspaceId))
        .get();

      if ((remainingRouteCount?.count ?? 0) === 0) {
        await tx.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, route.workspaceId)).run();
        await tx.delete(workspaces).where(eq(workspaces.id, route.workspaceId)).run();
      }

      return this.mapRoute({
        ...route,
        workspaceId: destinationWorkspaceId,
        updatedAt
      });
    });
  }

  async delete(routeId: string): Promise<RoutePatternDto> {
    return this.client.db.transaction(async (tx) => {
      const route = await tx.select().from(routePatterns).where(eq(routePatterns.id, routeId)).get();
      if (!route) {
        throw new RouteDeleteNotFoundError("Route not found");
      }

      const variantRows = await tx
        .select({ id: routeResponseVariants.id })
        .from(routeResponseVariants)
        .where(eq(routeResponseVariants.routePatternId, route.id))
        .all();
      const variantIds = variantRows.map((variant) => variant.id);

      await tx.delete(requestLogs).where(eq(requestLogs.routePatternId, route.id)).run();
      if (variantIds.length > 0) {
        await tx.delete(responsePresets).where(inArray(responsePresets.routeResponseVariantId, variantIds)).run();
      }
      await tx.delete(routeResponseVariants).where(eq(routeResponseVariants.routePatternId, route.id)).run();
      await tx.delete(routePatterns).where(eq(routePatterns.id, route.id)).run();

      const remainingRouteCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(routePatterns)
        .where(eq(routePatterns.workspaceId, route.workspaceId))
        .get();

      if ((remainingRouteCount?.count ?? 0) === 0) {
        await tx.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, route.workspaceId)).run();
        await tx.delete(workspaces).where(eq(workspaces.id, route.workspaceId)).run();
      }

      return this.mapRoute(route);
    });
  }

  async bulkDelete(routeIds: string[]): Promise<{ deletedRouteIds: string[]; deletedWorkspaceIds: string[] }> {
    const uniqueRouteIds = [...new Set(routeIds.filter((routeId) => routeId.trim().length > 0))];
    if (uniqueRouteIds.length === 0) {
      return { deletedRouteIds: [], deletedWorkspaceIds: [] };
    }

    return this.client.db.transaction(async (tx) => {
      const routes = await tx
        .select()
        .from(routePatterns)
        .where(inArray(routePatterns.id, uniqueRouteIds))
        .all();
      if (routes.length === 0) {
        return { deletedRouteIds: [], deletedWorkspaceIds: [] };
      }

      const deletedRouteIds = routes.map((route) => route.id);
      const affectedWorkspaceIds = [...new Set(routes.map((route) => route.workspaceId))];
      const variantRows = await tx
        .select({ id: routeResponseVariants.id })
        .from(routeResponseVariants)
        .where(inArray(routeResponseVariants.routePatternId, deletedRouteIds))
        .all();
      const variantIds = variantRows.map((variant) => variant.id);

      await tx.delete(requestLogs).where(inArray(requestLogs.routePatternId, deletedRouteIds)).run();
      if (variantIds.length > 0) {
        await tx.delete(responsePresets).where(inArray(responsePresets.routeResponseVariantId, variantIds)).run();
      }
      await tx.delete(routeResponseVariants).where(inArray(routeResponseVariants.routePatternId, deletedRouteIds)).run();
      await tx.delete(routePatterns).where(inArray(routePatterns.id, deletedRouteIds)).run();

      const deletedWorkspaceIds: string[] = [];
      for (const workspaceId of affectedWorkspaceIds) {
        const remainingRouteCount = await tx
          .select({ count: sql<number>`count(*)` })
          .from(routePatterns)
          .where(eq(routePatterns.workspaceId, workspaceId))
          .get();

        if ((remainingRouteCount?.count ?? 0) === 0) {
          await tx.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)).run();
          await tx.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
          deletedWorkspaceIds.push(workspaceId);
        }
      }

      return { deletedRouteIds, deletedWorkspaceIds };
    });
  }

  private async assertPatternConflict(
    db: Pick<DatabaseClient["db"], "select">,
    route: RoutePatternDto,
    pattern: string
  ): Promise<void> {
    const conflict = await this.findConflictingRoute(db, route, pattern);
    if (conflict && conflict.id !== route.id) {
      throw new RoutePatternConflictError("Route pattern already exists");
    }
  }

  private async findConflictingRoute(
    db: Pick<DatabaseClient["db"], "select">,
    route: RoutePatternDto,
    pattern: string
  ): Promise<RoutePatternDto | null> {
    const conflict = await db
      .select()
      .from(routePatterns)
      .where(
        and(
          eq(routePatterns.workspaceId, route.workspaceId),
          eq(routePatterns.method, route.method),
          eq(routePatterns.pattern, pattern)
        )
      )
      .get();

    return conflict ? this.mapRoute(conflict) : null;
  }

  private async getPreset(presetId: string): Promise<ResponsePresetDto | null> {
    const preset = await this.client.db
      .select()
      .from(responsePresets)
      .where(eq(responsePresets.id, presetId))
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

  private mapRoute(row: typeof routePatterns.$inferSelect): RoutePatternDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      method: row.method as HttpMethod,
      pattern: row.pattern,
      examplePath: row.examplePath,
      hitCount: row.hitCount,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
