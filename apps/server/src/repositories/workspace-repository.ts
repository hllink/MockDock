import { eq, inArray, sql } from "drizzle-orm";

import type { WorkspaceDto, WorkspaceSettingsDto } from "@mockdock/shared";

import { createId } from "../lib/id.js";
import { safeJsonParse, serializeJson } from "../lib/json.js";
import { nowIso } from "../lib/time.js";
import type { DatabaseClient } from "../db/client.js";
import {
  requestLogs,
  responsePresets,
  routePatterns,
  routeResponseVariants,
  workspaceSettings,
  workspaces
} from "../db/schema.js";

const DEFAULT_SETTINGS: WorkspaceSettingsDto = {
  workspaceStrategy: "first_path_segment",
  defaultStatusCode: 200,
  defaultBody: { ok: true },
  defaultHeaders: { "content-type": "application/json" },
  captureEnabled: true,
  maxRequestLogs: 5000
};

const WORKSPACE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const RESERVED_WORKSPACE_SLUG = "__mockdock";

export class WorkspaceSlugValidationError extends Error {
  readonly statusCode = 400;
}

export class WorkspaceSlugConflictError extends Error {
  readonly statusCode = 409;
}

export class WorkspaceDeleteNotFoundError extends Error {
  readonly statusCode = 404;
}

function normalizeWorkspaceSlug(slug: string): string {
  const normalizedSlug = slug.trim();

  if (normalizedSlug.length === 0) {
    throw new WorkspaceSlugValidationError("Workspace slug is required");
  }

  if (normalizedSlug !== slug || /\s/.test(normalizedSlug)) {
    throw new WorkspaceSlugValidationError("Workspace slug must not contain spaces");
  }

  if (normalizedSlug !== normalizedSlug.toLowerCase()) {
    throw new WorkspaceSlugValidationError("Workspace slug must be lowercase");
  }

  if (!WORKSPACE_SLUG_PATTERN.test(normalizedSlug)) {
    throw new WorkspaceSlugValidationError("Workspace slug must be URL-path-safe");
  }

  if (normalizedSlug === RESERVED_WORKSPACE_SLUG) {
    throw new WorkspaceSlugValidationError("Workspace slug is reserved");
  }

  return normalizedSlug;
}

export class WorkspaceRepository {
  constructor(private readonly client: DatabaseClient) {}

