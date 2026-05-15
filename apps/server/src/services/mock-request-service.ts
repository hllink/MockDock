import { inferRoutePattern, resolveWorkspacePath } from "@mockdock/route-inference";
import type {
  HttpMethod,
  MockdockEvent,
  NormalizedQuery,
  ResponsePayloadDto,
  ResponsePresetDto,
  RoutePatternDto,
  WorkspaceSettingsDto
} from "@mockdock/shared";

import type { SseBroker } from "../events/sse-broker.js";
import type { PresetRepository } from "../repositories/preset-repository.js";
import type { RequestLogRepository } from "../repositories/request-log-repository.js";
import type { RouteRepository } from "../repositories/route-repository.js";
import type { WorkspaceRepository } from "../repositories/workspace-repository.js";
import { renderResponsePayload } from "../lib/response-payload.js";

export interface HandleMockRequestInput {
  method: HttpMethod;
  rawPath: string;
  query: NormalizedQuery;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  ip: string;
}

export interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer | string | unknown;
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizePresetResponse(
  preset: ResponsePresetDto | null,
  workspaceDefaults: { statusCode: number; headers: Record<string, string>; body: ResponsePayloadDto }
): MockResponse & { delayMs: number } {
  if (!preset) {
    const rendered = renderResponsePayload(workspaceDefaults.body, workspaceDefaults.headers);
    return {
      statusCode: workspaceDefaults.statusCode,
      headers: rendered.headers,
      body: rendered.body,
      delayMs: 0
    };
  }

  const rendered = renderResponsePayload(preset.body, preset.headers);
  return {
    statusCode: preset.statusCode,
    headers: rendered.headers,
    body: rendered.body,
    delayMs: preset.delayMs
  };
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getWorkspaceDefaultResponse(settings: WorkspaceSettingsDto): {
  statusCode: number;
  headers: Record<string, string>;
  body: ResponsePayloadDto;
} {
  return {
    statusCode: settings.defaultStatusCode,
    headers: settings.defaultHeaders,
    body: { kind: "json", value: settings.defaultBody }
  };
}

function isGeneratedDefaultPreset(
  preset: ResponsePresetDto,
  workspaceDefaults: { statusCode: number; headers: Record<string, string>; body: ResponsePayloadDto }
): boolean {
  return (
    preset.name === "Default" &&
    preset.statusCode === workspaceDefaults.statusCode &&
    preset.delayMs === 0 &&
    deepEqual(preset.headers, workspaceDefaults.headers) &&
    deepEqual(preset.body, workspaceDefaults.body)
  );
}

export class MockRequestService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly routeRepository: RouteRepository,
    private readonly requestLogRepository: RequestLogRepository,
    private readonly presetRepository: PresetRepository,
    private readonly broker: SseBroker
  ) {}

  async handle(input: HandleMockRequestInput): Promise<MockResponse> {
    const workspaceResolution = resolveWorkspacePath(input.rawPath);
    const normalizedPath = workspaceResolution.normalizedPath;
    const workspace = await this.workspaceRepository.create({
      name: workspaceResolution.workspaceSlug,
      slug: workspaceResolution.workspaceSlug
    });

    const observedRoute = await this.routeRepository.findOrCreate({
      workspaceId: workspace.id,
      method: input.method,
      pattern: inferRoutePattern(normalizedPath),
      examplePath: normalizedPath
    });
    const workspaceDefaults = getWorkspaceDefaultResponse(workspace.settings);
    await this.ensureDefaultPreset(observedRoute.id, workspaceDefaults);

    const resolvedRoute = await this.resolveRoute({
      workspaceId: workspace.id,
      method: input.method,
      normalizedPath,
      query: input.query,
      workspaceDefaults
    });
    const resolvedPreset = resolvedRoute?.preset ?? null;

    const servingRoute =
      resolvedRoute?.route && resolvedRoute.route.id !== observedRoute.id
        ? await this.routeRepository.touchRoute(resolvedRoute.route.id)
        : null;

    const resolved = normalizePresetResponse(resolvedPreset, workspaceDefaults);

    const log = await this.requestLogRepository.create({
      workspaceId: workspace.id,
      routePatternId: observedRoute.id,
      method: input.method,
      rawPath: input.rawPath,
      normalizedPath,
      query: input.query,
      headers: input.headers,
      body: input.body,
      ip: input.ip,
      responseStatusCode: resolved.statusCode,
      responseBody: resolved.body
    });

    const requestEvent: MockdockEvent<"request_received"> = {
      type: "request_received",
      payload: {
        workspaceId: workspace.id,
        routePatternId: observedRoute.id,
        method: input.method,
        rawPath: input.rawPath,
        normalizedPath,
        createdAt: log.createdAt
      }
    };

    const routeEvent: MockdockEvent<"route_pattern_updated"> = {
      type: "route_pattern_updated",
      payload: {
        workspaceId: workspace.id,
        routePatternId: observedRoute.id,
        pattern: observedRoute.pattern,
        method: observedRoute.method,
        hitCount: observedRoute.hitCount,
        lastSeenAt: observedRoute.lastSeenAt
      }
    };

    this.broker.publish(requestEvent);
    this.broker.publish(routeEvent);
    if (servingRoute) {
      this.broker.publish({
        type: "route_pattern_updated",
        payload: {
          workspaceId: workspace.id,
          routePatternId: servingRoute.id,
          pattern: servingRoute.pattern,
          method: servingRoute.method,
          hitCount: servingRoute.hitCount,
          lastSeenAt: servingRoute.lastSeenAt
        }
      });
    }

    await this.requestLogRepository.pruneWorkspaceLogs(workspace.id, workspace.settings.maxRequestLogs);
    await delay(resolved.delayMs);

    return {
      statusCode: resolved.statusCode,
      headers: resolved.headers,
      body: resolved.body
    };
  }

  private async resolveRoute(input: {
    workspaceId: string;
    method: HttpMethod;
    normalizedPath: string;
    query: NormalizedQuery;
    workspaceDefaults: { statusCode: number; headers: Record<string, string>; body: ResponsePayloadDto };
  }): Promise<{ route: RoutePatternDto; preset: ResponsePresetDto } | null> {
    const candidates = await this.routeRepository.findMatchingRoutes({
      workspaceId: input.workspaceId,
      method: input.method,
      normalizedPath: input.normalizedPath
    });
    let generatedDefaultMatch: { route: RoutePatternDto; preset: ResponsePresetDto } | null = null;

    for (const candidate of candidates) {
      const queryVariant = await this.routeRepository.findVariantByRouteAndQuery(candidate.id, input.query);
      if (queryVariant?.activeResponsePresetId) {
        const preset = await this.presetRepository.getById(queryVariant.activeResponsePresetId);
        if (preset) {
          if (isGeneratedDefaultPreset(preset, input.workspaceDefaults)) {
            generatedDefaultMatch ??= {
              route: candidate,
              preset
            };
            continue;
          }

          return {
            route: candidate,
            preset
          };
        }
      }

      const defaultVariant = await this.routeRepository.getDefaultVariant(candidate.id);
      if (defaultVariant?.activeResponsePresetId) {
        const preset = await this.presetRepository.getById(defaultVariant.activeResponsePresetId);
        if (preset) {
          if (isGeneratedDefaultPreset(preset, input.workspaceDefaults)) {
            generatedDefaultMatch ??= {
              route: candidate,
              preset
            };
            continue;
          }

          return {
            route: candidate,
            preset
          };
        }
      }
    }

    return generatedDefaultMatch;
  }

  private async ensureDefaultPreset(
    routePatternId: string,
    workspaceDefaults: { statusCode: number; headers: Record<string, string>; body: ResponsePayloadDto }
  ): Promise<void> {
    const defaultVariant = await this.routeRepository.getDefaultVariant(routePatternId);
    if (!defaultVariant) {
      return;
    }

    const presets = await this.presetRepository.listByVariant(defaultVariant.id);
    if (presets.length > 0) {
      return;
    }

    const preset = await this.presetRepository.create(defaultVariant.id, {
      name: "Default",
      statusCode: workspaceDefaults.statusCode,
      headers: workspaceDefaults.headers,
      body: workspaceDefaults.body,
      delayMs: 0
    }, { isSystem: true });
    await this.routeRepository.setActivePresetForVariant(defaultVariant.id, preset.id);
  }
}
