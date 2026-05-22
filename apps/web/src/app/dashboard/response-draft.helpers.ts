import type { ResponsePayloadDto } from "@mockdock/shared";

import type { DashboardPayloadMode } from "./dashboard.models";

export type DashboardStatusToolbarSelectionKey = "2xx" | "3xx" | "4xx" | "5xx" | "custom";

type StatusToolbarFamilyKey = Exclude<DashboardStatusToolbarSelectionKey, "custom">;

const STATUS_TOOLBAR_CODES: Readonly<Record<StatusToolbarFamilyKey, readonly number[]>> = {
  "2xx": [200, 201, 202, 204],
  "3xx": [301, 302, 307, 308],
  "4xx": [400, 401, 403, 404, 409, 422, 429],
  "5xx": [500, 501, 502, 503, 504]
} as const;

export function getStatusToolbarSelectionKey(statusCode: number): DashboardStatusToolbarSelectionKey {
  for (const [key, codes] of Object.entries(STATUS_TOOLBAR_CODES) as [StatusToolbarFamilyKey, readonly number[]][]) {
    if (codes.includes(statusCode)) {
      return key;
    }
  }

  return "custom";
}

export function isValidStatusCode(statusCode: number): boolean {
  return Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599;
}

export function normalizeContentType(contentType: string | null | undefined): string | null {
  const nextValue = contentType?.trim() ?? "";
  return nextValue ? nextValue : null;
}

export function getContentTypeForMode(payloadMode: DashboardPayloadMode): string | null {
  switch (payloadMode) {
    case "JSON":
      return "application/json";
    case "Text":
      return "text/plain; charset=utf-8";
    case "XML":
      return "application/xml";
    case "Form Data":
      return "multipart/form-data";
    case "URL Encoded":
      return "application/x-www-form-urlencoded";
    case "Binary":
      return "application/octet-stream";
    case "Raw":
    default:
      return null;
  }
}

export function getPayloadModeForPayload(payload: ResponsePayloadDto): DashboardPayloadMode {
  switch (payload.kind) {
    case "json":
      return "JSON";
    case "text":
      return "Text";
    case "xml":
      return "XML";
    case "formData":
      return "Form Data";
    case "urlEncoded":
      return "URL Encoded";
    case "binary":
      return "Binary";
    case "raw":
    default:
      return "Raw";
  }
}

export function getPayloadModeForContentType(
  contentType: string,
  currentPayload: ResponsePayloadDto
): DashboardPayloadMode {
  const normalized = contentType.toLowerCase();
  if (!normalized) {
    return currentPayload.kind === "text" ? "Text" : "Raw";
  }

  if (normalized.includes("application/json")) {
    return "JSON";
  }

  if (normalized.includes("application/xml") || normalized.includes("text/xml")) {
    return "XML";
  }

  if (normalized.includes("multipart/form-data")) {
    return "Form Data";
  }

  if (normalized.includes("application/x-www-form-urlencoded")) {
    return "URL Encoded";
  }

  if (normalized.includes("application/octet-stream")) {
    return "Binary";
  }

  return normalized.startsWith("text/") ? "Text" : "Raw";
}

export function inferPayloadModeFromResponse(
  body: ResponsePayloadDto,
  headers: Record<string, string> = {}
): DashboardPayloadMode {
  const payloadMode = getPayloadModeForPayload(body);
  if (body.kind !== "raw" && body.kind !== "text") {
    return payloadMode;
  }

  const contentType = headers["content-type"]?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return "JSON";
  }

  if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
    return "XML";
  }

  if (contentType.includes("multipart/form-data")) {
    return "Form Data";
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return "URL Encoded";
  }

  if (contentType.includes("application/octet-stream")) {
    return "Binary";
  }

  return body.kind === "text" ? "Text" : contentType ? "Raw" : "Text";
}
