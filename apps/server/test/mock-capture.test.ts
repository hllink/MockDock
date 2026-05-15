import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createTestConfig } from "./helpers.js";

describe("mock capture", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      await apps.pop()?.close();
    }
  });

  it("captures a request and returns the default mock response", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/demo/api/v1/user/14/edit"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const workspaces = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    const workspace = workspaces.json()[0];

    const routes = await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    });

    expect(routes.statusCode).toBe(200);
    expect(routes.json()).toHaveLength(1);
    expect(routes.json()[0].route.pattern).toBe("/api/v1/user/14/edit");
    expect(routes.json()[0].activePreset).toMatchObject({
      isSystem: true,
      name: "Default",
      statusCode: 200,
      headers: {
        "content-type": "application/json"
      },
      body: {
        kind: "json",
        value: {
          ok: true
        }
      },
      delayMs: 0
    });

    const presets = await app.inject({
      method: "GET",
      url: `/__mockdock/routes/${routes.json()[0].route.id}/presets`
    });

    expect(presets.statusCode).toBe(200);
    expect(presets.json()).toHaveLength(1);
    expect(presets.json()[0].isSystem).toBe(true);
    expect(presets.json()[0].id).toBe(routes.json()[0].activePreset.id);
  });

  it("does not capture internal routes", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/__mockdock/health"
    });

    const workspaces = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });

    expect(workspaces.json()).toHaveLength(0);
  });

  it("moves a route into another workspace and removes the emptied source workspace", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const contasCaptureResponse = await app.inject({
      method: "GET",
      url: "/contas/api/v1/clientes"
    });
    expect(contasCaptureResponse.statusCode).toBe(200);

    const faturamentoCaptureResponse = await app.inject({
      method: "GET",
      url: "/faturamento/api/v1/faturas"
    });
    expect(faturamentoCaptureResponse.statusCode).toBe(200);

    const workspaceListResponse = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    expect(workspaceListResponse.statusCode).toBe(200);
    const workspaces = workspaceListResponse.json();
    const contasWorkspace = workspaces.find((workspace: { slug: string }) => workspace.slug === "contas");
    const faturamentoWorkspace = workspaces.find(
      (workspace: { slug: string }) => workspace.slug === "faturamento"
    );
    expect(contasWorkspace).toBeDefined();
    expect(faturamentoWorkspace).toBeDefined();

    const contasRoutesResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${contasWorkspace.id}/routes`
    });
    expect(contasRoutesResponse.statusCode).toBe(200);
    const route = contasRoutesResponse.json()[0];
    expect(route).toBeDefined();
    const routeId = route.route.id;

    const moveRouteResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/move`,
      payload: {
        destinationWorkspaceId: faturamentoWorkspace.id
      }
    });

    expect(moveRouteResponse.statusCode).toBe(200);
    expect(moveRouteResponse.json().workspaceId).toBe(faturamentoWorkspace.id);

    const updatedWorkspaceListResponse = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    expect(updatedWorkspaceListResponse.statusCode).toBe(200);

    expect(
      updatedWorkspaceListResponse.json().map((workspace: { slug: string }) => workspace.slug)
    ).toEqual(["faturamento"]);
  });

  it("deletes a route and removes the emptied workspace", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const captureResponse = await app.inject({
      method: "GET",
      url: "/contas/api/v1/clientes"
    });
    expect(captureResponse.statusCode).toBe(200);

    const workspaceListResponse = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    const workspace = workspaceListResponse.json()[0];
    expect(workspace).toBeDefined();

    const routesResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    });
    const routeId = routesResponse.json()[0].route.id;

    const deleteRouteResponse = await app.inject({
      method: "DELETE",
      url: `/__mockdock/routes/${routeId}`
    });
    expect(deleteRouteResponse.statusCode).toBe(204);

    const updatedWorkspaceListResponse = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    expect(updatedWorkspaceListResponse.json()).toEqual([]);
  });
});
