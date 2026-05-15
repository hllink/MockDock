import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import type { OnDestroy } from "@angular/core";
import type { RequestLogDto } from "@mockdock/shared";

import { I18nService } from "../../core/i18n/i18n.service";
import { DashboardStore } from "../dashboard.store";

@Component({
  selector: "app-request-panel",
  standalone: true,
  templateUrl: "./request-panel.component.html",
  styleUrl: "./request-panel.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RequestPanelComponent implements OnDestroy {
  private static readonly mockServerBaseUrl = "http://localhost:52052";

  protected readonly i18n = inject(I18nService);
  protected readonly store = inject(DashboardStore);
  protected readonly deleteConfirmOpen = signal(false);
  protected readonly deleteVariantConfirmOpen = signal(false);
  protected readonly deleteVariantTargetId = signal<string | null>(null);
  protected readonly selectedHistoryRequest = signal<RequestLogDto | null>(null);
  protected readonly copyToastVisible = signal(false);

  private copyToastTimeoutId: number | null = null;

  ngOnDestroy(): void {
    if (this.copyToastTimeoutId !== null) {
      window.clearTimeout(this.copyToastTimeoutId);
      this.copyToastTimeoutId = null;
    }
  }

  protected readonly selectedRouteMethod = computed(() => this.store.selectedRouteView()?.method ?? null);
  protected readonly selectedRoutePattern = computed(
    () => this.store.selectedRouteView()?.pattern ?? this.i18n.t("requestPanel.noRouteSelected")
  );
  protected readonly selectedRouteHitCount = computed(() => this.store.selectedRouteView()?.hitCount ?? 0);
  protected readonly selectedRequestPath = computed(() => this.selectedRequest()?.rawPath ?? "");
  protected readonly selectedRouteCopyUrl = computed(() => {
    const selectedRoute = this.store.selectedRoute();
    if (!selectedRoute) {
      return "";
    }

    const workspaceGroup = this.store
      .workspaceGroups()
      .find((group) => group.workspaceId === selectedRoute.route.workspaceId);
    if (!workspaceGroup) {
      return "";
    }

    const routePath = selectedRoute.route.pattern === "/"
      ? ""
      : selectedRoute.route.pattern;
    return `${RequestPanelComponent.mockServerBaseUrl}/${workspaceGroup.slug}${routePath}`;
  });
  protected readonly memberCountLabel = computed(() => {
    const routeView = this.store.selectedRouteView();
    if (!routeView) {
      return "";
    }

    const memberCount = routeView.memberRouteIds.length;
    return routeView.isWildcardRoute && memberCount > 1
      ? this.i18n.t("requestPanel.wildcardRule", { count: this.i18n.formatNumber(memberCount) })
      : this.i18n.t("requestPanel.exactRouteRule");
  });

  protected readonly selectedRequest = computed<RequestLogDto | null>(() => {
    const requests = this.store.selectedRouteRequests();
    if (requests.length === 0) {
      return null;
    }

    const selectedRequestId = this.store.selectedRequestId();
    if (selectedRequestId) {
      return requests.find((request) => request.id === selectedRequestId) ?? null;
    }

    return requests[0] ?? null;
  });

  protected readonly emptyStateMessage = computed(() => {
    if (!this.store.selectedRouteView()) {
      return this.i18n.t("requestPanel.selectRoute");
    }

    return this.i18n.t("requestPanel.sendTraffic");
  });
  protected readonly variantOptions = computed(() => this.store.selectedVariantOptions());
  protected readonly selectedVariantKey = computed(() => this.store.selectedVariantKey());
  protected readonly recentRequests = computed(() => this.store.selectedRouteRequests().slice(0, 6));
  protected readonly latestCapturedAt = computed(
    () => this.formatTimestamp(this.recentRequests()[0]?.createdAt) || this.i18n.t("requestPanel.noTrafficYet")
  );
  protected readonly latestCapturedPath = computed(
    () => this.recentRequests()[0]?.rawPath ?? this.i18n.t("requestPanel.noTrafficYet")
  );
  protected readonly latestResponseStatus = computed(() => {
    const latestStatus = this.recentRequests()[0]?.responseStatusCode;
    return latestStatus ? String(latestStatus) : this.i18n.t("requestPanel.noResponseYet");
  });
  protected readonly canCopyRequestPath = computed(
    () =>
      !!this.selectedRouteCopyUrl() &&
      typeof navigator !== "undefined" &&
      !!navigator.clipboard?.writeText
  );

  protected selectVariant(selectionKey: string): void {
    this.store.selectVariant(selectionKey);
  }

  protected async copyRequestUrl(): Promise<void> {
    const value = this.selectedRouteCopyUrl();
    if (!value || !this.canCopyRequestPath()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      this.copyToastVisible.set(true);
      if (this.copyToastTimeoutId !== null) {
        window.clearTimeout(this.copyToastTimeoutId);
      }
      this.copyToastTimeoutId = window.setTimeout(() => {
        this.copyToastVisible.set(false);
        this.copyToastTimeoutId = null;
      }, 1800);
    } catch {
      // Ignore clipboard failures in unsupported or restricted contexts.
    }
  }

  protected openDeleteConfirm(): void {
    if (!this.store.selectedRouteView()) {
      return;
    }

    this.deleteConfirmOpen.set(true);
  }

  protected closeDeleteConfirm(): void {
    this.deleteConfirmOpen.set(false);
  }

  protected openDeleteVariantConfirm(variantId: string | null, event: Event): void {
    event.stopPropagation();
    if (!variantId) {
      return;
    }

    this.deleteVariantTargetId.set(variantId);
    this.deleteVariantConfirmOpen.set(true);
  }

  protected closeDeleteVariantConfirm(): void {
    this.deleteVariantConfirmOpen.set(false);
    this.deleteVariantTargetId.set(null);
  }

  protected canDeleteVariant(variantId: string | null, selectionKey: string): boolean {
    return !!variantId && selectionKey !== "default";
  }

  protected openHistoryRequest(request: RequestLogDto): void {
    this.selectedHistoryRequest.set(request);
  }

  protected closeHistoryRequest(): void {
    this.selectedHistoryRequest.set(null);
  }

  protected hitCountLabel(hitCount: number): string {
    return this.i18n.t("common.hitCount", {
      count: this.i18n.formatNumber(hitCount),
      suffix: this.i18n.pluralSuffix(hitCount)
    });
  }

  protected requestCountLabel(requestCount: number): string {
    return this.i18n.t("common.requestCount", {
      count: this.i18n.formatNumber(requestCount),
      suffix: this.i18n.pluralSuffix(requestCount)
    });
  }

  protected variantMeta(saved: boolean, requestCount: number): string {
    return `${saved ? this.i18n.t("requestPanel.savedVariant") : this.i18n.t("requestPanel.capturedVariant")} · ${this.requestCountLabel(requestCount)}`;
  }

  protected formatTimestamp(value: string | null | undefined): string {
    if (!value) {
      return "";
    }

    return this.i18n.formatDateTime(value);
  }

  protected formatJson(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  protected deleteSelectedRoute(): void {
    const routeId = this.store.selectedRouteId();
    if (!routeId) {
      return;
    }

    this.deleteConfirmOpen.set(false);
    void this.store.deleteRoute(routeId).catch(() => undefined);
  }

  protected deleteSelectedVariant(): void {
    const variantId = this.deleteVariantTargetId();
    if (!variantId) {
      return;
    }

    this.closeDeleteVariantConfirm();
    void this.store.deleteVariant(variantId).catch(() => undefined);
  }
}
