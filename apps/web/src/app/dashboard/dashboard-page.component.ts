import { DOCUMENT } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import type { OnDestroy, OnInit } from "@angular/core";

import { I18nService } from "../core/i18n/i18n.service";
import { RequestPanelComponent } from "./components/request-panel.component";
import { ResponseEditorComponent } from "./components/response-editor.component";
import { RouteNavComponent } from "./components/route-nav.component";
import { DashboardStore } from "./dashboard.store";

@Component({
  selector: "app-dashboard-page",
  standalone: true,
  imports: [RouteNavComponent, RequestPanelComponent, ResponseEditorComponent],
  templateUrl: "./dashboard-page.component.html",
  styleUrl: "./dashboard-page.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  private static readonly navPaneWidthStorageKey = "mockdock.dashboard.navPaneWidth";
  private static readonly requestPaneWidthStorageKey = "mockdock.dashboard.requestPaneWidth";
  private static readonly minNavPaneWidth = 18;
  private static readonly maxNavPaneWidth = 36;
  private static readonly minRequestPaneWidth = 30;
  private static readonly maxRequestPaneWidth = 70;

  private readonly document = inject(DOCUMENT);
  protected readonly i18n = inject(I18nService);
  protected readonly store = inject(DashboardStore);

  protected readonly navPaneWidth = signal(26);
  protected readonly requestPaneWidth = signal(50);
  protected readonly responsePaneWidth = signal(50);

  private removePointerMoveListener: (() => void) | null = null;
  private removePointerUpListener: (() => void) | null = null;
  private removePointerCancelListener: (() => void) | null = null;

  ngOnInit(): void {
    this.restorePaneWidths();
  }

  ngOnDestroy(): void {
    this.stopResizing();
  }

  protected startNavRequestResize(event: PointerEvent): void {
    event.preventDefault();
    this.stopResizing();

    const moveHandler = (moveEvent: PointerEvent) => {
      const nextWidth = this.getNavPaneWidthFromPointer(moveEvent.clientX);
      if (nextWidth === null) {
        return;
      }

      this.resizeNavRequest(nextWidth);
    };
    const upHandler = () => this.stopResizing();
    const cancelHandler = () => this.stopResizing();

    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler, { once: true });
    window.addEventListener("pointercancel", cancelHandler, { once: true });

    this.removePointerMoveListener = () => window.removeEventListener("pointermove", moveHandler);
    this.removePointerUpListener = () => window.removeEventListener("pointerup", upHandler);
    this.removePointerCancelListener = () =>
      window.removeEventListener("pointercancel", cancelHandler);
  }

  protected startRequestResponseResize(event: PointerEvent): void {
    event.preventDefault();
    this.stopResizing();

    const moveHandler = (moveEvent: PointerEvent) => {
      const nextWidth = this.getRequestPaneWidthFromPointer(moveEvent.clientX);
      if (nextWidth === null) {
        return;
      }

      this.resizeRequestResponse(nextWidth);
    };
    const upHandler = () => this.stopResizing();
    const cancelHandler = () => this.stopResizing();

    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler, { once: true });
    window.addEventListener("pointercancel", cancelHandler, { once: true });

    this.removePointerMoveListener = () => window.removeEventListener("pointermove", moveHandler);
    this.removePointerUpListener = () => window.removeEventListener("pointerup", upHandler);
    this.removePointerCancelListener = () =>
      window.removeEventListener("pointercancel", cancelHandler);
  }

  protected resizeRequestResponse(nextRequestPaneWidth: number): void {
    const clampedWidth = this.clampRequestPaneWidth(nextRequestPaneWidth);
    this.requestPaneWidth.set(clampedWidth);
    this.responsePaneWidth.set(100 - clampedWidth);
    this.persistRequestPaneWidth(clampedWidth);
  }

  protected resizeNavRequest(nextNavPaneWidth: number): void {
    const clampedWidth = this.clampNavPaneWidth(nextNavPaneWidth);
    this.navPaneWidth.set(clampedWidth);
    this.persistNavPaneWidth(clampedWidth);
  }

  private restorePaneWidths(): void {
    const savedNavWidth = this.readStoredNavPaneWidth();
    const savedRequestWidth = this.readStoredRequestPaneWidth();
    this.navPaneWidth.set(savedNavWidth);
    this.requestPaneWidth.set(savedRequestWidth);
    this.responsePaneWidth.set(100 - savedRequestWidth);
  }

  private readStoredNavPaneWidth(): number {
    const rawValue = this.readStorage(DashboardPageComponent.navPaneWidthStorageKey);
    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue)) {
      return 26;
    }

    return this.clampNavPaneWidth(parsedValue);
  }

  private persistNavPaneWidth(navPaneWidth: number): void {
    this.writeStorage(
      DashboardPageComponent.navPaneWidthStorageKey,
      String(navPaneWidth)
    );
  }

  private readStoredRequestPaneWidth(): number {
    const rawValue = this.readStorage(
      DashboardPageComponent.requestPaneWidthStorageKey
    );
    const parsedValue = Number(rawValue);

    if (!Number.isFinite(parsedValue)) {
      return 50;
    }

    return this.clampRequestPaneWidth(parsedValue);
  }

  private persistRequestPaneWidth(requestPaneWidth: number): void {
    this.writeStorage(
      DashboardPageComponent.requestPaneWidthStorageKey,
      String(requestPaneWidth)
    );
  }

  private getNavPaneWidthFromPointer(clientX: number): number | null {
    const dashboard = this.document.querySelector<HTMLElement>(".dashboard");
    const navPane = this.document.querySelector<HTMLElement>(".pane-nav");
    if (!dashboard || !navPane) {
      return null;
    }

    const dashboardRect = dashboard.getBoundingClientRect();
    const navRect = navPane.getBoundingClientRect();
    if (dashboardRect.width <= 0) {
      return null;
    }

    return ((clientX - navRect.left) / dashboardRect.width) * 100;
  }

  private getRequestPaneWidthFromPointer(clientX: number): number | null {
    const requestPane = this.document.querySelector<HTMLElement>(".pane-request");
    const responsePane = this.document.querySelector<HTMLElement>(".pane-response");
    if (!requestPane || !responsePane) {
      return null;
    }

    const requestRect = requestPane.getBoundingClientRect();
    const responseRect = responsePane.getBoundingClientRect();
    const totalWidth = responseRect.right - requestRect.left;
    if (totalWidth <= 0) {
      return null;
    }

    return ((clientX - requestRect.left) / totalWidth) * 100;
  }

  private clampNavPaneWidth(width: number): number {
    return Math.min(
      DashboardPageComponent.maxNavPaneWidth,
      Math.max(DashboardPageComponent.minNavPaneWidth, Math.round(width))
    );
  }

  private clampRequestPaneWidth(width: number): number {
    return Math.min(
      DashboardPageComponent.maxRequestPaneWidth,
      Math.max(DashboardPageComponent.minRequestPaneWidth, Math.round(width))
    );
  }

  private stopResizing(): void {
    this.removePointerMoveListener?.();
    this.removePointerUpListener?.();
    this.removePointerCancelListener?.();
    this.removePointerMoveListener = null;
    this.removePointerUpListener = null;
    this.removePointerCancelListener = null;
  }

  private readStorage(key: string): string | null {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
      }
    } catch {
      // Ignore storage failures to keep the dashboard usable in restricted contexts.
    }
  }
}
