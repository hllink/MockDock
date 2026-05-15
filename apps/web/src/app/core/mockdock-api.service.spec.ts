import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreateRouteInput,
  CreatePresetInput,
  MoveRouteInput,
  RenameWorkspaceInput,
  RequestLogDto
} from "@mockdock/shared";

import { MockdockApiService } from "./mockdock-api.service";
import type {
  MockdockResponsePresetDto,
  MockdockRouteSummaryDto
} from "./mockdock-api.models";

describe("MockdockApiService", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.unstubAllGlobals();
  });

  it("loads workspaces", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "w1", name: "Demo", slug: "demo", createdAt: "", updatedAt: "" }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const workspaces = await service.getWorkspaces();

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/workspaces");
    expect(workspaces[0]?.slug).toBe("demo");
  });

  it("loads route summaries for a workspace", async () => {
    const routes: MockdockRouteSummaryDto[] = [
      {
        route: {
          id: "route-1",
          workspaceId: "w1",
          method: "GET",
          pattern: "/users/:id",
          examplePath: "/users/1",
          hitCount: 3,
          lastSeenAt: "2026-05-15T00:00:00.000Z",
          activeResponsePresetId: "preset-1",
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:00.000Z"
        }
      }
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => routes
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const result = await service.getRoutes("w1");

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/workspaces/w1/routes");
    expect(result).toEqual(routes);
  });

  it("loads request logs for a route", async () => {
    const requests: RequestLogDto[] = [
      {
        id: "req-1",
        workspaceId: "w1",
        routePatternId: "route-1",
        method: "POST",
        rawPath: "/users",
        normalizedPath: "/users",
        query: {},
        headers: { host: "localhost" },
        body: { name: "Ada" },
        ip: "127.0.0.1",
        responseStatusCode: 201,
        responseBody: { created: true },
        createdAt: "2026-05-15T00:00:00.000Z"
      }
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => requests
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const result = await service.getRequests("route-1");

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/routes/route-1/requests");
    expect(result).toEqual(requests);
  });

  it("loads presets for a variant", async () => {
    const presets: MockdockResponsePresetDto[] = [
      {
        id: "preset-1",
        routeResponseVariantId: "variant-1",
        isSystem: false,
        name: "Success",
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: { kind: "json", value: { ok: true } },
        delayMs: 50,
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z"
      }
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => presets
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const result = await service.getPresets("variant-1");

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/variants/variant-1/presets");
    expect(result).toEqual(presets);
  });

  it("creates presets with a typed JSON payload", async () => {
    const payload: CreatePresetInput = {
      name: "Created",
      statusCode: 202,
      headers: { "x-mode": "preview" },
      body: { kind: "json", value: { ok: true } },
      delayMs: 25
    };
    const created: MockdockResponsePresetDto = {
      id: "preset-2",
      routeResponseVariantId: "variant-1",
      isSystem: false,
      ...payload,
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z"
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => created
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const result = await service.createPreset("variant-1", payload);

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/variants/variant-1/presets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(result).toEqual(created);
  });

  it("updates presets with a typed JSON payload", async () => {
    const payload: CreatePresetInput = {
      name: "Updated",
      statusCode: 204,
      headers: { "x-mode": "live" },
      body: { kind: "json", value: null },
      delayMs: 0
    };
    const updated: MockdockResponsePresetDto = {
      id: "preset-1",
      routeResponseVariantId: "variant-1",
      isSystem: false,
      ...payload,
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:01.000Z"
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => updated
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const result = await service.updatePreset("preset-1", payload);

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/presets/preset-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(result).toEqual(updated);
  });

  it("posts active preset updates with JSON payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    await service.setActivePreset("variant-1", "preset-9");

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/variants/variant-1/active-preset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ presetId: "preset-9" })
    });
  });

  it("surfaces JSON error messages from failed writes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        headers: {
          get: () => "application/json"
        },
        json: async () => ({ message: "Payload too large" })
      })
    );

    const service = TestBed.inject(MockdockApiService);

    await expect(
      service.updatePreset("preset-1", {
        name: "Binary",
        statusCode: 200,
        headers: { "content-type": "application/octet-stream" },
        body: {
          kind: "binary",
          fileName: "payload.bin",
          mimeType: "application/octet-stream",
          base64: "YQ==",
          sizeBytes: 1
        },
        delayMs: 0
      })
    ).rejects.toMatchObject({ name: "ApiError", message: "Payload too large", status: 413 });
  });

  it("falls back to plain text error bodies from failed reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: {
          get: () => "text/plain"
        },
        text: async () => "Upstream unavailable"
      })
    );

    const service = TestBed.inject(MockdockApiService);

    await expect(service.getWorkspaces()).rejects.toMatchObject({
      name: "ApiError",
      message: "Upstream unavailable",
      status: 502
    });
  });

  it("deletes presets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => undefined
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    await service.deletePreset("preset-1");

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/presets/preset-1", {
      method: "DELETE",
      headers: undefined,
      body: undefined
    });
  });

  it("renames a workspace with a patch request", async () => {
    const payload: RenameWorkspaceInput = { slug: "renamed-workspace" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "workspace-1",
        name: "workspace-1",
        slug: "renamed-workspace",
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:01.000Z"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const result = await service.renameWorkspace("workspace-1", payload);

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/workspaces/workspace-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(result.slug).toBe("renamed-workspace");
  });

  it("creates a route inside a workspace with a post request", async () => {
    const payload: CreateRouteInput = {
      method: "PATCH",
      pattern: "/users/**"
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: "route-9",
        workspaceId: "workspace-1",
        method: "PATCH",
        pattern: "/users/**",
        examplePath: "/users/**",
        hitCount: 0,
        lastSeenAt: "2026-05-15T00:00:00.000Z",
        activeResponsePresetId: null,
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:00.000Z"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const result = await service.createRoute("workspace-1", payload);

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/workspaces/workspace-1/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(result.pattern).toBe("/users/**");
    expect(result.hitCount).toBe(0);
  });

  it("moves a route into another workspace with a post request", async () => {
    const payload: MoveRouteInput = { destinationWorkspaceId: "workspace-2" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "route-1",
        workspaceId: "workspace-2",
        method: "GET",
        pattern: "/route-1",
        examplePath: "/route-1",
        hitCount: 1,
        lastSeenAt: "2026-05-15T00:00:00.000Z",
        activeResponsePresetId: null,
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T00:00:01.000Z"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    const result = await service.moveRoute("route-1", payload);

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/routes/route-1/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(result.workspaceId).toBe("workspace-2");
  });

  it("deletes a route with a delete request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    await service.deleteRoute("route-1");

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/routes/route-1", {
      method: "DELETE",
      headers: undefined,
      body: undefined
    });
  });

  it("bulk deletes routes with a post request", async () => {
    const result = {
      deletedRouteIds: ["route-1", "route-2"],
      deletedWorkspaceIds: ["workspace-1"]
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => result
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    await expect(service.bulkDeleteRoutes(["route-1", "route-2"])).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/routes/bulk-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routeIds: ["route-1", "route-2"] })
    });
  });

  it("deletes a workspace with a delete request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    await service.deleteWorkspace("workspace-1");

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/workspaces/workspace-1", {
      method: "DELETE",
      headers: undefined,
      body: undefined
    });
  });

  it("deletes a query variant with a delete request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    await service.deleteVariant("variant-1");

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/variants/variant-1", {
      method: "DELETE",
      headers: undefined,
      body: undefined
    });
  });

  it("clears the active preset with a null payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = TestBed.inject(MockdockApiService);
    await service.setActivePreset("variant-1", null);

    expect(fetchMock).toHaveBeenCalledWith("/__mockdock/variants/variant-1/active-preset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ presetId: null })
    });
  });

  it("throws when a request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const service = TestBed.inject(MockdockApiService);

    await expect(service.getRoutes("missing")).rejects.toThrow(
      "Request failed: /__mockdock/workspaces/missing/routes"
    );
  });
});
