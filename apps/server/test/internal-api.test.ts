import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createTestConfig } from "./helpers.js";

describe("internal api", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    while (apps.length) {
      await apps.pop()?.close();
    }
  });

  it("applies an activated preset only to the exact literal route", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const firstRouteResponse = await app.inject({
      method: "GET",
      url: "/demo/api/v1/user/14/edit"
    });
    expect(firstRouteResponse.statusCode).toBe(200);

    const workspaceList = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    const workspace = workspaceList.json()[0];

    const routesResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    });
    const routeId = routesResponse.json()[0].route.id;

    const createResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/presets`,
      payload: {
        name: "Created",
        statusCode: 201,
        headers: {
          "content-type": "application/json"
        },
        body: {
          kind: "json",
          value: {
            created: true
          }
        },
        delayMs: 0
      }
    });

    expect(createResponse.statusCode).toBe(201);

    const presetId = createResponse.json().id;

    const activateResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/active-preset`,
      payload: {
        presetId
      }
    });

    expect(activateResponse.statusCode).toBe(200);

    const exactRouteResponse = await app.inject({
      method: "GET",
      url: "/demo/api/v1/user/14/edit"
    });

    expect(exactRouteResponse.statusCode).toBe(201);
    expect(exactRouteResponse.json()).toEqual({ created: true });

    const differentLiteralRouteResponse = await app.inject({
      method: "GET",
      url: "/demo/api/v1/user/99/edit"
    });

    expect(differentLiteralRouteResponse.statusCode).toBe(200);
    expect(differentLiteralRouteResponse.json()).toEqual({ ok: true });
  });

  it("serves binary preset payloads as decoded bytes", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/download"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const routeId = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route.id;

    const createResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/presets`,
      payload: {
        name: "Binary",
        statusCode: 200,
        headers: {
          "content-type": "application/octet-stream"
        },
        body: {
          kind: "binary",
          fileName: "payload.bin",
          mimeType: "application/octet-stream",
          base64: Buffer.from("mockdock", "utf8").toString("base64"),
          sizeBytes: 8
        },
        delayMs: 0
      }
    });

    await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/active-preset`,
      payload: {
        presetId: createResponse.json().id
      }
    });

    const binaryResponse = await app.inject({
      method: "GET",
      url: "/demo/download"
    });

    expect(binaryResponse.statusCode).toBe(200);
    expect(binaryResponse.headers["content-type"]).toContain("application/octet-stream");
    expect(binaryResponse.body).toBe("mockdock");
  });

  it("serves binary preset file metadata as response headers", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/preview"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const routeId = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route.id;

    const createResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/presets`,
      payload: {
        name: "Preview",
        statusCode: 200,
        headers: {
          "content-type": "application/octet-stream"
        },
        body: {
          kind: "binary",
          fileName: "preview.png",
          mimeType: "image/png",
          base64: Buffer.from("mockdock", "utf8").toString("base64"),
          sizeBytes: 8
        },
        delayMs: 0
      }
    });

    await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/active-preset`,
      payload: {
        presetId: createResponse.json().id
      }
    });

    const binaryResponse = await app.inject({
      method: "GET",
      url: "/demo/preview"
    });

    expect(binaryResponse.statusCode).toBe(200);
    expect(binaryResponse.headers["content-type"]).toContain("image/png");
    expect(binaryResponse.headers["content-disposition"]).toContain('filename="preview.png"');
  });

  it("accepts binary preset payloads larger than Fastify's default body limit", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/large-binary"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const routeId = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route.id;

    const twoMiBBase64 = Buffer.alloc(2 * 1024 * 1024, 7).toString("base64");
    const createResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/presets`,
      payload: {
        name: "Large Binary",
        statusCode: 200,
        headers: {
          "content-type": "application/octet-stream"
        },
        body: {
          kind: "binary",
          fileName: "large.bin",
          mimeType: "application/octet-stream",
          base64: twoMiBBase64,
          sizeBytes: 2 * 1024 * 1024
        },
        delayMs: 0
      }
    });

    expect(createResponse.statusCode).toBe(201);
  });

  it("rejects deleting the last preset for a variant", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/delete-guard"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const routeId = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route.id;

    const variantResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/variants`,
      payload: {
        querySignature: { view: "compact" },
        queryDisplay: "view=compact"
      }
    });
    expect(variantResponse.statusCode).toBe(201);

    const presetResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/variants/${variantResponse.json().id}/presets`,
      payload: {
        name: "Only preset",
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
      }
    });
    expect(presetResponse.statusCode).toBe(201);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/__mockdock/presets/${presetResponse.json().id}`
    });

    expect(deleteResponse.statusCode).toBe(409);
    expect(deleteResponse.json().message).toBe("At least one preset is required");
  });

  it("rejects deleting the system default preset after another preset is created", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/default-delete-guard"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const routeId = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route.id;

    const presetsResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/routes/${routeId}/presets`
    });
    expect(presetsResponse.statusCode).toBe(200);
    const defaultPresetId = presetsResponse.json()[0].id;

    const createResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${routeId}/presets`,
      payload: {
        name: "Fallback",
        statusCode: 200,
        headers: {
          "content-type": "application/json"
        },
        body: {
          kind: "json",
          value: {
            ok: false
          }
        },
        delayMs: 0
      }
    });
    expect(createResponse.statusCode).toBe(201);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/__mockdock/presets/${defaultPresetId}`
    });

    expect(deleteResponse.statusCode).toBe(409);
    expect(deleteResponse.json().message).toBe("Default preset cannot be deleted");
  });

  it("renames a workspace and captures subsequent requests under the renamed slug", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const firstCaptureResponse = await app.inject({
      method: "GET",
      url: "/contas/api/v1/clientes"
    });
    expect(firstCaptureResponse.statusCode).toBe(200);

    const initialWorkspaceListResponse = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    expect(initialWorkspaceListResponse.statusCode).toBe(200);
    const workspace = initialWorkspaceListResponse.json()[0];
    expect(workspace).toBeDefined();

    const renameWorkspaceResponse = await app.inject({
      method: "PATCH",
      url: `/__mockdock/workspaces/${workspace.id}`,
      payload: {
        slug: "financeiro"
      }
    });

    expect(renameWorkspaceResponse.statusCode).toBe(200);
    expect(renameWorkspaceResponse.json().slug).toBe("financeiro");

    const secondCaptureResponse = await app.inject({
      method: "GET",
      url: "/financeiro/api/v1/clientes"
    });
    expect(secondCaptureResponse.statusCode).toBe(200);

    const workspaceListResponse = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    expect(workspaceListResponse.statusCode).toBe(200);

    expect(workspaceListResponse.json().map((item: { slug: string }) => item.slug)).toEqual([
      "financeiro"
    ]);
  });

  it("rejects invalid workspace rename slugs", async () => {
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
    expect(workspaceListResponse.statusCode).toBe(200);
    const workspace = workspaceListResponse.json()[0];
    expect(workspace).toBeDefined();

    const renameWorkspaceResponse = await app.inject({
      method: "PATCH",
      url: `/__mockdock/workspaces/${workspace.id}`,
      payload: {
        slug: "Conta Nova"
      }
    });

    expect(renameWorkspaceResponse.statusCode).toBe(400);
    expect(renameWorkspaceResponse.json().message).toContain("slug");
  });

  it("preserves a distinct workspace name when only the slug is renamed", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const createWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/__mockdock/workspaces",
      payload: {
        name: "Finance Team",
        slug: "finance"
      }
    });
    expect(createWorkspaceResponse.statusCode).toBe(201);

    const workspace = createWorkspaceResponse.json();

    const renameWorkspaceResponse = await app.inject({
      method: "PATCH",
      url: `/__mockdock/workspaces/${workspace.id}`,
      payload: {
        slug: "financeiro"
      }
    });

    expect(renameWorkspaceResponse.statusCode).toBe(200);
    expect(renameWorkspaceResponse.json().slug).toBe("financeiro");
    expect(renameWorkspaceResponse.json().name).toBe("Finance Team");
  });

  it("returns 404 when deleting an unknown route", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const response = await app.inject({
      method: "DELETE",
      url: "/__mockdock/routes/missing-route"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Route not found");
  });

  it("creates a manual route for an existing workspace without capture side effects", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const createWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/__mockdock/workspaces",
      payload: {
        name: "Demo",
        slug: "demo"
      }
    });
    expect(createWorkspaceResponse.statusCode).toBe(201);
    const workspace = createWorkspaceResponse.json();

    const createRouteResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/workspaces/${workspace.id}/routes`,
      payload: {
        method: "POST",
        pattern: "/users/*"
      }
    });

    expect(createRouteResponse.statusCode).toBe(201);
    expect(createRouteResponse.json()).toMatchObject({
      workspaceId: workspace.id,
      method: "POST",
      pattern: "/users/*",
      examplePath: "/users/*",
      hitCount: 0
    });

    const routesResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    });
    expect(routesResponse.statusCode).toBe(200);
    expect(routesResponse.json()).toHaveLength(1);
    expect(routesResponse.json()[0].defaultVariant.querySignature).toBeNull();

    const requestsResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/routes/${createRouteResponse.json().id}/requests`
    });
    expect(requestsResponse.statusCode).toBe(200);
    expect(requestsResponse.json()).toEqual([]);
  });

  it("returns the existing route when manual creation is duplicated", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const createWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/__mockdock/workspaces",
      payload: {
        name: "Demo",
        slug: "demo"
      }
    });
    const workspace = createWorkspaceResponse.json();

    const firstCreateResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/workspaces/${workspace.id}/routes`,
      payload: {
        method: "GET",
        pattern: "/orders/**"
      }
    });
    expect(firstCreateResponse.statusCode).toBe(201);

    const secondCreateResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/workspaces/${workspace.id}/routes`,
      payload: {
        method: "GET",
        pattern: "/orders/**"
      }
    });

    expect(secondCreateResponse.statusCode).toBe(200);
    expect(secondCreateResponse.json().id).toBe(firstCreateResponse.json().id);
    expect(secondCreateResponse.json().hitCount).toBe(0);
  });

  it("rejects invalid manual route patterns", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const createWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/__mockdock/workspaces",
      payload: {
        name: "Demo",
        slug: "demo"
      }
    });
    const workspace = createWorkspaceResponse.json();

    const createRouteResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/workspaces/${workspace.id}/routes`,
      payload: {
        method: "GET",
        pattern: "/foo/**/bar"
      }
    });

    expect(createRouteResponse.statusCode).toBe(400);
    expect(createRouteResponse.json().message).toContain("invalid");
  });

  it("uses wildcard route variants when an exact observed route has no active response", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/foo/15/bar"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];

    const route = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route;

    const convertResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${route.id}/convert-segment`,
      payload: {
        index: 1,
        value: "*"
      }
    });
    expect(convertResponse.statusCode).toBe(200);
    expect(convertResponse.json().pattern).toBe("/foo/*/bar");

    const createPresetResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${route.id}/presets`,
      payload: {
        name: "Wildcard",
        statusCode: 202,
        headers: {
          "content-type": "application/json"
        },
        body: {
          kind: "json",
          value: {
            wildcard: true
          }
        },
        delayMs: 0
      }
    });
    const presetId = createPresetResponse.json().id;

    await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${route.id}/active-preset`,
      payload: {
        presetId
      }
    });

    const wildcardHit = await app.inject({
      method: "GET",
      url: "/demo/foo/99/bar"
    });
    expect(wildcardHit.statusCode).toBe(202);
    expect(wildcardHit.json()).toEqual({ wildcard: true });

    const requestsResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/routes/${route.id}/requests`
    });
    expect(requestsResponse.statusCode).toBe(200);
    expect(
      requestsResponse.json().map((entry: { normalizedPath: string }) => entry.normalizedPath)
    ).toEqual(expect.arrayContaining(["/foo/15/bar", "/foo/99/bar"]));
    expect(requestsResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalizedPath: "/foo/99/bar",
          responseStatusCode: 202,
          responseBody: { wildcard: true }
        })
      ])
    );
  });

  it("matches query variants by normalized exact query and falls back to the default route variant", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/search"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];

    const route = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route;

    const defaultPresetResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${route.id}/presets`,
      payload: {
        name: "Default",
        statusCode: 203,
        headers: {
          "content-type": "application/json"
        },
        body: {
          kind: "json",
          value: {
            variant: "default"
          }
        },
        delayMs: 0
      }
    });

    await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${route.id}/active-preset`,
      payload: {
        presetId: defaultPresetResponse.json().id
      }
    });

    const createVariantResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${route.id}/variants`,
      payload: {
        querySignature: {
          b: ["2", "3"],
          a: "1"
        },
        queryDisplay: "?a=1&b=2&b=3"
      }
    });
    expect(createVariantResponse.statusCode).toBe(201);
    const variantId = createVariantResponse.json().id;

    const createVariantPresetResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/variants/${variantId}/presets`,
      payload: {
        name: "Exact query",
        statusCode: 205,
        headers: {
          "content-type": "application/json"
        },
        body: {
          kind: "json",
          value: {
            variant: "query"
          }
        },
        delayMs: 0
      }
    });

    await app.inject({
      method: "POST",
      url: `/__mockdock/variants/${variantId}/active-preset`,
      payload: {
        presetId: createVariantPresetResponse.json().id
      }
    });

    const exactVariantResponse = await app.inject({
      method: "GET",
      url: "/demo/search?b=2&b=3&a=1"
    });
    expect(exactVariantResponse.statusCode).toBe(205);
    expect(exactVariantResponse.json()).toEqual({ variant: "query" });

    const fallbackResponse = await app.inject({
      method: "GET",
      url: "/demo/search?a=1&b=2"
    });
    expect(fallbackResponse.statusCode).toBe(203);
    expect(fallbackResponse.json()).toEqual({ variant: "default" });
  });

  it("deletes a saved query variant without deleting captured request history", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/variant-delete?mode=compact"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const route = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route;

    const variantResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${route.id}/variants`,
      payload: {
        querySignature: { mode: "compact" },
        queryDisplay: "?mode=compact"
      }
    });
    expect(variantResponse.statusCode).toBe(201);
    const variantId = variantResponse.json().id;

    const presetResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/variants/${variantId}/presets`,
      payload: {
        name: "Compact",
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: { kind: "json", value: { compact: true } },
        delayMs: 0
      }
    });
    expect(presetResponse.statusCode).toBe(201);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/__mockdock/variants/${variantId}`
    });
    expect(deleteResponse.statusCode).toBe(204);

    const variantsResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/routes/${route.id}/variants`
    });
    expect(variantsResponse.statusCode).toBe(200);
    expect(variantsResponse.json().some((variant: { id: string }) => variant.id === variantId)).toBe(false);

    const requestsResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/routes/${route.id}/requests`
    });
    expect(requestsResponse.statusCode).toBe(200);
    expect(requestsResponse.json()).toHaveLength(1);
  });

  it("rejects deleting the default query variant", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({
      method: "GET",
      url: "/demo/default-variant-delete"
    });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const route = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json()[0].route;
    const defaultVariant = (await app.inject({
      method: "GET",
      url: `/__mockdock/routes/${route.id}/variants`
    })).json().find((variant: { querySignature: unknown }) => variant.querySignature === null);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/__mockdock/variants/${defaultVariant.id}`
    });

    expect(deleteResponse.statusCode).toBe(400);
    expect(deleteResponse.json().message).toBe("Default route response cannot be deleted");
  });

  it("bulk deletes routes and removes emptied workspaces", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({ method: "GET", url: "/demo/bulk-one" });
    await app.inject({ method: "GET", url: "/demo/bulk-two" });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const routes = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json();
    const routeIds = routes.map((item: { route: { id: string } }) => item.route.id);

    const deleteResponse = await app.inject({
      method: "POST",
      url: "/__mockdock/routes/bulk-delete",
      payload: { routeIds }
    });

    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().deletedRouteIds.sort()).toEqual([...routeIds].sort());
    expect(deleteResponse.json().deletedWorkspaceIds).toEqual([workspace.id]);

    const workspacesResponse = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    expect(workspacesResponse.json()).toHaveLength(0);
  });

  it("hard deletes a workspace with its routes and logs", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({ method: "GET", url: "/demo/workspace-delete-one" });
    await app.inject({ method: "GET", url: "/demo/workspace-delete-two?mode=full" });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const routes = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json();
    expect(routes).toHaveLength(2);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/__mockdock/workspaces/${workspace.id}`
    });
    expect(deleteResponse.statusCode).toBe(204);

    const routesResponse = await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    });
    expect(routesResponse.statusCode).toBe(404);

    const workspacesResponse = await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    });
    expect(workspacesResponse.json()).toHaveLength(0);
  });

  it("returns 404 when deleting an unknown workspace", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/__mockdock/workspaces/missing-workspace"
    });

    expect(deleteResponse.statusCode).toBe(404);
    expect(deleteResponse.json().message).toBe("Workspace not found");
  });

  it("bumps the serving wildcard route recency when a captured literal falls through to it", async () => {
    const app = await buildApp(createTestConfig());
    apps.push(app);

    await app.inject({ method: "GET", url: "/demo/hello/aff4" });
    await app.inject({ method: "GET", url: "/demo/hello/beta" });

    const workspace = (await app.inject({
      method: "GET",
      url: "/__mockdock/workspaces"
    })).json()[0];
    const routes = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json();
    const anchorRoute = routes.find(
      (item: { route: { pattern: string } }) => item.route.pattern === "/hello/aff4"
    )?.route;

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/__mockdock/routes/${anchorRoute.id}/pattern`,
      payload: {
        pattern: "/hello/**"
      }
    });
    expect(updateResponse.statusCode).toBe(200);

    const presetResponse = await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${anchorRoute.id}/presets`,
      payload: {
        name: "Wildcard",
        statusCode: 202,
        headers: { "content-type": "application/json" },
        body: { kind: "json", value: { wildcard: true } },
        delayMs: 0
      }
    });
    await app.inject({
      method: "POST",
      url: `/__mockdock/routes/${anchorRoute.id}/active-preset`,
      payload: { presetId: presetResponse.json().id }
    });

    const beforeHitRoutes = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json();
    const wildcardRouteBefore = beforeHitRoutes.find(
      (item: { route: { pattern: string } }) => item.route.pattern === "/hello/**"
    );
    expect(wildcardRouteBefore).toBeDefined();
    const wildcardHitCountBefore = wildcardRouteBefore.route.hitCount;

    await app.inject({
      method: "GET",
      url: "/demo/hello/test"
    });

    const afterHitRoutes = (await app.inject({
      method: "GET",
      url: `/__mockdock/workspaces/${workspace.id}/routes`
    })).json();

    expect(afterHitRoutes[0].route.pattern).toBe("/hello/**");
    expect(afterHitRoutes[0].route.hitCount).toBe(wildcardHitCountBefore + 1);
    expect(afterHitRoutes[1].route.pattern).toBe("/hello/test");
  });
});
