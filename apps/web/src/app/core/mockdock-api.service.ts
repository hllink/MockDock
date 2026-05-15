import { Injectable } from "@angular/core";
import type {
  CreateRouteInput,
  CreatePresetInput,
  BulkDeleteRoutesInput,
  BulkDeleteRoutesResult,
  MoveRouteInput,
  RequestLogDto,
  RenameWorkspaceInput,
  ResponsePayloadDto,
  UpdatePresetInput,
  WorkspaceDto
} from "@mockdock/shared";
import type {
  CreateRouteResponseVariantInput,
  MockdockResponsePresetDto,
  MockdockRoutePatternDto,
  MockdockRouteResponseVariantDto,
  MockdockRouteSummaryDto,
  SetVariantActivePresetInput,
  UpdateRoutePatternInput,
  UpdateRouteResponseVariantInput
} from "./mockdock-api.models";

@Injectable({ providedIn: "root" })
export class MockdockApiService {
  async getWorkspaces(): Promise<WorkspaceDto[]> {
    return this.getJson<WorkspaceDto[]>("/__mockdock/workspaces");
  }

  async getRoutes(workspaceId: string): Promise<MockdockRouteSummaryDto[]> {
    const payload = await this.getJson<unknown[]>(`/__mockdock/workspaces/${workspaceId}/routes`);
    return payload.map((item) => this.normalizeRouteSummary(item));
  }

  async createRoute(
    workspaceId: string,
    payload: CreateRouteInput
  ): Promise<MockdockRoutePatternDto> {
    const response = await this.sendJson<unknown, CreateRouteInput>(
      `/__mockdock/workspaces/${workspaceId}/routes`,
      "POST",
      payload
    );
    return this.normalizeRoute(response);
  }

  async getRequests(routeId: string): Promise<RequestLogDto[]> {
    return this.getJson<RequestLogDto[]>(`/__mockdock/routes/${routeId}/requests`);
  }

  async getVariants(routeId: string): Promise<MockdockRouteResponseVariantDto[]> {
    const payload = await this.getJson<unknown[]>(`/__mockdock/routes/${routeId}/variants`);
    return payload.map((item) => this.normalizeVariant(item));
  }

  async getPresets(variantId: string): Promise<MockdockResponsePresetDto[]> {
    const payload = await this.getJson<unknown[]>(`/__mockdock/variants/${variantId}/presets`);
    return payload.map((item) => this.normalizePreset(item));
  }

  async renameWorkspace(workspaceId: string, payload: RenameWorkspaceInput): Promise<WorkspaceDto> {
    return this.sendJson<WorkspaceDto, RenameWorkspaceInput>(
      `/__mockdock/workspaces/${workspaceId}`,
      "PATCH",
      payload
    );
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.sendJson<void>(`/__mockdock/workspaces/${workspaceId}`, "DELETE", undefined);
  }

  async moveRoute(routeId: string, payload: MoveRouteInput): Promise<MockdockRoutePatternDto> {
    const response = await this.sendJson<unknown, MoveRouteInput>(
      `/__mockdock/routes/${routeId}/move`,
      "POST",
      payload
    );
    return this.normalizeRoute(response);
  }

  async deleteRoute(routeId: string): Promise<void> {
    await this.sendJson<void>(`/__mockdock/routes/${routeId}`, "DELETE", undefined);
  }

  async bulkDeleteRoutes(routeIds: string[]): Promise<BulkDeleteRoutesResult> {
    return this.sendJson<BulkDeleteRoutesResult, BulkDeleteRoutesInput>(
      "/__mockdock/routes/bulk-delete",
      "POST",
      { routeIds }
    );
  }

  async updateRoutePattern(
    routeId: string,
    payload: UpdateRoutePatternInput
  ): Promise<MockdockRoutePatternDto> {
    const response = await this.sendJson<unknown, UpdateRoutePatternInput>(
      `/__mockdock/routes/${routeId}/pattern`,
      "PUT",
      payload
    );
    return this.normalizeRoute(response);
  }

  async createVariant(
    routeId: string,
    payload: CreateRouteResponseVariantInput
  ): Promise<MockdockRouteResponseVariantDto> {
    const response = await this.sendJson<unknown, CreateRouteResponseVariantInput>(
      `/__mockdock/routes/${routeId}/variants`,
      "POST",
      payload
    );
    return this.normalizeVariant(response);
  }

  async updateVariant(
    variantId: string,
    payload: UpdateRouteResponseVariantInput
  ): Promise<MockdockRouteResponseVariantDto> {
    const response = await this.sendJson<unknown, UpdateRouteResponseVariantInput>(
      `/__mockdock/variants/${variantId}`,
      "PUT",
      payload
    );
    return this.normalizeVariant(response);
  }

  async deleteVariant(variantId: string): Promise<void> {
    await this.sendJson<void>(`/__mockdock/variants/${variantId}`, "DELETE", undefined);
  }

  async updatePreset(presetId: string, payload: UpdatePresetInput): Promise<MockdockResponsePresetDto> {
    const response = await this.sendJson<unknown>(`/__mockdock/presets/${presetId}`, "PUT", payload);
    return this.normalizePreset(response);
  }

  async deletePreset(presetId: string): Promise<void> {
    await this.sendJson<void>(`/__mockdock/presets/${presetId}`, "DELETE", undefined);
  }

  async createPreset(
    variantId: string,
    payload: CreatePresetInput
  ): Promise<MockdockResponsePresetDto> {
    const response = await this.sendJson<unknown, CreatePresetInput>(
      `/__mockdock/variants/${variantId}/presets`,
      "POST",
      payload
    );
    return this.normalizePreset(response);
  }

