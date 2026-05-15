import type { HttpMethod, RequestLogDto, ResponsePayloadDto } from "@mockdock/shared";
import type { RouteSortPreference } from "../core/local-preferences.service";
import type {
  MockdockResponsePresetDto,
  MockdockRouteResponseVariantDto
} from "../core/mockdock-api.models";

export const DASHBOARD_PAYLOAD_MODES = [
  "JSON",
  "Text",
  "XML",
  "Form Data",
  "URL Encoded",
  "Raw",
  "Binary"
] as const;

export type DashboardRouteSort = RouteSortPreference;
export type DashboardPayloadMode = (typeof DASHBOARD_PAYLOAD_MODES)[number];
export type DashboardSyncState = "idle" | "syncing" | "saved" | "error";
export type DashboardRouteTokenKind = "literal" | "wildcard" | "deep-wildcard";

export interface DashboardVariantOption {
  selectionKey: string;
  variantId: string | null;
  querySignature: Record<string, string | string[]> | null;
  queryDisplay: string;
  activeResponsePresetId: string | null;
  requestCount: number;
  saved: boolean;
}

export interface DashboardRouteDetails {
  requests: RequestLogDto[];
  variants: MockdockRouteResponseVariantDto[];
  presetsByVariantId: Record<string, MockdockResponsePresetDto[]>;
  variantsLoaded: boolean;
}

export interface DashboardResponseEditorDraft {
  statusCode: number;
  payloadMode: DashboardPayloadMode;
  contentType: string;
  payload: ResponsePayloadDto;
  delayMs: number;
}

export interface DashboardRouteToken {
  index: number;
  value: string;
  label: string;
  kind: DashboardRouteTokenKind;
  literalValue: string | null;
  canPromoteToWildcard: boolean;
  canPromoteToDeepWildcard: boolean;
  canRestoreLiteral: boolean;
}

export interface DashboardRouteView {
  anchorRouteId: string;
  routeId: string;
  method: HttpMethod;
  pattern: string;
  displayLabel: string;
  hitCount: number;
  memberRouteIds: string[];
  isWildcardRoute: boolean;
  tokens: DashboardRouteToken[];
}

export interface DashboardWorkspaceGroupView {
  workspaceId: string;
  slug: string;
  routeCount: number;
  expanded: boolean;
  routes: DashboardRouteView[];
}
