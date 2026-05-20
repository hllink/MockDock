import { TestBed } from "@angular/core/testing";
import { computed, signal } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppComponent } from "./app.component";
import { MOCKDOCK_VERSION } from "./core/app-version";
import { DashboardStore } from "./dashboard/dashboard.store";

describe("AppComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it("initializes the dashboard store from the app shell", () => {
    const store = createStoreStub();

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new AppComponent());
    component.ngOnInit();

    expect(store.initialize).toHaveBeenCalledOnce();
  });

  it("exposes the build-time app version", () => {
    const store = createStoreStub();

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new AppComponent()) as any;

    expect(component.appVersion).toBe(MOCKDOCK_VERSION);
  });

  it("mirrors the empty-state visibility from the store", async () => {
    const store = createStoreStub();
    store.isTrafficEmptyStateVisible.set(true);

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new AppComponent()) as any;
    await flushEffects();

    expect(component.showEmptyState()).toBe(true);
  });

  it("keeps the blocking overlay visible for at least 1000ms", async () => {
    vi.useFakeTimers();
    const store = createStoreStub();

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new AppComponent()) as any;

    store.userSyncState.set("syncing");
    await flushEffects();
    expect(component.overlayVisible()).toBe(true);
    expect(component.overlayVariant()).toBe("loading");

    store.userSyncState.set("saved");
    await flushEffects();
    await vi.advanceTimersByTimeAsync(700);
    expect(component.overlayVisible()).toBe(true);
    expect(component.overlayFading()).toBe(false);

    await vi.advanceTimersByTimeAsync(300);
    expect(component.overlayVisible()).toBe(true);
    expect(component.overlayFading()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(component.overlayVisible()).toBe(false);
    expect(component.overlayFading()).toBe(false);
  });

  it("switches the overlay copy to saving when editor sync is active", async () => {
    const store = createStoreStub();

    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new AppComponent()) as any;

    store.editorSyncState.set("syncing");
    await flushEffects();

    expect(component.overlayVisible()).toBe(true);
    expect(component.overlayVariant()).toBe("saving");
  });
});

function createStoreStub() {
  const syncState = signal<"idle" | "syncing" | "saved" | "error">("idle");
  const editorSyncState = signal<"idle" | "syncing" | "saved" | "error">("idle");
  const userSyncState = signal<"idle" | "syncing" | "saved" | "error">("idle");
  const isTrafficEmptyStateVisible = signal(false);
  const initialHydrationComplete = signal(true);

  return {
    initialize: vi.fn(async () => undefined),
    syncState,
    editorSyncState,
    userSyncState,
    isTrafficEmptyStateVisible,
    initialHydrationComplete,
    isBlockingOverlayVisible: computed(
      () =>
        !initialHydrationComplete() ||
        userSyncState() === "syncing" ||
        editorSyncState() === "syncing"
    )
  };
}

async function flushEffects(): Promise<void> {
  TestBed.flushEffects();
  await Promise.resolve();
  await Promise.resolve();
}