  async setActivePreset(variantId: string, presetId: string | null): Promise<void> {
    const payload: SetVariantActivePresetInput = { presetId };
    await this.sendJson<void, SetVariantActivePresetInput>(
      `/__mockdock/variants/${variantId}/active-preset`,
      "POST",
      payload
    );
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw await this.buildApiError(response, `Request failed: ${url}`);
    }

    return (await response.json()) as T;
  }

  private async sendJson<T, TBody = unknown>(url: string, method: string, body?: TBody): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (!response.ok) {
      throw await this.buildApiError(response, `Request failed: ${method} ${url}`);
    }

    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  private async buildApiError(response: Response, fallbackMessage: string): Promise<ApiError> {
    const responseBody = await this.readErrorBody(response);
    const message =
      responseBody.message ||
      responseBody.text ||
      (response.status === 413 ? "Payload too large" : fallbackMessage);

    return new ApiError(message, response.status);
  }

  private async readErrorBody(response: Response): Promise<{ message?: string; text?: string }> {
    const contentType =
      typeof response.headers?.get === "function" ? (response.headers.get("content-type") ?? "") : "";
    if (contentType.includes("application/json")) {
      try {
        const payload = (await response.json()) as { message?: unknown };
        return {
          message:
            typeof payload?.message === "string" && payload.message.trim()
              ? payload.message
              : undefined
        };
      } catch {
        return {};
      }
    }

    try {
      const text = await response.text();
      return {
        text: text.trim() || undefined
      };
    } catch {
      return {};
    }
  }

  private normalizeRouteSummary(value: unknown): MockdockRouteSummaryDto {
    const record = value as Record<string, unknown>;
    return {
      route: this.normalizeRoute(record.route ?? value)
    };
  }

  private normalizeRoute(value: unknown): MockdockRoutePatternDto {
    const record = value as Record<string, unknown>;
    return {
      id: String(record.id ?? ""),
      workspaceId: String(record.workspaceId ?? ""),
      method: String(record.method ?? "GET") as MockdockRoutePatternDto["method"],
      pattern: String(record.pattern ?? "/"),
      examplePath: String(record.examplePath ?? record.pattern ?? "/"),
      hitCount: Number(record.hitCount ?? 0),
      lastSeenAt: String(record.lastSeenAt ?? ""),
      activeResponsePresetId:
        record.activeResponsePresetId === undefined ? null : (record.activeResponsePresetId as string | null),
      createdAt: String(record.createdAt ?? ""),
      updatedAt: String(record.updatedAt ?? "")
    };
  }

  private normalizeVariant(value: unknown): MockdockRouteResponseVariantDto {
    const record = value as Record<string, unknown>;
    return {
      id: String(record.id ?? ""),
      routePatternId: String(record.routePatternId ?? ""),
      querySignature: this.normalizeQuerySignature(record.querySignature),
      queryDisplay: String(record.queryDisplay ?? ""),
      activeResponsePresetId:
        record.activeResponsePresetId === undefined ? null : (record.activeResponsePresetId as string | null),
      createdAt: String(record.createdAt ?? ""),
      updatedAt: String(record.updatedAt ?? "")
    };
  }

  private normalizePreset(value: unknown): MockdockResponsePresetDto {
    const record = value as Record<string, unknown>;
    return {
      id: String(record.id ?? ""),
      routeResponseVariantId: String(
        record.routeResponseVariantId ?? record.routePatternId ?? ""
      ),
      routePatternId:
        record.routePatternId === undefined ? undefined : String(record.routePatternId),
      isSystem: Boolean(record.isSystem ?? false),
      name: String(record.name ?? ""),
      statusCode: Number(record.statusCode ?? 200),
      headers: (record.headers as Record<string, string> | undefined) ?? {},
      body: this.normalizePayload(record.body, (record.headers as Record<string, string> | undefined) ?? {}),
      delayMs: Number(record.delayMs ?? 0),
      createdAt: String(record.createdAt ?? ""),
      updatedAt: String(record.updatedAt ?? "")
    };
  }

  private normalizeQuerySignature(
    value: unknown
  ): Record<string, string | string[]> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        Array.isArray(entry) ? entry.map((item) => String(item)) : String(entry)
      ])
    );
  }

  private normalizePayload(
    value: unknown,
    headers: Record<string, string>
  ): ResponsePayloadDto {
    const record = value as Record<string, unknown> | null;
    const kind = typeof record?.kind === "string" ? record.kind : null;
    if (kind === "json") {
      return { kind, value: record?.value ?? null };
    }

    if (kind === "text" || kind === "xml" || kind === "raw") {
      return { kind, value: String(record?.value ?? "") };
    }

    if (kind === "urlEncoded" || kind === "formData") {
      const entries = Array.isArray(record?.entries) ? record.entries : [];
      return {
        kind,
        entries: entries.map((entry) => {
          const item = entry as Record<string, unknown>;
          return {
            key: String(item.key ?? ""),
            value: String(item.value ?? "")
          };
        })
      };
    }

    if (kind === "binary") {
      return {
        kind,
        fileName: String(record?.fileName ?? "payload.bin"),
        mimeType: String(record?.mimeType ?? headers["content-type"] ?? "application/octet-stream"),
        base64: String(record?.base64 ?? ""),
        sizeBytes: Number(record?.sizeBytes ?? 0)
      };
    }

    const contentType = (headers["content-type"] ?? "").toLowerCase();
    if (contentType.includes("application/json")) {
      return { kind: "json", value };
    }

    if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
      return { kind: "xml", value: typeof value === "string" ? value : JSON.stringify(value, null, 2) };
    }

    if (typeof value === "string") {
      return contentType ? { kind: "raw", value } : { kind: "text", value };
    }

    return { kind: "json", value };
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}
