import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from "@angular/core";
import type { OnDestroy, OnInit } from "@angular/core";

import {
  AmbientStateComponent,
  type AmbientStateVariant
} from "./ambient-state/ambient-state.component";
import { DashboardPageComponent } from "./dashboard/dashboard-page.component";
import { DashboardStore } from "./dashboard/dashboard.store";
import { LanguageSwitcherComponent } from "./language-switcher/language-switcher.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [DashboardPageComponent, AmbientStateComponent, LanguageSwitcherComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DashboardStore]
})
export class AppComponent implements OnInit, OnDestroy {
  private static readonly overlayMinimumDurationMs = 1000;
  private static readonly overlayFadeDurationMs = 1000;

  private readonly store = inject(DashboardStore);

  protected readonly showEmptyState = computed(() => this.store.isTrafficEmptyStateVisible());
  protected readonly overlayVisible = signal(false);
  protected readonly overlayFading = signal(false);
  protected readonly overlayVariant = signal<AmbientStateVariant>("loading");

  private overlayShownAt = 0;
  private overlayHideTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly overlayEffectRef = effect(() => {
    const shouldShow = this.store.isBlockingOverlayVisible();
    const nextVariant: AmbientStateVariant =
      this.store.editorSyncState() === "syncing" ? "saving" : "loading";

    if (shouldShow) {
      this.overlayVariant.set(nextVariant);
      this.showOverlay();
      return;
    }

    this.scheduleOverlayHide();
  });

  ngOnInit(): void {
    void this.store.initialize();
  }

  ngOnDestroy(): void {
    this.overlayEffectRef.destroy();
    if (this.overlayHideTimer) {
      clearTimeout(this.overlayHideTimer);
      this.overlayHideTimer = null;
    }
    if (this.overlayFadeTimer) {
      clearTimeout(this.overlayFadeTimer);
      this.overlayFadeTimer = null;
    }
  }

  private showOverlay(): void {
    if (this.overlayHideTimer) {
      clearTimeout(this.overlayHideTimer);
      this.overlayHideTimer = null;
    }
    if (this.overlayFadeTimer) {
      clearTimeout(this.overlayFadeTimer);
      this.overlayFadeTimer = null;
    }

    this.overlayFading.set(false);

    if (!this.overlayVisible()) {
      this.overlayShownAt = Date.now();
      this.overlayVisible.set(true);
    }
  }

  private scheduleOverlayHide(): void {
    if (!this.overlayVisible()) {
      return;
    }

    const elapsed = Date.now() - this.overlayShownAt;
    const remaining = Math.max(0, AppComponent.overlayMinimumDurationMs - elapsed);

    if (this.overlayHideTimer) {
      clearTimeout(this.overlayHideTimer);
    }

    this.overlayHideTimer = setTimeout(() => {
      this.overlayFading.set(true);
      this.overlayFadeTimer = setTimeout(() => {
        this.overlayVisible.set(false);
        this.overlayFading.set(false);
        this.overlayFadeTimer = null;
      }, AppComponent.overlayFadeDurationMs);
      this.overlayHideTimer = null;
    }, remaining);
  }
}
