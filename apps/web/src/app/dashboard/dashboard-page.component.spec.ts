import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";

import routeNavTemplate from "./components/route-nav.component.html?raw";
import { DashboardStore } from "./dashboard.store";
import dashboardPageTemplate from "./dashboard-page.component.html?raw";
import { DashboardPageComponent } from "./dashboard-page.component";

describe("DashboardPageComponent", () => {
  it("wires route navigation, request detail, and response editor regions", () => {
    expect(dashboardPageTemplate).toContain("<app-route-nav");
    expect(dashboardPageTemplate).toContain("<app-request-panel");
    expect(dashboardPageTemplate).toContain("<app-response-editor");
    expect(dashboardPageTemplate).toContain("pane-splitter");
    expect(dashboardPageTemplate).toContain("--nav-pane-width");
    expect(dashboardPageTemplate).toContain("pane-splitter pane-splitter-nav");
    expect(dashboardPageTemplate).toContain("startNavRequestResize");
    expect(dashboardPageTemplate).toContain("startRequestResponseResize");
    expect(dashboardPageTemplate).toContain("workspace-chrome");
    expect(routeNavTemplate).toContain("route-relative-path");
    expect(routeNavTemplate).toContain("workspace-add-action");
    expect(routeNavTemplate).toContain("routeNav.showQuickStart");
    expect(routeNavTemplate).toContain("ambient.starterAddress");
    expect(routeNavTemplate).toContain("starterRequestUrl()");
  });

  it("initializes the dashboard store from the page container", () => {
    const store = {
      initialize: vi.fn(async () => undefined),
      bulkDeleteMode: vi.fn(() => false)
    };

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new DashboardPageComponent());
    component.ngOnInit();

    expect(store.initialize).not.toHaveBeenCalled();
  });

  it("restores the saved nav/request and request/response split on init", () => {
    const store = {
      initialize: vi.fn(async () => undefined),
      bulkDeleteMode: vi.fn(() => false)
    };
    const localStorageMock = {
      getItem: vi.fn((key: string) => {
        if (key === "mockdock.dashboard.navPaneWidth") {
          return "32";
        }

        if (key === "mockdock.dashboard.requestPaneWidth") {
          return "56";
        }

        return null;
      }),
      setItem: vi.fn()
    };

    vi.stubGlobal("localStorage", localStorageMock);

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new DashboardPageComponent());
    component.ngOnInit();

    expect((component as any).navPaneWidth()).toBe(32);
    expect((component as any).requestPaneWidth()).toBe(56);
  });

  it("clamps and persists resized nav/request widths", () => {
    const store = {
      initialize: vi.fn(async () => undefined),
      bulkDeleteMode: vi.fn(() => false)
    };
    const localStorageMock = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    };

    vi.stubGlobal("localStorage", localStorageMock);

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new DashboardPageComponent()) as any;

    component.resizeNavRequest(12);
    expect(component.navPaneWidth()).toBe(18);

    component.resizeNavRequest(48);
    expect(component.navPaneWidth()).toBe(36);
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith("mockdock.dashboard.navPaneWidth", "36");
  });

  it.each([
    ["startNavRequestResize"],
    ["startRequestResponseResize"]
  ])(
    "tears down resize listeners when %s receives pointercancel",
    (methodName) => {
      const store = {
        initialize: vi.fn(async () => undefined),
        bulkDeleteMode: vi.fn(() => false)
      };
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      TestBed.configureTestingModule({
        providers: [{ provide: DashboardStore, useValue: store }]
      });

      const component = TestBed.runInInjectionContext(
        () => new DashboardPageComponent()
      ) as any;
      const preventDefault = vi.fn();

      component[methodName]({ preventDefault } as PointerEvent);

      const pointerCancelCall = addEventListenerSpy.mock.calls.find(
        ([eventName]) => eventName === "pointercancel"
      );

      expect(pointerCancelCall).toBeDefined();

      const pointerCancelHandler = pointerCancelCall?.[1] as EventListener;
      pointerCancelHandler(new Event("pointercancel"));

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointermove",
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointerup",
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "pointercancel",
        expect.any(Function)
      );
    }
  );
});