  async list(): Promise<Array<WorkspaceDto & { settings: WorkspaceSettingsDto }>> {
    const rows = await this.client.db
      .select()
      .from(workspaces)
      .leftJoin(workspaceSettings, eq(workspaces.id, workspaceSettings.workspaceId))
      .all();

    return rows.map(({ workspaces: workspace, workspace_settings: settings }) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      settings: settings
        ? {
            workspaceStrategy: settings.workspaceStrategy as "first_path_segment",
            defaultStatusCode: settings.defaultStatusCode,
            defaultBody: safeJsonParse(settings.defaultBody, { ok: true }),
            defaultHeaders: safeJsonParse(settings.defaultHeaders, DEFAULT_SETTINGS.defaultHeaders),
            captureEnabled: settings.captureEnabled,
            maxRequestLogs: settings.maxRequestLogs
          }
        : DEFAULT_SETTINGS
    }));
  }

  async findBySlug(slug: string): Promise<(WorkspaceDto & { settings: WorkspaceSettingsDto }) | null> {
    const row = await this.client.db
      .select()
      .from(workspaces)
      .leftJoin(workspaceSettings, eq(workspaces.id, workspaceSettings.workspaceId))
      .where(eq(workspaces.slug, slug))
      .get();

    if (!row) {
      return null;
    }

    return {
      id: row.workspaces.id,
      name: row.workspaces.name,
      slug: row.workspaces.slug,
      createdAt: row.workspaces.createdAt,
      updatedAt: row.workspaces.updatedAt,
      settings: row.workspace_settings
        ? {
            workspaceStrategy: row.workspace_settings.workspaceStrategy as "first_path_segment",
            defaultStatusCode: row.workspace_settings.defaultStatusCode,
            defaultBody: safeJsonParse(row.workspace_settings.defaultBody, { ok: true }),
            defaultHeaders: safeJsonParse(row.workspace_settings.defaultHeaders, DEFAULT_SETTINGS.defaultHeaders),
            captureEnabled: row.workspace_settings.captureEnabled,
            maxRequestLogs: row.workspace_settings.maxRequestLogs
          }
        : DEFAULT_SETTINGS
    };
  }

  async findById(id: string): Promise<(WorkspaceDto & { settings: WorkspaceSettingsDto }) | null> {
    const row = await this.client.db
      .select()
      .from(workspaces)
      .leftJoin(workspaceSettings, eq(workspaces.id, workspaceSettings.workspaceId))
      .where(eq(workspaces.id, id))
      .get();

    if (!row) {
      return null;
    }

    return {
      id: row.workspaces.id,
      name: row.workspaces.name,
      slug: row.workspaces.slug,
      createdAt: row.workspaces.createdAt,
      updatedAt: row.workspaces.updatedAt,
      settings: row.workspace_settings
        ? {
            workspaceStrategy: row.workspace_settings.workspaceStrategy as "first_path_segment",
            defaultStatusCode: row.workspace_settings.defaultStatusCode,
            defaultBody: safeJsonParse(row.workspace_settings.defaultBody, { ok: true }),
            defaultHeaders: safeJsonParse(row.workspace_settings.defaultHeaders, DEFAULT_SETTINGS.defaultHeaders),
            captureEnabled: row.workspace_settings.captureEnabled,
            maxRequestLogs: row.workspace_settings.maxRequestLogs
          }
        : DEFAULT_SETTINGS
    };
  }

  async create(input: { name: string; slug: string }): Promise<WorkspaceDto & { settings: WorkspaceSettingsDto }> {
    const slug = normalizeWorkspaceSlug(input.slug);
    const existing = await this.findBySlug(slug);
    if (existing) {
      return existing;
    }

    const now = nowIso();
    const workspaceId = createId();
    const settingsId = createId();

    await this.client.db.insert(workspaces).values({
      id: workspaceId,
      name: input.name,
      slug,
      createdAt: now,
      updatedAt: now
    }).run();

    await this.client.db.insert(workspaceSettings).values({
      id: settingsId,
      workspaceId,
      workspaceStrategy: DEFAULT_SETTINGS.workspaceStrategy,
      defaultStatusCode: DEFAULT_SETTINGS.defaultStatusCode,
      defaultBody: serializeJson(DEFAULT_SETTINGS.defaultBody),
      defaultHeaders: serializeJson(DEFAULT_SETTINGS.defaultHeaders),
      captureEnabled: DEFAULT_SETTINGS.captureEnabled,
      maxRequestLogs: DEFAULT_SETTINGS.maxRequestLogs,
      createdAt: now,
      updatedAt: now
    }).run();

    return {
      id: workspaceId,
      name: input.name,
      slug,
      createdAt: now,
      updatedAt: now,
      settings: DEFAULT_SETTINGS
    };
  }

  async rename(id: string, nextSlug: string): Promise<(WorkspaceDto & { settings: WorkspaceSettingsDto }) | null> {
    const workspace = await this.findById(id);
    if (!workspace) {
      return null;
    }

    const slug = normalizeWorkspaceSlug(nextSlug);
    if (slug !== workspace.slug) {
      const existing = await this.findBySlug(slug);
      if (existing && existing.id !== workspace.id) {
        throw new WorkspaceSlugConflictError("Workspace slug already exists");
      }
    }

    const updatedAt = nowIso();
    const nextName = workspace.name === workspace.slug ? slug : workspace.name;
    await this.client.db
      .update(workspaces)
      .set({
        name: nextName,
        slug,
        updatedAt
      })
      .where(eq(workspaces.id, id))
      .run();

    return {
      ...workspace,
      name: nextName,
      slug,
      updatedAt
    };
  }

  async deleteIfEmpty(id: string): Promise<boolean> {
    const routeCount = await this.client.db
      .select({ count: sql<number>`count(*)` })
      .from(routePatterns)
      .where(eq(routePatterns.workspaceId, id))
      .get();

    if ((routeCount?.count ?? 0) > 0) {
      return false;
    }

    await this.client.db.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, id)).run();
    const result = await this.client.db.delete(workspaces).where(eq(workspaces.id, id)).run();
    return (result.rowsAffected ?? 0) > 0;
  }

  async delete(id: string): Promise<WorkspaceDto> {
    return this.client.db.transaction(async (tx) => {
      const workspace = await tx.select().from(workspaces).where(eq(workspaces.id, id)).get();
      if (!workspace) {
        throw new WorkspaceDeleteNotFoundError("Workspace not found");
      }

      const routeRows = await tx
        .select({ id: routePatterns.id })
        .from(routePatterns)
        .where(eq(routePatterns.workspaceId, id))
        .all();
      const routeIds = routeRows.map((route) => route.id);

      if (routeIds.length > 0) {
        const variantRows = await tx
          .select({ id: routeResponseVariants.id })
          .from(routeResponseVariants)
          .where(inArray(routeResponseVariants.routePatternId, routeIds))
          .all();
        const variantIds = variantRows.map((variant) => variant.id);

        await tx.delete(requestLogs).where(eq(requestLogs.workspaceId, id)).run();
        if (variantIds.length > 0) {
          await tx.delete(responsePresets).where(inArray(responsePresets.routeResponseVariantId, variantIds)).run();
        }
        await tx.delete(routeResponseVariants).where(inArray(routeResponseVariants.routePatternId, routeIds)).run();
        await tx.delete(routePatterns).where(inArray(routePatterns.id, routeIds)).run();
      } else {
        await tx.delete(requestLogs).where(eq(requestLogs.workspaceId, id)).run();
      }

      await tx.delete(workspaceSettings).where(eq(workspaceSettings.workspaceId, id)).run();
      await tx.delete(workspaces).where(eq(workspaces.id, id)).run();

      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt
      };
    });
  }
}
