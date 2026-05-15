import { afterEach, describe, expect, it, vi } from "vitest";

import { createSseBroker } from "../src/events/sse-broker.js";
import { createDatabaseClient } from "../src/db/client.js";
import { bootstrapDatabase } from "../src/db/bootstrap.js";
import { PresetRepository } from "../src/repositories/preset-repository.js";
import { RequestLogRepository } from "../src/repositories/request-log-repository.js";
import { RouteRepository } from "../src/repositories/route-repository.js";
import { WorkspaceRepository } from "../src/repositories/workspace-repository.js";
import { MockRequestService } from "../src/services/mock-request-service.js";

describe("events and retention", () => {
  const clients: Array<ReturnType<typeof createDatabaseClient>> = [];

  afterEach(() => {
    vi.useRealTimers();
    while (clients.length) {
      void clients.pop()?.close();
    }
  });

  it("emits request_received when a mock request arrives", async () => {
    const client = createDatabaseClient(":memory:");
    clients.push(client);
    await bootstrapDatabase(client);

    const broker = createSseBroker();
    const eventSpy = vi.fn();
    broker.subscribe(eventSpy);

    const service = new MockRequestService(
      new WorkspaceRepository(client),
      new RouteRepository(client),
      new RequestLogRepository(client),
      new PresetRepository(client),
      broker
    );

    await service.handle({
      method: "GET",
      rawPath: "/demo/api/v1/user/14/edit",
      query: {},
      headers: {},
      body: null,
      ip: "127.0.0.1"
    });

    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "request_received",
        payload: expect.objectContaining({
          normalizedPath: "/api/v1/user/14/edit"
        })
      })
    );
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "route_pattern_updated",
        payload: expect.objectContaining({
          pattern: "/api/v1/user/14/edit"
        })
      })
    );
  });

  it("prunes old logs beyond the workspace limit", async () => {
    const client = createDatabaseClient(":memory:");
    clients.push(client);
    await bootstrapDatabase(client);

    const workspaceRepository = new WorkspaceRepository(client);
    const routeRepository = new RouteRepository(client);
    const requestLogRepository = new RequestLogRepository(client);
    const workspace = await workspaceRepository.create({ name: "demo", slug: "demo" });
    const route = await routeRepository.findOrCreate({
      workspaceId: workspace.id,
      method: "GET",
      pattern: "/api/v1/demo",
      examplePath: "/api/v1/demo"
    });

    for (let index = 0; index < 5002; index += 1) {
      await requestLogRepository.create({
        workspaceId: workspace.id,
        routePatternId: route.id,
        method: "GET",
        rawPath: `/demo/api/v1/${index}`,
        normalizedPath: `/api/v1/${index}`,
        query: {},
        headers: {},
        body: null,
        ip: "127.0.0.1",
        responseStatusCode: 200,
        responseBody: { ok: true }
      });
    }

    await requestLogRepository.pruneWorkspaceLogs(workspace.id, 5000);

    expect(await requestLogRepository.countByWorkspace(workspace.id)).toBe(5000);
  });

  it("waits for the configured preset delay before returning the mock response", async () => {
    vi.useFakeTimers();

    const client = createDatabaseClient(":memory:");
    clients.push(client);
    await bootstrapDatabase(client);

    const workspaceRepository = new WorkspaceRepository(client);
    const routeRepository = new RouteRepository(client);
    const presetRepository = new PresetRepository(client);
    const service = new MockRequestService(
      workspaceRepository,
      routeRepository,
      new RequestLogRepository(client),
      presetRepository,
      createSseBroker()
    );

    const workspace = await workspaceRepository.create({ name: "demo", slug: "demo" });
    const route = await routeRepository.createManual({
      workspaceId: workspace.id,
      method: "GET",
      pattern: "/users",
      examplePath: "/users"
    });
    const defaultVariant = await routeRepository.getDefaultVariant(route.route.id);

    expect(defaultVariant).not.toBeNull();

    const preset = await presetRepository.create(defaultVariant!.id, {
      name: "Slow",
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: { kind: "json", value: { ok: true } },
      delayMs: 1500
    });
    await routeRepository.setActivePresetForVariant(defaultVariant!.id, preset.id);

    let resolved = false;
    const responsePromise = service.handle({
      method: "GET",
      rawPath: "/demo/users",
      query: {},
      headers: {},
      body: null,
      ip: "127.0.0.1"
    }).then((response) => {
      resolved = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(1499);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;

    expect(resolved).toBe(true);
    expect(response).toMatchObject({
      statusCode: 200,
      body: { ok: true }
    });
  });
});
