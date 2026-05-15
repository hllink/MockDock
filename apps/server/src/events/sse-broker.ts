import type { MockdockEvent } from "@mockdock/shared";

export type EventListener = (event: MockdockEvent) => void;

export interface SseBroker {
  publish(event: MockdockEvent): void;
  subscribe(listener: EventListener): () => void;
}

export function createSseBroker(): SseBroker {
  const listeners = new Set<EventListener>();

  return {
    publish(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
