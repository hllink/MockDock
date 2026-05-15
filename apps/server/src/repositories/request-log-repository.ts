import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { matchRoutePattern } from "@mockdock/route-inference";
import type { HttpMethod, RequestLogDto, RoutePatternDto } from "@mockdock/shared";

import type { DatabaseClient } from "../db/client.js";
import { requestLogs } from "../db/schema.js";
import { createId } from "../lib/id.js";
import { safeJsonParse, serializeJson } from "../lib/json.js";
import { nowIso } from "../lib/time.js";

export class RequestLogRepository {
  constructor(private readonly client: DatabaseClient) {}

  async create(input: {
    workspaceId: string;
    routePatternId: string;
    method: HttpMethod;
    rawPath: string;
    normalizedPath: string;
    query: Record<string, string | string[]>;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    ip: string;
    responseStatusCode: number;
    responseBody: unknown;
  }): Promise<RequestLogDto> {
    const createdAt = nowIso();
    const id = createId();

    await this.client.db.insert(requestLogs).values({
      id,
      workspaceId: input.workspaceId,
      routePatternId: input.routePatternId,
      method: input.method,
      rawPath: input.rawPath,
      normalizedPath: input.normalizedPath,
      query: serializeJson(input.query),
      headers: serializeJson(input.headers),
      body: serializeJson(input.body),
      ip: input.ip,
      responseStatusCode: input.responseStatusCode,
      responseBody: serializeJson(input.responseBody),
      createdAt
    }).run();

    return {
      id,
      workspaceId: input.workspaceId,
      routePatternId: input.routePatternId,
      method: input.method,
      rawPath: input.rawPath,
      normalizedPath: input.normalizedPath,
      query: input.query,
      headers: input.headers,
      body: input.body,
      ip: input.ip,
      responseStatusCode: input.responseStatusCode,
      responseBody: input.responseBody,
      createdAt
    };
  }

  async listByRoute(routePatternId: string): Promise<RequestLogDto[]> {
    return this.listByRouteIds([routePatternId]);
  }

  async listByRouteIds(routePatternIds: string[]): Promise<RequestLogDto[]> {
    if (routePatternIds.length === 0) {
      return [];
    }

    const rows = await this.client.db
      .select()
      .from(requestLogs)
      .where(inArray(requestLogs.routePatternId, routePatternIds))
      .orderBy(desc(requestLogs.createdAt))
      .all();

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      routePatternId: row.routePatternId,
      method: row.method as HttpMethod,
      rawPath: row.rawPath,
      normalizedPath: row.normalizedPath,
      query: safeJsonParse<Record<string, string | string[]>>(row.query, {}),
      headers: safeJsonParse<Record<string, string | string[] | undefined>>(row.headers, {}),
      body: safeJsonParse(row.body, null),
      ip: row.ip,
      responseStatusCode: row.responseStatusCode,
      responseBody: safeJsonParse(row.responseBody, null),
      createdAt: row.createdAt
    }));
  }

  async listByRouteMatch(route: RoutePatternDto): Promise<RequestLogDto[]> {
    const rows = await this.client.db
      .select()
      .from(requestLogs)
      .where(
        and(
          eq(requestLogs.workspaceId, route.workspaceId),
          eq(requestLogs.method, route.method)
        )
      )
      .orderBy(desc(requestLogs.createdAt))
      .all();

    return rows
      .filter((row) => matchRoutePattern(route.pattern, row.normalizedPath))
      .map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        routePatternId: row.routePatternId,
        method: row.method as HttpMethod,
        rawPath: row.rawPath,
        normalizedPath: row.normalizedPath,
        query: safeJsonParse<Record<string, string | string[]>>(row.query, {}),
        headers: safeJsonParse<Record<string, string | string[] | undefined>>(row.headers, {}),
        body: safeJsonParse(row.body, null),
        ip: row.ip,
        responseStatusCode: row.responseStatusCode,
        responseBody: safeJsonParse(row.responseBody, null),
        createdAt: row.createdAt
      }));
  }

  async pruneWorkspaceLogs(workspaceId: string, maxRequestLogs: number): Promise<void> {
    const rows = await this.client.db
      .select({ id: requestLogs.id })
      .from(requestLogs)
      .where(eq(requestLogs.workspaceId, workspaceId))
      .orderBy(asc(requestLogs.createdAt))
      .all();

    if (rows.length <= maxRequestLogs) {
      return;
    }

    const idsToDelete = rows.slice(0, rows.length - maxRequestLogs).map((row) => row.id);
    await this.client.db.delete(requestLogs).where(inArray(requestLogs.id, idsToDelete)).run();
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    const result = await this.client.db
      .select({ count: sql<number>`count(*)` })
      .from(requestLogs)
      .where(eq(requestLogs.workspaceId, workspaceId))
      .get();

    return result?.count ?? 0;
  }
}
