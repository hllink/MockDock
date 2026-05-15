import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import type { OnDestroy } from "@angular/core";
import type { HttpMethod } from "@mockdock/shared";

import { I18nService } from "../../core/i18n/i18n.service";
import type { DashboardRouteView, DashboardWorkspaceGroupView } from "../dashboard.models";
import { DashboardStore } from "../dashboard.store";

const ROUTE_DRAG_DATA_KEY = "application/x-mockdock-route";
const WORKSPACE_DRAG_DATA_KEY = "application/x-mockdock-workspace";
const HTTP_METHODS: readonly HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD"
];

function isValidRoutePattern(pattern: string): boolean {
  if (pattern === "/") {
    return true;
  }

  if (!pattern.startsWith("/")) {
    return false;
  }

  const segments = pattern.split("/").slice(1);
  if (segments.length === 0) {
    return false;
  }

  return segments.every((segment, index) => {
    if (segment.length === 0) {
      return false;
    }

    if (segment === "*") {
      return true;
    }

    if (segment === "**") {
      return index === segments.length - 1;
    }

    return !segment.includes("*");
  });
}

@Component({
  selector: "app-route-nav",
  standalone: true,
  templateUrl: "./route-nav.component.html",
  styleUrl: "./route-nav.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RouteNavComponent implements OnDestroy {
  private static readonly starterRequestUrl = "http://localhost:52052/demo/hello";

  protected readonly i18n = inject(I18nService);
  protected readonly store = inject(DashboardStore);
  protected readonly availableMethods = HTTP_METHODS;
  protected readonly draggingRouteId = signal<string | null>(null);
  protected readonly draggingWorkspaceId = signal<string | null>(null);
  protected readonly dropWorkspaceId = signal<string | null>(null);
  protected readonly workspaceDropTargetId = signal<string | null>(null);
  protected readonly editingWorkspaceId = signal<string | null>(null);
  protected readonly workspaceRenameDraft = signal("");
  protected readonly renamingWorkspaceId = signal<string | null>(null);
  protected readonly helpModalOpen = signal(false);
  protected readonly addressCopied = signal(false);
  protected readonly createRouteWorkspaceId = signal<string | null>(null);
  protected readonly createRouteMethod = signal<HttpMethod>("GET");
  protected readonly createRouteContextDraft = signal("");
  protected readonly createRouteError = signal<string | null>(null);
  protected readonly creatingRouteWorkspaceId = signal<string | null>(null);
  protected readonly wildcardHelpOpen = signal(false);
  protected readonly workspaceDeleteTarget = signal<DashboardWorkspaceGroupView | null>(null);
  protected readonly bulkDeleteConfirmOpen = signal(false);

  private copyFeedbackTimeoutId: number | null = null;

  ngOnDestroy(): void {
    if (this.copyFeedbackTimeoutId !== null) {
      window.clearTimeout(this.copyFeedbackTimeoutId);
    }
  }

  protected openHelpModal(): void {
    this.helpModalOpen.set(true);
  }

  protected closeHelpModal(): void {
    this.helpModalOpen.set(false);
  }

  protected openCreateRouteModal(group: DashboardWorkspaceGroupView): void {
    if (this.renamingWorkspaceId()) {
      return;
    }

    this.createRouteWorkspaceId.set(group.workspaceId);
    this.createRouteMethod.set("GET");
    this.createRouteContextDraft.set("");
    this.createRouteError.set(null);
    this.wildcardHelpOpen.set(false);
  }

  protected closeCreateRouteModal(): void {
    if (this.creatingRouteWorkspaceId()) {
      return;
    }

    this.createRouteWorkspaceId.set(null);
    this.createRouteMethod.set("GET");
    this.createRouteContextDraft.set("");
    this.createRouteError.set(null);
    this.wildcardHelpOpen.set(false);
  }

  protected updateCreateRouteMethod(event: Event): void {
    this.createRouteMethod.set((event.target as HTMLSelectElement).value as HttpMethod);
  }

  protected updateCreateRouteContextDraft(event: Event): void {
    this.createRouteContextDraft.set((event.target as HTMLInputElement).value);
    if (this.createRouteError()) {
      this.createRouteError.set(null);
    }
  }

  protected toggleWildcardHelp(): void {
    this.wildcardHelpOpen.update((current) => !current);
  }

  protected createRouteWorkspace(): DashboardWorkspaceGroupView | null {
    const workspaceId = this.createRouteWorkspaceId();
    if (!workspaceId) {
      return null;
    }

    return this.findWorkspaceGroup(workspaceId);
  }

  protected starterRequestUrl(): string {
    return RouteNavComponent.starterRequestUrl;
  }

  protected async copyStarterAddress(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(RouteNavComponent.starterRequestUrl);
      this.addressCopied.set(true);
      if (this.copyFeedbackTimeoutId !== null) {
        window.clearTimeout(this.copyFeedbackTimeoutId);
      }
      this.copyFeedbackTimeoutId = window.setTimeout(() => {
        this.addressCopied.set(false);
        this.copyFeedbackTimeoutId = null;
      }, 1800);
    } catch {
      // Ignore clipboard failures in unsupported or restricted contexts.
    }
  }

  protected isRouteNew(routeId: string): boolean {
    return this.store.unseenRouteIds().has(routeId);
  }

  protected workspaceHasNewRoutes(group: DashboardWorkspaceGroupView): boolean {
    return group.routes.some((route) => this.isRouteNew(route.routeId));
  }

  protected routePathLabel(route: DashboardRouteView): string {
    const selectedView = this.store.selectedRouteView();
    if (selectedView && selectedView.anchorRouteId === route.routeId) {
      return selectedView.displayLabel;
    }

    return route.displayLabel;
  }

  protected routeHitLabel(routeId: string, hitCount: number): string {
    const selectedView = this.store.selectedRouteView();
    if (selectedView && selectedView.anchorRouteId === routeId) {
      return this.formatHitCount(selectedView.hitCount);
    }

    return this.formatHitCount(hitCount);
  }

  protected routeCountLabel(routeCount: number): string {
    return this.i18n.t("common.routeCount", {
      count: this.i18n.formatNumber(routeCount),
      suffix: this.i18n.pluralSuffix(routeCount)
    });
  }

  protected bulkSelectedCount(): number {
    return this.store.selectedBulkRouteIds().size;
  }

  protected routeSelectedForBulkDelete(routeId: string): boolean {
    return this.store.selectedBulkRouteIds().has(routeId);
  }

  protected startBulkDeleteMode(): void {
    this.store.startBulkDeleteMode();
  }

  protected cancelBulkDeleteMode(): void {
    this.bulkDeleteConfirmOpen.set(false);
    this.store.cancelBulkDeleteMode();
  }

  protected toggleBulkRoute(routeId: string, event?: Event): void {
    event?.stopPropagation();
    this.store.toggleBulkRouteSelection(routeId);
  }

  protected selectOrToggleRoute(routeId: string): void {
    if (this.store.bulkDeleteMode()) {
      this.store.toggleBulkRouteSelection(routeId);
      return;
    }

    void this.store.selectRoute(routeId);
  }

  protected openBulkDeleteConfirm(): void {
    if (this.bulkSelectedCount() === 0) {
      return;
    }

    this.bulkDeleteConfirmOpen.set(true);
  }

  protected closeBulkDeleteConfirm(): void {
    this.bulkDeleteConfirmOpen.set(false);
  }

  protected async confirmBulkDelete(): Promise<void> {
    this.bulkDeleteConfirmOpen.set(false);
    await this.store.bulkDeleteSelectedRoutes();
  }

  protected toggleWorkspace(workspaceId: string): void {
    this.store.toggleWorkspaceExpanded(workspaceId);
  }

  protected startWorkspaceRename(group: DashboardWorkspaceGroupView): void {
    if (this.renamingWorkspaceId()) {
      return;
    }

    this.editingWorkspaceId.set(group.workspaceId);
    this.workspaceRenameDraft.set(group.slug);
  }

  protected openWorkspaceDeleteConfirm(group: DashboardWorkspaceGroupView): void {
    if (this.renamingWorkspaceId()) {
      return;
    }

    this.workspaceDeleteTarget.set(group);
  }

  protected closeWorkspaceDeleteConfirm(): void {
    this.workspaceDeleteTarget.set(null);
  }

  protected async confirmWorkspaceDelete(): Promise<void> {
    const target = this.workspaceDeleteTarget();
    if (!target) {
      return;
    }

    this.workspaceDeleteTarget.set(null);
    await this.store.deleteWorkspace(target.workspaceId);
  }

  protected cancelWorkspaceRename(): void {
    if (this.renamingWorkspaceId()) {
      return;
    }

    this.editingWorkspaceId.set(null);
    this.workspaceRenameDraft.set("");
  }

  protected updateWorkspaceRenameDraft(event: Event): void {
    this.workspaceRenameDraft.set((event.target as HTMLInputElement).value);
  }

  protected async submitWorkspaceRename(event: Event, workspaceId: string): Promise<void> {
    event.preventDefault();

    const group = this.findWorkspaceGroup(workspaceId);
    const slug = this.workspaceRenameDraft().trim();
    if (!group) {
      this.cancelWorkspaceRename();
      return;
    }

    if (!slug || slug === group.slug) {
      this.cancelWorkspaceRename();
      return;
    }

    this.renamingWorkspaceId.set(workspaceId);

    try {
      await this.store.renameWorkspace(workspaceId, { slug });
      this.editingWorkspaceId.set(null);
      this.workspaceRenameDraft.set("");
    } finally {
      this.renamingWorkspaceId.set(null);
    }
  }

  protected async submitCreateRoute(event: Event): Promise<void> {
    event.preventDefault();

    const workspace = this.createRouteWorkspace();
    const pattern = this.normalizeRoutePattern(this.createRouteContextDraft());
    let created = false;
    const validationMessage = this.validateCreateRoutePattern(pattern);
    if (!workspace) {
      this.closeCreateRouteModal();
      return;
    }

    if (validationMessage) {
      this.createRouteError.set(validationMessage);
      return;
    }

    this.creatingRouteWorkspaceId.set(workspace.workspaceId);
    this.createRouteError.set(null);

    try {
      await this.store.createRoute(workspace.workspaceId, {
        method: this.createRouteMethod(),
        pattern,
        examplePath: pattern
      });
      created = true;
    } catch {
      this.createRouteError.set(this.i18n.t("routeNav.addRouteFailure"));
    } finally {
      this.creatingRouteWorkspaceId.set(null);
      if (created) {
        this.closeCreateRouteModal();
      }
    }
  }

  protected handleRouteDragStart(event: DragEvent, routeId: string): void {
    if (this.store.bulkDeleteMode()) {
      event.preventDefault();
      return;
    }

    this.draggingRouteId.set(routeId);
    this.dropWorkspaceId.set(null);
    this.workspaceDropTargetId.set(null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(ROUTE_DRAG_DATA_KEY, routeId);
      event.dataTransfer.setData("text/plain", routeId);
    }
  }

  protected handleRouteDragEnd(): void {
    this.draggingRouteId.set(null);
    this.dropWorkspaceId.set(null);
  }

  protected handleWorkspaceDragStart(event: DragEvent, workspaceId: string): void {
    this.draggingWorkspaceId.set(workspaceId);
    this.workspaceDropTargetId.set(null);
    this.dropWorkspaceId.set(null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(WORKSPACE_DRAG_DATA_KEY, workspaceId);
      event.dataTransfer.setData("text/plain", workspaceId);
    }
  }

  protected handleWorkspaceDragEnd(): void {
    this.draggingWorkspaceId.set(null);
    this.workspaceDropTargetId.set(null);
  }

  protected handleWorkspaceDragOver(event: DragEvent, workspaceId: string): void {
    const draggedWorkspaceId = this.readDraggedWorkspaceId(event);
    if (draggedWorkspaceId) {
      if (draggedWorkspaceId === workspaceId) {
        return;
      }

      event.preventDefault();
      this.workspaceDropTargetId.set(workspaceId);
      this.dropWorkspaceId.set(null);

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }

      return;
    }

    const routeId = this.readDraggedRouteId(event);
    if (!routeId || this.isRouteInWorkspace(routeId, workspaceId)) {
      return;
    }

    event.preventDefault();
    this.dropWorkspaceId.set(workspaceId);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  protected clearWorkspaceDropTarget(event: DragEvent, workspaceId: string): void {
    const currentTarget = event.currentTarget;
    const nextTarget = event.relatedTarget;
    if (
      currentTarget instanceof HTMLElement &&
      nextTarget instanceof Node &&
      currentTarget.contains(nextTarget)
    ) {
      return;
    }

    if (this.dropWorkspaceId() === workspaceId) {
      this.dropWorkspaceId.set(null);
    }

    if (this.workspaceDropTargetId() === workspaceId) {
      this.workspaceDropTargetId.set(null);
    }
  }

  protected async handleWorkspaceDrop(event: DragEvent, workspaceId: string): Promise<void> {
    event.preventDefault();

    const draggedWorkspaceId = this.readDraggedWorkspaceId(event);
    if (draggedWorkspaceId) {
      this.workspaceDropTargetId.set(null);
      this.draggingWorkspaceId.set(null);

      if (draggedWorkspaceId !== workspaceId) {
        this.store.moveWorkspace(draggedWorkspaceId, workspaceId);
      }

      return;
    }

    const routeId = this.readDraggedRouteId(event);
    this.dropWorkspaceId.set(null);
    this.draggingRouteId.set(null);

    if (!routeId || this.isRouteInWorkspace(routeId, workspaceId)) {
      return;
    }

    await this.store.moveRoute(routeId, { destinationWorkspaceId: workspaceId });
  }

  private findWorkspaceGroup(workspaceId: string): DashboardWorkspaceGroupView | null {
    return this.store.workspaceGroups().find((group) => group.workspaceId === workspaceId) ?? null;
  }

  private normalizeRoutePattern(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  private validateCreateRoutePattern(pattern: string): string | null {
    if (!pattern) {
      return this.i18n.t("routeNav.contextRequired");
    }

    if (isValidRoutePattern(pattern)) {
      return null;
    }

    if (pattern.includes("**") && !pattern.endsWith("/**")) {
      return this.i18n.t("routeNav.wildcardEndOnly", { double: "**" });
    }

    return this.i18n.t("routeNav.routePatternHint");
  }

  private readDraggedRouteId(event: DragEvent): string | null {
    const draggedRouteId = this.draggingRouteId();
    if (draggedRouteId) {
      return draggedRouteId;
    }

    return event.dataTransfer?.getData(ROUTE_DRAG_DATA_KEY) || null;
  }

  private readDraggedWorkspaceId(event: DragEvent): string | null {
    const draggedWorkspaceId = this.draggingWorkspaceId();
    if (draggedWorkspaceId) {
      return draggedWorkspaceId;
    }

    return event.dataTransfer?.getData(WORKSPACE_DRAG_DATA_KEY) || null;
  }

  private isRouteInWorkspace(routeId: string, workspaceId: string): boolean {
    return (
      this.store
        .workspaceGroups()
        .some((group) => group.workspaceId === workspaceId && group.routes.some((route) => route.routeId === routeId))
    );
  }

  private formatHitCount(hitCount: number): string {
    return this.i18n.t("common.hitCount", {
      count: this.i18n.formatNumber(hitCount),
      suffix: this.i18n.pluralSuffix(hitCount)
    });
  }
}
