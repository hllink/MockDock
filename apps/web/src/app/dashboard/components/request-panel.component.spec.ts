import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RequestPanelComponent } from "./request-panel.component";
import { DashboardStore } from "../dashboard.store";

describe("RequestPanelComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it("shows a toast after copying the selected route URL", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText }
    });

    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new RequestPanelComponent()) as any;

    await component.copyRequestUrl();

    expect(writeText).toHaveBeenCalledWith("http://localhost:52052/demo/users/*");
    expect(component.copyToastVisible()).toBe(true);

    vi.advanceTimersByTime(1800);

    expect(component.copyToastVisible()).toBe(false);
    vi.useRealTimers();
  });
});

function createStoreStub() {
  const selectedRouteView = signal({
    method: "GET",
    pattern: "/users/*",
    hitCount: 3,
    memberRouteIds: ["route-1"],
    isWildcardRoute: false
  });
  const selectedRoute = signal({
    route: {
      id: "route-1",
      workspaceId: "workspace-1",
      pattern: "/users/*"
    }
  });
  const workspaceGroups = signal([
    {
      workspaceId: "workspace-1",
      slug: "demo",
      routeCount: 1,
      expanded: true,
      routes: []
    }
  ]);
  const selectedRouteRequests = signal([]);

  return {
    selectedRouteView,
    selectedRoute,
    workspaceGroups,
    selectedRouteRequests,
    selectedRequestId: signal<string | null>(null),
    selectedVariantOptions: signal([]),
    selectedVariantKey: signal("default"),
    selectedRouteId: signal("route-1"),
    selectVariant: vi.fn(),
    deleteRoute: vi.fn(async () => undefined)
  };
}
