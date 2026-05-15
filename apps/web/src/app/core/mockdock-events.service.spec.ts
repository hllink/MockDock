import { describe, expect, it, vi } from "vitest";
import type { MockdockEvent } from "@mockdock/shared";

import { MockdockEventsService } from "./mockdock-events.service";

class FakeEventSource {
  static latest: FakeEventSource | null = null;

  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Set<(event: MessageEvent<string>) => void>>();

  constructor(public readonly url: string) {
    FakeEventSource.latest = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const listeners = this.listeners.get(type) ?? new Set<(event: MessageEvent<string>) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, data: unknown): void {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  close(): void {
    this.closed = true;
  }
}

describe("MockdockEventsService", () => {
  it("maps request_received events into a typed stream", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const service = new MockdockEventsService();
    const received = vi.fn<(event: MockdockEvent) => void>();
    const subscription = service.connect().subscribe(received);
    const source = FakeEventSource.latest;

    expect(source?.url).toBe("/__mockdock/events");

    source?.emit("request_received", {
      workspaceId: "w1",
      routePatternId: "r1",
      method: "GET",
      rawPath: "/users",
      normalizedPath: "/users",
      createdAt: "2026-05-15T00:00:00.000Z"
    });

    expect(received).toHaveBeenCalledWith({
      type: "request_received",
      payload: {
        workspaceId: "w1",
        routePatternId: "r1",
        method: "GET",
        rawPath: "/users",
        normalizedPath: "/users",
        createdAt: "2026-05-15T00:00:00.000Z"
      }
    });

    subscription.unsubscribe();
    expect(source?.closed).toBe(true);
  });

  it("maps route_pattern_updated events into a typed stream", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const received = vi.fn<(event: MockdockEvent) => void>();
    new MockdockEventsService().connect().subscribe(received);

    FakeEventSource.latest?.emit("route_pattern_updated", {
      workspaceId: "w1",
      routePatternId: "r1",
      pattern: "/users/:id",
      method: "PATCH",
      hitCount: 9,
      lastSeenAt: "2026-05-15T00:00:00.000Z"
    });

    expect(received).toHaveBeenCalledWith({
      type: "route_pattern_updated",
      payload: {
        workspaceId: "w1",
        routePatternId: "r1",
        pattern: "/users/:id",
        method: "PATCH",
        hitCount: 9,
        lastSeenAt: "2026-05-15T00:00:00.000Z"
      }
    });
  });

  it("maps response_preset_updated events into a typed stream", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const received = vi.fn<(event: MockdockEvent) => void>();
    new MockdockEventsService().connect().subscribe(received);

    FakeEventSource.latest?.emit("response_preset_updated", {
      routePatternId: "r1",
      presetId: "preset-1",
      action: "updated"
    });

    expect(received).toHaveBeenCalledWith({
      type: "response_preset_updated",
      payload: {
        routePatternId: "r1",
        presetId: "preset-1",
        action: "updated"
      }
    });
  });

  it("maps active_preset_changed events into a typed stream", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const received = vi.fn<(event: MockdockEvent) => void>();
    new MockdockEventsService().connect().subscribe(received);

    FakeEventSource.latest?.emit("active_preset_changed", {
      routePatternId: "r1",
      presetId: null
    });

    expect(received).toHaveBeenCalledWith({
      type: "active_preset_changed",
      payload: {
        routePatternId: "r1",
        presetId: null
      }
    });
  });

  it("surfaces SSE disconnects as stream errors", () => {
    vi.stubGlobal("EventSource", FakeEventSource);

    const service = new MockdockEventsService();
    const onError = vi.fn();

    service.connect().subscribe({
      next: vi.fn(),
      error: onError
    });

    FakeEventSource.latest?.onerror?.();

    expect(onError).toHaveBeenCalledWith(new Error("SSE disconnected"));
  });
});
