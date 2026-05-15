import type { ResponsePayloadDto } from "@mockdock/shared";

type MockResponseBody = Buffer | string | unknown;

function escapeContentDispositionFilename(value: string): string {
  return value.replace(/[\r\n"]/g, "_");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldEntryArray(value: unknown): value is Array<{ key: string; value: string }> {
  return Array.isArray(value) && value.every((entry) => isObject(entry));
}

export function inferResponsePayload(body: unknown, headers: Record<string, string> = {}): ResponsePayloadDto {
  if (isObject(body) && typeof body.kind === "string") {
    const kind = body.kind;
    if (
      kind === "json" ||
      kind === "text" ||
      kind === "xml" ||
      kind === "raw" ||
      kind === "urlEncoded" ||
      kind === "formData" ||
      kind === "binary"
    ) {
      return body as unknown as ResponsePayloadDto;
    }
  }

  const contentType = (headers["content-type"] ?? "").toLowerCase();
  if (contentType.includes("application/json")) {
    return { kind: "json", value: body };
  }

  if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
    return { kind: "xml", value: typeof body === "string" ? body : JSON.stringify(body, null, 2) };
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = typeof body === "string" ? body : "";
    const params = new URLSearchParams(text);
    return {
      kind: "urlEncoded",
      entries: [...params.entries()].map(([key, value]) => ({ key, value }))
    };
  }

  if (contentType.includes("multipart/form-data")) {
    return {
      kind: "formData",
      entries: isFieldEntryArray(body)
        ? body.map((entry) => ({ key: String(entry.key ?? ""), value: String(entry.value ?? "") }))
        : []
    };
  }

  if (contentType.includes("application/octet-stream")) {
    const text = typeof body === "string" ? body : "";
    return {
      kind: "binary",
      fileName: "payload.bin",
      mimeType: headers["content-type"] ?? "application/octet-stream",
      base64: text,
      sizeBytes: Buffer.from(text, "base64").byteLength
    };
  }

  if (typeof body === "string") {
    return contentType ? { kind: "raw", value: body } : { kind: "text", value: body };
  }

  return { kind: "json", value: body };
}

export function buildMultipartBody(
  entries: Array<{ key: string; value: string }>,
  boundary: string
): string {
  return `${entries
    .map(
      (entry) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${entry.key}"\r\n\r\n${entry.value}\r\n`
    )
    .join("")}--${boundary}--\r\n`;
}

export function renderResponsePayload(
  payload: ResponsePayloadDto,
  headers: Record<string, string>
): { body: MockResponseBody; headers: Record<string, string> } {
  const nextHeaders = { ...headers };

  switch (payload.kind) {
    case "json":
      return { body: payload.value, headers: nextHeaders };
    case "text":
    case "xml":
    case "raw":
      return { body: payload.value, headers: nextHeaders };
    case "urlEncoded": {
      const params = new URLSearchParams();
      for (const entry of payload.entries) {
        params.append(entry.key, entry.value);
      }
      return { body: params.toString(), headers: nextHeaders };
    }
    case "formData": {
      const boundary = `mockdock-${Math.random().toString(16).slice(2)}`;
      nextHeaders["content-type"] = `multipart/form-data; boundary=${boundary}`;
      return {
        body: buildMultipartBody(payload.entries, boundary),
        headers: nextHeaders
      };
    }
    case "binary": {
      if (
        payload.mimeType &&
        (!nextHeaders["content-type"] || nextHeaders["content-type"] === "application/octet-stream")
      ) {
        nextHeaders["content-type"] = payload.mimeType;
      }
      if (!nextHeaders["content-disposition"] && payload.fileName) {
        nextHeaders["content-disposition"] =
          `inline; filename="${escapeContentDispositionFilename(payload.fileName)}"`;
      }
      return {
        body: Buffer.from(payload.base64, "base64"),
        headers: nextHeaders
      };
    }
  }
}
