import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import type { MockdockEvent, MockdockEventType } from "@mockdock/shared";

export type MockdockEventMessage = {
  [K in MockdockEventType]: MockdockEvent<K>;
}[MockdockEventType];

@Injectable({ providedIn: "root" })
export class MockdockEventsService {
  connect(): Observable<MockdockEventMessage> {
    return new Observable<MockdockEventMessage>((subscriber) => {
      const source = new EventSource("/__mockdock/events");
      const forward = <T extends MockdockEventType>(type: T) => (event: MessageEvent<string>) => {
        subscriber.next({
          type,
          payload: JSON.parse(event.data)
        } as MockdockEventMessage);
      };

      source.addEventListener("request_received", forward("request_received"));
      source.addEventListener("route_pattern_updated", forward("route_pattern_updated"));
      source.addEventListener("response_preset_updated", forward("response_preset_updated"));
      source.addEventListener("active_preset_changed", forward("active_preset_changed"));
      source.onerror = () => subscriber.error(new Error("SSE disconnected"));

      return () => source.close();
    });
  }
}
