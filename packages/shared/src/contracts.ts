export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type QueryValue = string | string[];
export type NormalizedQuery = Record<string, QueryValue>;

export interface ResponseFieldEntryDto {
  key: string;
  value: string;
}

export interface ResponseJsonPayloadDto {
  kind: "json";
  value: unknown;
}

export interface ResponseTextPayloadDto {
  kind: "text";
  value: string;
}

export interface ResponseXmlPayloadDto {
  kind: "xml";
  value: string;
}

export interface ResponseRawPayloadDto {
  kind: "raw";
  value: string;
}

export interface ResponseUrlEncodedPayloadDto {
  kind: "urlEncoded";
  entries: ResponseFieldEntryDto[];
}

export interface ResponseFormDataPayloadDto {
  kind: "formData";
  entries: ResponseFieldEntryDto[];
}

export interface ResponseBinaryPayloadDto {
  kind: "binary";
  fileName: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
}

export type ResponsePayloadDto =
  | ResponseJsonPayloadDto
  | ResponseTextPayloadDto
  | ResponseXmlPayloadDto
  | ResponseRawPayloadDto
  | ResponseUrlEncodedPayloadDto
  | ResponseFormDataPayloadDto
  | ResponseBinaryPayloadDto;

export type MockdockEventType =
  | "request_received"
  | "route_pattern_updated"
  | "response_preset_updated"
  | "active_preset_changed";

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettingsDto {
  workspaceStrategy: "first_path_segment";
  defaultStatusCode: number;
  defaultBody: unknown;
  defaultHeaders: Record<string, string>;
  captureEnabled: boolean;
  maxRequestLogs: number;
}

export interface RoutePatternDto {
  id: string;
  workspaceId: string;
  method: HttpMethod;
  pattern: string;
  examplePath: string;
  hitCount: number;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RouteResponseVariantDto {
  id: string;
  routePatternId: string;
  querySignature: NormalizedQuery | null;
  queryDisplay: string;
  activeResponsePresetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestLogDto {
  id: string;
  workspaceId: string;
  routePatternId: string;
  method: HttpMethod;
  rawPath: string;
  normalizedPath: string;
  query: NormalizedQuery;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  ip: string;
  responseStatusCode: number;
  responseBody: unknown;
  createdAt: string;
}

export interface ResponsePresetDto {
  id: string;
  routeResponseVariantId: string;
  isSystem: boolean;
  name: string;
  statusCode: number;
  headers: Record<string, string>;
  body: ResponsePayloadDto;
  delayMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface RouteSummaryDto {
  route: RoutePatternDto;
  defaultVariant: RouteResponseVariantDto;
  activePreset: ResponsePresetDto | null;
}

export interface RouteDetailsDto {
  requests: RequestLogDto[];
  variants: RouteResponseVariantDto[];
  presetsByVariantId: Record<string, ResponsePresetDto[]>;
}

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

export interface RenameWorkspaceInput {
  slug: string;
}

export interface MoveRouteInput {
  destinationWorkspaceId: string;
}

export interface BulkDeleteRoutesInput {
  routeIds: string[];
}

export interface BulkDeleteRoutesResult {
  deletedRouteIds: string[];
  deletedWorkspaceIds: string[];
}

export interface CreateRouteInput {
  method: HttpMethod;
  pattern: string;
  examplePath?: string;
}

export interface CreatePresetInput {
  name: string;
  statusCode: number;
  headers: Record<string, string>;
  body: ResponsePayloadDto;
  delayMs: number;
}

export interface UpdatePresetInput extends CreatePresetInput {}

export interface SetActivePresetInput {
  presetId: string | null;
}

export interface CreateRouteResponseVariantInput {
  querySignature: NormalizedQuery | null;
  queryDisplay?: string;
}

export interface UpdateRouteResponseVariantInput {
  querySignature: NormalizedQuery | null;
  queryDisplay?: string;
}

export interface UpdateRoutePatternInput {
  pattern: string;
  examplePath?: string;
}

export interface MockdockEventMap {
  request_received: {
    workspaceId: string;
    routePatternId: string;
    method: HttpMethod;
    rawPath: string;
    normalizedPath: string;
    createdAt: string;
  };
  route_pattern_updated: {
    workspaceId: string;
    routePatternId: string;
    pattern: string;
    method: HttpMethod;
    hitCount: number;
    lastSeenAt: string;
  };
  response_preset_updated: {
    routePatternId: string;
    routeResponseVariantId: string;
    presetId: string;
    action: "created" | "updated" | "deleted";
  };
  active_preset_changed: {
    routePatternId: string;
    routeResponseVariantId: string;
    presetId: string | null;
  };
}

export type MockdockEvent<K extends MockdockEventType = MockdockEventType> = {
  type: K;
  payload: MockdockEventMap[K];
};
