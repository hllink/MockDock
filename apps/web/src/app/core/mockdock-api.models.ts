import type { HttpMethod, RequestLogDto, ResponsePayloadDto } from "@mockdock/shared";

export interface MockdockRoutePatternDto {
  id: string;
  workspaceId: string;
  method: HttpMethod;
  pattern: string;
  examplePath: string;
  hitCount: number;
  lastSeenAt: string;
  activeResponsePresetId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockdockRouteResponseVariantDto {
  id: string;
  routePatternId: string;
  querySignature: Record<string, string | string[]> | null;
  queryDisplay: string;
  activeResponsePresetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MockdockResponsePresetDto {
  id: string;
  routeResponseVariantId: string;
  routePatternId?: string;
  isSystem: boolean;
  name: string;
  statusCode: number;
  headers: Record<string, string>;
  body: ResponsePayloadDto;
  delayMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface MockdockRouteSummaryDto {
  route: MockdockRoutePatternDto;
}

export interface CreateRouteResponseVariantInput {
  querySignature: Record<string, string | string[]> | null;
  queryDisplay: string;
}

export interface UpdateRouteResponseVariantInput {
  queryDisplay: string;
}

export interface SetVariantActivePresetInput {
  presetId: string | null;
}

export interface UpdateRoutePatternInput {
  pattern: string;
}

export interface MockdockRouteDetailsDto {
  requests: RequestLogDto[];
  variants: MockdockRouteResponseVariantDto[];
  presetsByVariantId: Record<string, MockdockResponsePresetDto[]>;
}
