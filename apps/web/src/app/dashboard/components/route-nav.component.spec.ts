import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteNavComponent } from "./route-nav.component";
import { DashboardStore } from "../dashboard.store";

describe("RouteNavComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("normalizes context and submits route creation for the selected workspace", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new RouteNavComponent()) as any;
    const workspace = store.workspaceGroups()[0];

    component.openCreateRouteModal(workspace);
    component.updateCreateRouteMethod({
      target: { value: "POST" }
    } as Event);
    component.updateCreateRouteContextDraft({
      target: { value: "users/**" }
    } as Event);

    await component.submitCreateRoute({
      preventDefault: vi.fn()
    } as unknown as Event);

    expect(store.createRoute).toHaveBeenCalledWith("workspace-1", {
      method: "POST",
      pattern: "/users/**",
      examplePath: "/users/**"
    });
    expect(component.createRouteWorkspaceId()).toBeNull();
    expect(component.createRouteError()).toBeNull();
  });

  it("blocks invalid wildcard patterns and shows guidance", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new RouteNavComponent()) as any;
    component.openCreateRouteModal(store.workspaceGroups()[0]);
    component.updateCreateRouteContextDraft({
      target: { value: "/foo/**/bar" }
    } as Event);

    await component.submitCreateRoute({
      preventDefault: vi.fn()
    } as unknown as Event);

    expect(store.createRoute).not.toHaveBeenCalled();
    expect(component.createRouteError()).toContain("`**`");
  });
});

function createStoreStub() {
  const workspaceGroups = signal([
    {
      workspaceId: "workspace-1",
      slug: "demo",
      routeCount: 1,
      expanded: true,
      routes: [
        {
          anchorRouteId: "route-1",
          routeId: "route-1",
          method: "GET",
          pattern: "/hello",
          displayLabel: "/hello",
          hitCount: 1,
          memberRouteIds: ["route-1"],
          isWildcardRoute: false,
          tokens: []
        }
      ]
    }
  ]);

  return {
    routeSort: signal("recent"),
    bulkDeleteMode: signal(false),
    selectedBulkRouteIds: signal(new Set<string>()),
    workspaceGroups,
    unseenRouteIds: signal(new Set<string>()),
    selectedRouteView: signal(null),
    activeWorkspaceId: signal("workspace-1"),
    selectedRouteId: signal("route-1"),
    setRouteSort: vi.fn(),
    toggleWorkspaceExpanded: vi.fn(),
    selectWorkspace: vi.fn(),
    renameWorkspace: vi.fn(async () => undefined),
    createRoute: vi.fn(async () => undefined),
    moveWorkspace: vi.fn(),
    moveRoute: vi.fn(async () => undefined),
    selectRoute: vi.fn(async () => undefined),
    startBulkDeleteMode: vi.fn(),
    cancelBulkDeleteMode: vi.fn(),
    toggleBulkRouteSelection: vi.fn(),
    bulkDeleteSelectedRoutes: vi.fn(async () => undefined),
    deleteWorkspace: vi.fn(async () => undefined)
  };
}
