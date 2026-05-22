import { computed, DestroyRef, inject, Injectable, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import type {
  CreateRouteInput,
  CreatePresetInput,
  MoveRouteInput,
  RenameWorkspaceInput,
  ResponsePayloadDto,
  RequestLogDto,
  WorkspaceDto
} from "@mockdock/shared";

import { LocalPreferencesService } from "../core/local-preferences.service";
import { ApiError, MockdockApiService } from "../core/mockdock-api.service";
import type {
  MockdockResponsePresetDto,
  MockdockRouteResponseVariantDto,
  MockdockRouteSummaryDto
} from "../core/mockdock-api.models";
import { MockdockEventsService, type MockdockEventMessage } from "../core/mockdock-events.service";
import { TitleBadgeService } from "../core/title-badge.service";
import {
  deriveDashboardRouteView,
  tokenizeRoutePattern
} from "./dashboard-route-groups";
import type {
  DashboardPayloadMode,
  DashboardRouteDetails,
  DashboardResponseEditorDraft,
  DashboardRouteSort,
  DashboardRouteView,
  DashboardSyncState,
  DashboardVariantOption,
  DashboardWorkspaceGroupView
} from "./dashboard.models";
import { DASHBOARD_PAYLOAD_MODES } from "./dashboard.models";
import {
  getContentTypeForMode,
  getStatusToolbarSelectionKey,
  inferPayloadModeFromResponse,
  isValidStatusCode,
  normalizeContentType,
  type DashboardStatusToolbarSelectionKey
} from "./response-draft.helpers";

type DashboardContentTypeOption = { label: string; value: string };

const DASHBOARD_CONTENT_TYPE_OPTIONS: readonly DashboardContentTypeOption[] = [
  { label: "None", value: "" },
  { label: "application/json", value: "application/json" },
  { label: "text/plain; charset=utf-8", value: "text/plain; charset=utf-8" },
  { label: "application/xml", value: "application/xml" },
  { label: "multipart/form-data", value: "multipart/form-data" },
  { label: "application/x-www-form-urlencoded", value: "application/x-www-form-urlencoded" },
  { label: "application/octet-stream", value: "application/octet-stream" }
] as const;

interface DraftState {
  statusCode: number;
  selectedStatusButtonKey: DashboardStatusToolbarSelectionKey;
  bodyText: string;
  payloadMode: DashboardPayloadMode;
  contentType: string | null;
}

@Injectable()
export class DashboardStore {
  private readonly api = inject(MockdockApiService);
  private readonly events = inject(MockdockEventsService);
  private readonly preferences = inject(LocalPreferencesService);
  private readonly titleBadge = inject(TitleBadgeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly payloadModes = DASHBOARD_PAYLOAD_MODES;
  readonly contentTypeOptions = DASHBOARD_CONTENT_TYPE_OPTIONS;
  readonly activeWorkspaceId = signal<string | null>(null);
  readonly selectedRouteId = signal<string | null>(null);
  readonly selectedRequestId = signal<string | null>(null);
  readonly bulkDeleteMode = signal(false);
  readonly selectedBulkRouteIds = signal(new Set<string>());
  readonly routeSort = signal<DashboardRouteSort>(this.preferences.getRouteSort());
  readonly unseenRouteIds = signal(new Set<string>());
  readonly syncState = signal<DashboardSyncState>("idle");
  readonly editorSyncState = signal<DashboardSyncState>("idle");
  readonly editorErrorMessage = signal("");
  readonly userSyncState = signal<DashboardSyncState>("idle");
  readonly initialized = signal(false);
  readonly initialHydrationComplete = signal(false);

  private readonly workspaces = signal<WorkspaceDto[]>([]);
  private readonly routesByWorkspaceId = signal<Record<string, MockdockRouteSummaryDto[]>>({});
  private readonly workspaceExpandedState = signal<Record<string, boolean>>({});
  private readonly currentRoutes = computed(() => this.getRoutesForWorkspace(this.activeWorkspaceId()));
  private readonly selectedRouteBaseSegments = signal<string[]>([]);
  readonly selectedVariantKey = signal("default");
  private readonly routeDetails = signal<Map<string, DashboardRouteDetails>>(new Map());
  private readonly draft = signal<DraftState>({
    statusCode: 200,
    selectedStatusButtonKey: "2xx",
    bodyText: "",
    payloadMode: DASHBOARD_PAYLOAD_MODES[0],
    contentType: "application/json"
  });
  private readonly routeDetailGeneration = new Map<string, number>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDraftSourceKey: string | null = null;
  private workspaceGeneration = 0;
  private hasInitialized = false;
  private initializePromise: Promise<void> | null = null;
  private subscribedToEvents = false;
  readonly sortedRoutes = computed(() => this.sortRoutes(this.currentRoutes()));
  readonly hasAnyCapturedTraffic = computed(() =>
    this.getAllRoutes().some((item) => item.route.hitCount > 0)
  );
  readonly isBlockingOverlayVisible = computed(
    () =>
      !this.initialHydrationComplete() ||
      this.userSyncState() === "syncing" ||
      this.editorSyncState() === "syncing"
  );
  readonly isTrafficEmptyStateVisible = computed(
    () =>
      this.initialized() &&
      this.initialHydrationComplete() &&
      !this.hasAnyCapturedTraffic()
  );
  readonly workspaceGroups = computed<DashboardWorkspaceGroupView[]>(() =>
    this.workspaces()
      .map((workspace) => {
        const routes = this.sortRoutes(this.getRoutesForWorkspace(workspace.id));
        if (routes.length === 0) {
          return null;
        }

        return {
          workspaceId: workspace.id,
          slug: workspace.slug,
          routeCount: routes.length,
          expanded:
            this.workspaceExpandedState()[workspace.id] ??
            (workspace.id === this.activeWorkspaceId()),
          routes: routes.map((route) =>
            deriveDashboardRouteView(
              route,
              routes,
              tokenizeRoutePattern(route.route.examplePath)
            )
          )
        };
      })
      .filter((group): group is DashboardWorkspaceGroupView => group !== null)
  );

  readonly selectedRoute = computed(
    () => this.getAllRoutes().find((item) => item.route.id === this.selectedRouteId()) ?? null
  );
  readonly selectedRouteView = computed<DashboardRouteView | null>(() => {
    const selectedRoute = this.selectedRoute();
    if (!selectedRoute) {
      return null;
    }

    return deriveDashboardRouteView(
      selectedRoute,
      this.getRoutesForWorkspace(selectedRoute.route.workspaceId),
      this.resolveSelectedRouteBaseSegments(selectedRoute)
    );
  });

  readonly selectedRouteDetails = computed(
    () => this.routeDetails().get(this.selectedRouteId() ?? "") ?? null
  );
  readonly selectedRouteRequests = computed(() => {
    const routeView = this.selectedRouteView();
    if (!routeView) {
      return [] as RequestLogDto[];
    }

    const details = this.routeDetails();
    return routeView.memberRouteIds
      .flatMap((routeId) => details.get(routeId)?.requests ?? [])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
  readonly selectedVariantOptions = computed<DashboardVariantOption[]>(() => {
    const details = this.selectedRouteDetails();
    if (!details) {
      return [];
    }

    const requestCountBySignature = new Map<string, { count: number; querySignature: Record<string, string | string[]> }>();
    for (const request of this.selectedRouteRequests()) {
      const querySignature = this.normalizeQuerySignature(request.query);
      if (!querySignature) {
        continue;
      }

      const key = this.buildVariantSelectionKey(querySignature);
      const current = requestCountBySignature.get(key);
      requestCountBySignature.set(key, {
        count: (current?.count ?? 0) + 1,
        querySignature
      });
    }

    const defaultVariant =
      details.variants.find((variant) => variant.querySignature === null) ?? null;
    const options: DashboardVariantOption[] = [
      {
        selectionKey: "default",
        variantId: defaultVariant?.id ?? null,
        querySignature: null,
        queryDisplay: defaultVariant?.queryDisplay || "Default response",
        activeResponsePresetId: defaultVariant?.activeResponsePresetId ?? null,
        requestCount: this.selectedRouteRequests().filter((request) => !this.normalizeQuerySignature(request.query)).length,
        saved: defaultVariant !== null
      }
    ];

    for (const variant of details.variants) {
      if (variant.querySignature === null) {
        continue;
      }

      const selectionKey = this.buildVariantSelectionKey(variant.querySignature);
      const requestCount = requestCountBySignature.get(selectionKey)?.count ?? 0;
      requestCountBySignature.delete(selectionKey);
      options.push({
        selectionKey,
        variantId: variant.id,
        querySignature: variant.querySignature,
        queryDisplay: variant.queryDisplay,
        activeResponsePresetId: variant.activeResponsePresetId,
        requestCount,
        saved: true
      });
    }

    for (const [selectionKey, entry] of requestCountBySignature.entries()) {
      options.push({
        selectionKey,
        variantId: null,
        querySignature: entry.querySignature,
        queryDisplay: this.formatQueryDisplay(entry.querySignature),
        activeResponsePresetId: null,
        requestCount: entry.count,
        saved: false
      });
    }

    return options.sort((left, right) => {
      if (left.selectionKey === "default") {
        return -1;
      }

      if (right.selectionKey === "default") {
        return 1;
      }

      return left.queryDisplay.localeCompare(right.queryDisplay);
    });
  });
  readonly selectedVariant = computed<DashboardVariantOption | null>(() => {
    const selectedKey = this.selectedVariantKey();
    return (
      this.selectedVariantOptions().find((variant) => variant.selectionKey === selectedKey) ??
      this.selectedVariantOptions()[0] ??
      null
    );
  });
  readonly selectedVariantPresets = computed<MockdockResponsePresetDto[]>(() => {
    const details = this.selectedRouteDetails();
    const variantId = this.selectedVariant()?.variantId;
    if (!details || !variantId) {
      return [];
    }

    return details.presetsByVariantId[variantId] ?? [];
  });
  readonly activePreset = computed<MockdockResponsePresetDto | null>(() => {
    const selectedVariant = this.selectedVariant();
    if (!selectedVariant) {
      return null;
    }

    return (
      this.selectedVariantPresets().find(
        (preset) => preset.id === selectedVariant.activeResponsePresetId
      ) ?? this.getDefaultVariantPresetFallback(selectedVariant)
    );
  });
  readonly draftStatusCode = computed(() => this.draft().statusCode);
  readonly selectedStatusButtonKey = computed(() => this.draft().selectedStatusButtonKey);
  readonly selectedStatusButtonLabel = computed(() => this.formatStatusToolbarLabel(this.draft()));
  readonly draftBodyText = computed(() => this.draft().bodyText);
  readonly draftPayloadMode = computed(() => this.draft().payloadMode);
  readonly draftContentType = computed(() => this.draft().contentType ?? "");

  async renameWorkspace(workspaceId: string, payload: RenameWorkspaceInput): Promise<void> {
    await this.runUserSync(async () => {
      const workspace = await this.api.renameWorkspace(workspaceId, payload);
      this.updateWorkspaceList((current) =>
        current.map((item) => (item.id === workspaceId ? workspace : item))
      );
    });
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const workspaceRouteIds = this.getRoutesForWorkspace(workspaceId).map((item) => item.route.id);

    await this.runUserSync(async () => {
      await this.api.deleteWorkspace(workspaceId);
      this.removeWorkspacesLocally([workspaceId]);
      this.removeRoutesFromDetailCache(workspaceRouteIds);
      this.selectedBulkRouteIds.update((current) => {
        const next = new Set(current);
        for (const routeId of workspaceRouteIds) {
          next.delete(routeId);
        }
        return next;
      });
      this.reconcileSelectionAfterDelete(workspaceId);
    });
  }

  async createRoute(workspaceId: string, payload: CreateRouteInput): Promise<void> {
    await this.runUserSync(async () => {
      const route = await this.api.createRoute(workspaceId, payload);
      const existingRoute = this.getRouteById(route.id);
      this.upsertRouteLocally({
        route: existingRoute ? { ...existingRoute.route, ...route } : route
      });

      this.activeWorkspaceId.set(workspaceId);
      this.preferences.setWorkspaceId(workspaceId);
      this.setExpandedWorkspace(workspaceId);
      await this.selectRoute(route.id);
    });
  }

  async moveRoute(routeId: string, payload: MoveRouteInput): Promise<void> {
    const currentRoute = this.getRouteById(routeId);
    if (!currentRoute) {
      return;
    }

    const sourceWorkspaceId = currentRoute.route.workspaceId;
    if (sourceWorkspaceId === payload.destinationWorkspaceId) {
      return;
    }

    await this.runUserSync(async () => {
      const movedRoute = await this.api.moveRoute(routeId, payload);
      const nextRoute: MockdockRouteSummaryDto = {
        ...currentRoute,
        route: {
          ...currentRoute.route,
          ...movedRoute
        }
      };

      this.routesByWorkspaceId.update((current) => {
        const next = { ...current };
        const sourceRoutes = (next[sourceWorkspaceId] ?? []).filter((item) => item.route.id !== routeId);
        const destinationRoutes = (next[payload.destinationWorkspaceId] ?? []).filter(
          (item) => item.route.id !== routeId
        );

        if (sourceRoutes.length > 0) {
          next[sourceWorkspaceId] = sourceRoutes;
        } else {
          delete next[sourceWorkspaceId];
        }

        next[payload.destinationWorkspaceId] = [...destinationRoutes, nextRoute];
        return next;
      });

      if (this.selectedRouteId() === routeId) {
        this.activeWorkspaceId.set(payload.destinationWorkspaceId);
        this.preferences.setWorkspaceId(payload.destinationWorkspaceId);
        this.setExpandedWorkspace(payload.destinationWorkspaceId);
        this.syncSelectedRouteContext();
        this.syncDraftFromSelection();
        return;
      }

      if (
        this.activeWorkspaceId() === sourceWorkspaceId &&
        this.getRoutesForWorkspace(sourceWorkspaceId).length === 0
      ) {
        this.activeWorkspaceId.set(payload.destinationWorkspaceId);
        this.preferences.setWorkspaceId(payload.destinationWorkspaceId);
        this.setExpandedWorkspace(payload.destinationWorkspaceId);
      }
    });
  }

  async deleteRoute(routeId: string): Promise<void> {
    const currentRoute = this.getRouteById(routeId);
    if (!currentRoute) {
      return;
    }

    await this.runUserSync(async () => {
      await this.api.deleteRoute(routeId);
      this.removeRouteLocally(routeId);
    });
  }

  async bulkDeleteSelectedRoutes(): Promise<void> {
    const routeIds = [...this.selectedBulkRouteIds()];
    if (routeIds.length === 0) {
      return;
    }

    await this.runUserSync(async () => {
      const result = await this.api.bulkDeleteRoutes(routeIds);
      this.removeRoutesLocally(result.deletedRouteIds, result.deletedWorkspaceIds);
      this.bulkDeleteMode.set(false);
      this.selectedBulkRouteIds.set(new Set());
    });
  }

  async deleteVariant(variantId: string): Promise<void> {
    const variant = this.selectedRouteDetails()?.variants.find((item) => item.id === variantId) ?? null;
    if (!variant || variant.querySignature === null) {
      return;
    }

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      await this.api.deleteVariant(variant.id);
      this.applyVariantDelete(variant.id);
      this.selectedVariantKey.set("default");
      this.syncDraftFromSelection();
      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(error, `Failed to delete variant ${variantId}`);
      throw error;
    }
  }

  startBulkDeleteMode(routeId?: string): void {
    this.bulkDeleteMode.set(true);
    this.selectedBulkRouteIds.set(routeId ? new Set([routeId]) : new Set());
  }

  cancelBulkDeleteMode(): void {
    this.bulkDeleteMode.set(false);
    this.selectedBulkRouteIds.set(new Set());
  }

  toggleBulkRouteSelection(routeId: string): void {
    this.selectedBulkRouteIds.update((current) => {
      const next = new Set(current);
      if (next.has(routeId)) {
        next.delete(routeId);
      } else {
        next.add(routeId);
      }
      return next;
    });
  }

  async activateExistingPreset(presetId: string): Promise<void> {
    const variant = this.selectedVariant();
    if (!variant?.variantId) {
      return;
    }

    const preset = this.selectedVariantPresets().find((item) => item.id === presetId) ?? null;
    if (!preset || variant.activeResponsePresetId === preset.id) {
      return;
    }

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      await this.api.setActivePreset(variant.variantId, preset.id);
      this.applyPresetUpdate(variant.variantId, preset, { activate: true });
      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(
        error,
        `Failed to activate preset ${presetId} for variant ${variant.variantId}`
      );
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.hasInitialized) {
      this.ensureEventSubscription();
      return;
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this.performInitialize().finally(() => {
      this.initializePromise = null;
    });
    return this.initializePromise;
  }

  async selectWorkspace(workspaceId: string): Promise<void> {
    if (workspaceId === this.activeWorkspaceId()) {
      return;
    }

    const previousWorkspaceId = this.activeWorkspaceId();
    const previousRoutesByWorkspaceId = this.routesByWorkspaceId();
    const previousWorkspaceExpandedState = this.workspaceExpandedState();
    const previousRouteDetails = this.routeDetails();
    const previousSelectedRouteId = this.selectedRouteId();
    const previousSelectedRequestId = this.selectedRequestId();
    const previousSelectedRouteBaseSegments = this.selectedRouteBaseSegments();
    const previousSelectedVariantKey = this.selectedVariantKey();
    const previousUnseenRouteIds = this.unseenRouteIds();

    await this.runUserSync(async () => {
      this.editorErrorMessage.set("");
      this.preferences.setWorkspaceId(workspaceId);
      this.activeWorkspaceId.set(workspaceId);
      this.setExpandedWorkspace(workspaceId);
      this.unseenRouteIds.set(new Set());
      this.titleBadge.setUnread(0);

      try {
        await this.loadWorkspace(workspaceId);
      } catch (error) {
        this.activeWorkspaceId.set(previousWorkspaceId);
        this.routesByWorkspaceId.set(previousRoutesByWorkspaceId);
        this.workspaceExpandedState.set(previousWorkspaceExpandedState);
        this.routeDetails.set(previousRouteDetails);
        this.selectedRouteId.set(previousSelectedRouteId);
        this.selectedRequestId.set(previousSelectedRequestId);
        this.selectedRouteBaseSegments.set(previousSelectedRouteBaseSegments);
        this.selectedVariantKey.set(previousSelectedVariantKey);
        this.unseenRouteIds.set(previousUnseenRouteIds);
        this.syncDraftFromSelection();

        if (previousWorkspaceId) {
          this.preferences.setWorkspaceId(previousWorkspaceId);
        }
        this.titleBadge.setUnread(previousUnseenRouteIds.size);

        throw error;
      }
    });
  }

  setRouteSort(value: DashboardRouteSort): void {
    this.routeSort.set(value);
    this.preferences.setRouteSort(value);
  }

  moveWorkspace(workspaceId: string, targetWorkspaceId: string): void {
    if (workspaceId === targetWorkspaceId) {
      return;
    }

    const current = this.workspaces();
    const workspaceIndex = current.findIndex((workspace) => workspace.id === workspaceId);
    const targetIndex = current.findIndex((workspace) => workspace.id === targetWorkspaceId);
    if (workspaceIndex === -1 || targetIndex === -1) {
      return;
    }

    const next = [...current];
    const [workspace] = next.splice(workspaceIndex, 1);
    const insertionIndex = workspaceIndex < targetIndex ? targetIndex : targetIndex;
    next.splice(insertionIndex, 0, workspace);
    this.setWorkspaceList(next, next.map((item) => item.id));
  }

  toggleWorkspaceExpanded(workspaceId: string): void {
    this.workspaceExpandedState.update((current) => {
      const expanded = current[workspaceId] ?? (workspaceId === this.activeWorkspaceId());
      return {
        ...current,
        [workspaceId]: !expanded
      };
    });
  }

  async selectRoute(routeId: string): Promise<void> {
    const route = this.getRouteById(routeId);
    if (route && route.route.workspaceId !== this.activeWorkspaceId()) {
      this.activeWorkspaceId.set(route.route.workspaceId);
      this.preferences.setWorkspaceId(route.route.workspaceId);
      this.setExpandedWorkspace(route.route.workspaceId);
    }

    this.editorErrorMessage.set("");
    this.selectedRouteId.set(routeId);
    this.syncSelectedRouteContext();
    this.selectedRequestId.set(null);
    this.selectedVariantKey.set("default");
    this.unseenRouteIds.update((current) => {
      const next = new Set(current);
      next.delete(routeId);
      this.titleBadge.setUnread(next.size);
      return next;
    });

    this.syncDraftFromSelection();
    await this.loadRouteDetails(routeId, { force: false, includeVariants: true });
    await this.ensureSelectedRouteMemberDetails({ force: false });
  }

  selectRequest(requestId: string | null): void {
    this.selectedRequestId.set(requestId);
  }

  selectVariant(selectionKey: string): void {
    this.editorErrorMessage.set("");
    this.selectedVariantKey.set(selectionKey);
    this.syncDraftFromSelection();
  }

  updateDraftStatusCode(statusCode: number): void {
    const selectedStatusButtonKey = getStatusToolbarSelectionKey(statusCode);
    if (selectedStatusButtonKey === "custom") {
      this.setCustomDraftStatusCode(statusCode);
      return;
    }

    this.selectDraftStatusCode(statusCode, selectedStatusButtonKey);
  }

  selectDraftStatusCode(
    statusCode: number,
    selectedStatusButtonKey: Exclude<DashboardStatusToolbarSelectionKey, "custom">
  ): void {
    if (!isValidStatusCode(statusCode)) {
      return;
    }

    this.setDraftStatusCode(statusCode, selectedStatusButtonKey);
    this.queueSaveIfPossible();
  }

  setCustomDraftStatusCode(statusCode: number): void {
    if (!isValidStatusCode(statusCode)) {
      return;
    }

    this.setDraftStatusCode(statusCode, "custom");
    this.queueSaveIfPossible();
  }

  updateDraftBody(bodyText: string): void {
    this.draft.update((current) => ({ ...current, bodyText }));
    this.queueSaveIfPossible();
  }

  async saveDraftNow(bodyText?: string): Promise<void> {
    if (bodyText !== undefined) {
      this.draft.update((current) => ({ ...current, bodyText }));
    }

    if (!this.selectedRouteId()) {
      this.editorSyncState.set("idle");
      this.editorErrorMessage.set("");
      return;
    }

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      await this.persistDraft();
      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(error, "Failed to save response draft");
      throw error;
    }
  }

  setDraftPayloadMode(payloadMode: DashboardPayloadMode): void {
    this.draft.update((current) => ({
      ...current,
      payloadMode,
      contentType: getContentTypeForMode(payloadMode)
    }));
    this.queueSaveIfPossible();
  }

  setDraftContentType(contentType: string): void {
    this.draft.update((current) => ({
      ...current,
      contentType: normalizeContentType(contentType)
    }));
    this.queueSaveIfPossible();
  }

  async createPresetFromDraft(): Promise<void> {
    const routeId = this.selectedRouteId();
    const selectedVariant = this.selectedVariant();
    if (!routeId || !selectedVariant) {
      return;
    }

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      const variant = await this.ensureSelectedVariantPersisted(routeId, selectedVariant);
      const preset = await this.api.createPreset(variant.id, this.buildPresetPayload());
      await this.api.setActivePreset(variant.id, preset.id);
      this.applyPresetUpdate(variant.id, preset, { activate: true });
      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(error, `Failed to create preset for route ${routeId}`);
      throw error;
    }
  }

  async saveResponseDraft(draft: DashboardResponseEditorDraft): Promise<void> {
    const routeId = this.selectedRouteId();
    if (!routeId) {
      this.editorSyncState.set("idle");
      return;
    }

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      const selectedVariant = await this.resolveSelectedVariantForPersistence(routeId);
      if (!selectedVariant) {
        throw new Error(`Failed to resolve selected variant for route ${routeId}`);
      }

      const variant = await this.ensureSelectedVariantPersisted(routeId, selectedVariant);
      const payload = this.buildPresetPayloadFromEditorDraft(draft);
      const activePreset = this.activePreset();

      if (activePreset && activePreset.routeResponseVariantId === variant.id) {
        const preset = await this.api.updatePreset(activePreset.id, payload);
        this.applyPresetUpdate(variant.id, preset, { activate: true });
      } else {
        const preset = await this.api.createPreset(variant.id, payload);
        await this.api.setActivePreset(variant.id, preset.id);
        this.applyPresetUpdate(variant.id, preset, { activate: true });
      }

      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(error, `Failed to save response draft for route ${routeId}`);
      throw error;
    }
  }

  async createPresetFromResponseDraft(draft: DashboardResponseEditorDraft): Promise<void> {
    const routeId = this.selectedRouteId();
    const selectedVariant = this.selectedVariant();
    if (!routeId || !selectedVariant) {
      return;
    }

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      const variant = await this.ensureSelectedVariantPersisted(routeId, selectedVariant);
      const preset = await this.api.createPreset(variant.id, this.buildPresetPayloadFromEditorDraft(draft));
      await this.api.setActivePreset(variant.id, preset.id);
      this.applyPresetUpdate(variant.id, preset, { activate: true });
      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(error, `Failed to create preset for route ${routeId}`);
      throw error;
    }
  }

  async createNamedPresetFromResponseDraft(
    draft: DashboardResponseEditorDraft,
    name: string
  ): Promise<void> {
    const routeId = this.selectedRouteId();
    const selectedVariant = this.selectedVariant();
    if (!routeId || !selectedVariant) {
      return;
    }

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      const variant = await this.ensureSelectedVariantPersisted(routeId, selectedVariant);
      const preset = await this.api.createPreset(
        variant.id,
        this.buildPresetPayloadFromEditorDraft(draft, name)
      );
      await this.api.setActivePreset(variant.id, preset.id);
      this.applyPresetUpdate(variant.id, preset, { activate: true });
      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(error, `Failed to create preset for route ${routeId}`);
      throw error;
    }
  }

  async renamePreset(presetId: string, name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const preset = this.selectedVariantPresets().find((item) => item.id === presetId) ?? null;
    if (!preset) {
      return;
    }

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      const updatedPreset = await this.api.updatePreset(
        preset.id,
        this.buildPresetPayloadFromPreset(preset, trimmedName)
      );
      this.applyPresetUpdate(preset.routeResponseVariantId, updatedPreset, {
        activate: this.activePreset()?.id === preset.id
      });
      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(error, `Failed to rename preset ${presetId}`);
      throw error;
    }
  }

  async deletePreset(presetId: string): Promise<void> {
    const variant = this.selectedVariant();
    if (!variant?.variantId) {
      return;
    }

    const presets = this.selectedVariantPresets();
    if (presets.length <= 1) {
      return;
    }

    const preset = presets.find((item) => item.id === presetId) ?? null;
    if (!preset || preset.isSystem) {
      return;
    }

    const nextActivePreset = variant.activeResponsePresetId === preset.id
      ? presets.find((item) => item.id !== preset.id) ?? null
      : null;

    this.cancelPendingSave();
    this.editorSyncState.set("syncing");
    this.editorErrorMessage.set("");

    try {
      if (nextActivePreset) {
        await this.api.setActivePreset(variant.variantId, nextActivePreset.id);
      }

      await this.api.deletePreset(preset.id);
      this.applyPresetDelete(variant.variantId, preset.id, nextActivePreset?.id ?? null);
      this.editorSyncState.set("saved");
      this.editorErrorMessage.set("");
    } catch (error) {
      this.setEditorError(error, `Failed to delete preset ${presetId}`);
      throw error;
    }
  }

  markRouteAsNew(routeId: string): void {
    if (routeId === this.selectedRouteId()) {
      return;
    }

    this.unseenRouteIds.update((current) => {
      if (current.has(routeId)) {
        return current;
      }

      const next = new Set(current);
      next.add(routeId);
      this.titleBadge.setUnread(next.size);
      return next;
    });
  }

  private async performInitialize(): Promise<void> {
    this.syncState.set("syncing");
    this.initialHydrationComplete.set(false);

    try {
      const workspaces = await this.api.getWorkspaces();
      this.setWorkspaceList(workspaces);
      const preferredWorkspaceId = this.preferences.getWorkspaceId();
      const activeWorkspace =
        workspaces.find((workspace) => workspace.id === preferredWorkspaceId) ?? workspaces[0] ?? null;

      this.activeWorkspaceId.set(activeWorkspace?.id ?? null);
      this.setExpandedWorkspace(activeWorkspace?.id ?? null);
      if (activeWorkspace) {
        this.preferences.setWorkspaceId(activeWorkspace.id);
        await this.loadWorkspace(activeWorkspace.id);
        await this.loadInactiveWorkspaceRoutes(this.activeWorkspaceId());
      } else {
        this.routesByWorkspaceId.set({});
        this.routeDetails.set(new Map());
        this.selectedRouteId.set(null);
        this.selectedRequestId.set(null);
        this.clearSelectedRouteContext();
        this.syncDraftFromSelection();
      }

      this.ensureEventSubscription();
      this.hasInitialized = true;
      this.initialHydrationComplete.set(true);
      this.syncState.set("saved");
    } catch (error) {
      this.syncState.set("error");
      throw error;
    } finally {
      this.initialized.set(true);
    }
  }

  private ensureEventSubscription(): void {
    if (this.subscribedToEvents) {
      return;
    }

    this.events
      .connect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          void this.handleEvent(event).catch(() => {
            this.syncState.set("error");
          });
        },
        error: () => {
          this.subscribedToEvents = false;
          this.syncState.set("error");
        },
        complete: () => {
          this.subscribedToEvents = false;
        }
      });

    this.subscribedToEvents = true;
  }

  private async loadWorkspace(workspaceId: string): Promise<void> {
    const generation = ++this.workspaceGeneration;
    this.syncState.set("syncing");

    try {
      const routes = await this.api.getRoutes(workspaceId);
      if (!this.isCurrentWorkspaceGeneration(generation, workspaceId)) {
        return;
      }

      this.setRoutesForWorkspace(workspaceId, routes);
      this.routeDetails.set(new Map());
      this.routeDetailGeneration.clear();

      const nextSelection = this.pickRouteSelection(routes);
      if (nextSelection) {
        await this.selectRoute(nextSelection);
        if (!this.isCurrentWorkspaceGeneration(generation, workspaceId)) {
          return;
        }
      } else {
        this.selectedRouteId.set(null);
        this.selectedRequestId.set(null);
        this.clearSelectedRouteContext();
        this.syncDraftFromSelection();
      }

      if (this.isCurrentWorkspaceGeneration(generation, workspaceId)) {
        this.syncState.set("saved");
      }
    } catch {
      if (this.isCurrentWorkspaceGeneration(generation, workspaceId)) {
        this.syncState.set("error");
      }

      throw new Error(`Failed to load workspace ${workspaceId}`);
    }
  }

  private pickRouteSelection(routes: MockdockRouteSummaryDto[]): string | null {
    const currentSelection = this.selectedRouteId();
    if (currentSelection && routes.some((item) => item.route.id === currentSelection)) {
      return currentSelection;
    }

    return [...routes]
      .sort((left, right) => right.route.lastSeenAt.localeCompare(left.route.lastSeenAt))[0]
      ?.route.id ?? null;
  }

  private async loadRouteDetails(
    routeId: string,
    options: { force: boolean; includeVariants: boolean }
  ): Promise<void> {
    const existingDetails = this.routeDetails().get(routeId);
    if (!options.force && existingDetails && (!options.includeVariants || existingDetails.variantsLoaded)) {
      this.reconcileSelectedRequest();
      return;
    }

    const workspaceId = this.getRouteById(routeId)?.route.workspaceId ?? this.activeWorkspaceId();
    if (!workspaceId) {
      return;
    }

    const workspaceGeneration = this.workspaceGeneration;
    const generation = (this.routeDetailGeneration.get(routeId) ?? 0) + 1;
    this.routeDetailGeneration.set(routeId, generation);

    const requestsPromise = this.api.getRequests(routeId);
    const variantsPromise = options.includeVariants ? this.api.getVariants(routeId) : Promise.resolve([]);
    const [requests, variants] = await Promise.all([requestsPromise, variantsPromise]);
    const presetsByVariantId = Object.fromEntries(
      await Promise.all(
        variants.map(async (variant) => [variant.id, await this.api.getPresets(variant.id)] as const)
      )
    );

    if (
      this.routeDetailGeneration.get(routeId) !== generation ||
      !this.isCurrentWorkspaceGeneration(workspaceGeneration, workspaceId)
    ) {
      return;
    }

    this.routeDetails.update((current) => {
      const next = new Map(current);
      next.set(routeId, {
        requests,
        variants,
        presetsByVariantId,
        variantsLoaded: options.includeVariants
      });
      return next;
    });
    this.reconcileSelectedRequest();
  }

  private reconcileSelectedRequest(): void {
    const selectedRequestId = this.selectedRequestId();
    if (!selectedRequestId) {
      return;
    }

    if (!this.selectedRouteRequests().some((request) => request.id === selectedRequestId)) {
      this.selectedRequestId.set(null);
    }
  }

  private async ensureSelectedRouteMemberDetails(options: { force: boolean }): Promise<void> {
    const routeView = this.selectedRouteView();
    if (!routeView) {
      return;
    }

    await Promise.all(
      routeView.memberRouteIds.map((routeId) =>
        this.loadRouteDetails(routeId, {
          force: options.force,
          includeVariants: routeId === this.selectedRouteId()
        })
      )
    );
    this.reconcileSelectedRequest();
  }

  private applySelectedPresetToDraft(preset: MockdockResponsePresetDto | null): void {
    this.cancelPendingSave();

    if (!preset) {
      this.editorSyncState.set("idle");
        this.draft.set({
          statusCode: 200,
          selectedStatusButtonKey: "2xx",
          bodyText: "",
          payloadMode: DASHBOARD_PAYLOAD_MODES[0],
          contentType: "application/json"
        });
      return;
    }

    const payloadMode = inferPayloadModeFromResponse(preset.body, preset.headers);
    this.draft.set({
      statusCode: preset.statusCode,
      selectedStatusButtonKey: getStatusToolbarSelectionKey(preset.statusCode),
      bodyText: this.formatBodyText(preset.body),
      payloadMode,
      contentType:
        normalizeContentType(preset.headers["content-type"]) ?? getContentTypeForMode(payloadMode)
    });
    this.editorSyncState.set("saved");
  }

  private syncDraftFromSelection(): void {
    const selectedRoute = this.selectedRoute();
    const selectedVariant = this.selectedVariant();
    const preset = this.activePreset();
    const sourceKey = selectedRoute && selectedVariant
      ? `${selectedRoute.route.id}:${selectedVariant.selectionKey}:${preset?.id ?? "none"}:${preset?.updatedAt ?? "none"}`
      : null;

    if (sourceKey === this.lastDraftSourceKey) {
      return;
    }

    this.lastDraftSourceKey = sourceKey;
    this.applySelectedPresetToDraft(preset);
  }

  private queueSaveIfPossible(): void {
    if (!this.selectedRouteId()) {
      this.editorSyncState.set("idle");
      return;
    }

    this.queueSave();
  }

  private queueSave(): void {
    this.editorSyncState.set("syncing");
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;

      try {
        await this.persistDraft();
        this.editorSyncState.set("saved");
      } catch {
        this.editorSyncState.set("error");
      }
    }, 400);
  }

  private async runUserSync<T>(operation: () => Promise<T>): Promise<T> {
    this.userSyncState.set("syncing");

    try {
      const result = await operation();
      this.userSyncState.set("saved");
      return result;
    } catch (error) {
      this.userSyncState.set("error");
      throw error;
    }
  }

  private async persistDraft(): Promise<void> {
    const routeId = this.selectedRouteId();
    if (!routeId) {
      return;
    }

    const selectedVariant = await this.resolveSelectedVariantForPersistence(routeId);
    if (!selectedVariant) {
      throw new Error(`Failed to resolve selected variant for route ${routeId}`);
    }

    const variant = await this.ensureSelectedVariantPersisted(routeId, selectedVariant);
    const activePreset = this.activePreset();
    if (activePreset && activePreset.routeResponseVariantId === variant.id) {
      const preset = await this.api.updatePreset(activePreset.id, this.buildPresetPayload());
      this.applyPresetUpdate(variant.id, preset, { activate: true });
      return;
    }

    const preset = await this.api.createPreset(variant.id, this.buildPresetPayload());
    await this.api.setActivePreset(variant.id, preset.id);
    this.applyPresetUpdate(variant.id, preset, { activate: true });
  }

  private async resolveSelectedVariantForPersistence(
    routeId: string
  ): Promise<DashboardVariantOption | null> {
    const selectedVariant = this.selectedVariant();
    if (selectedVariant) {
      return selectedVariant;
    }

    await this.loadRouteDetails(routeId, { force: false, includeVariants: true });
    return this.selectedVariant();
  }

  private buildPresetPayload(): CreatePresetInput {
    const sourcePreset = this.activePreset();

    return {
      name: sourcePreset?.name ?? "Preset",
      statusCode: this.draftStatusCode(),
      headers: this.buildPresetHeaders(),
      body: this.buildDraftPayload(),
      delayMs: sourcePreset?.delayMs ?? 0
    };
  }

  private buildPresetPayloadFromEditorDraft(
    draft: DashboardResponseEditorDraft,
    name?: string
  ): CreatePresetInput {
    const sourcePreset = this.activePreset();

    return {
      name: name?.trim() || sourcePreset?.name || "Preset",
      statusCode: draft.statusCode,
      headers: this.buildPresetHeadersForContentType(draft.contentType),
      body: draft.payload,
      delayMs: Math.max(0, Math.trunc(draft.delayMs))
    };
  }

  private buildPresetPayloadFromPreset(
    preset: MockdockResponsePresetDto,
    name: string
  ): CreatePresetInput {
    return {
      name,
      statusCode: preset.statusCode,
      headers: { ...preset.headers },
      body: preset.body,
      delayMs: preset.delayMs
    };
  }

  private buildPresetHeaders(): Record<string, string> {
    const sourcePreset = this.activePreset();
    const headers = { ...(sourcePreset?.headers ?? {}) };
    const contentType = normalizeContentType(this.draftContentType());

    return this.applyContentTypeToHeaders(headers, contentType);
  }

  private buildPresetHeadersForContentType(contentType: string): Record<string, string> {
    const sourcePreset = this.activePreset();
    return this.applyContentTypeToHeaders(
      { ...(sourcePreset?.headers ?? {}) },
      normalizeContentType(contentType)
    );
  }

  private applyContentTypeToHeaders(
    headers: Record<string, string>,
    contentType: string | null
  ): Record<string, string> {
    if (contentType) {
      headers["content-type"] = contentType;
    } else {
      delete headers["content-type"];
    }

    return headers;
  }

  private buildDraftPayload(): ResponsePayloadDto {
    const bodyText = this.draftBodyText();
    switch (this.draftPayloadMode()) {
      case "JSON":
        return {
          kind: "json",
          value: bodyText.trim() ? JSON.parse(bodyText) : null
        };
      case "XML":
        return { kind: "xml", value: bodyText };
      case "Form Data":
        return { kind: "formData", entries: [] };
      case "URL Encoded":
        return { kind: "urlEncoded", entries: [] };
      case "Binary":
        return {
          kind: "binary",
          fileName: "payload.bin",
          mimeType: this.draftContentType() || "application/octet-stream",
          base64: bodyText,
          sizeBytes: bodyText ? atob(bodyText).length : 0
        };
      case "Raw":
        return { kind: "raw", value: bodyText };
      case "Text":
      default:
        return { kind: "text", value: bodyText };
    }
  }

  private formatBodyText(body: ResponsePayloadDto): string {
    switch (body.kind) {
      case "json":
        return body.value === null || body.value === undefined ? "" : JSON.stringify(body.value, null, 2);
      case "text":
      case "xml":
      case "raw":
        return body.value;
      case "binary":
        return body.base64;
      case "formData":
      case "urlEncoded":
        return "";
    }
  }

  private applyPresetUpdate(
    variantId: string,
    preset: MockdockResponsePresetDto,
    options: { activate: boolean }
  ): void {
    this.routeDetails.update((current) => {
      const next = new Map(current);

      for (const [routeId, details] of current.entries()) {
        if (!(variantId in details.presetsByVariantId)) {
          continue;
        }

        next.set(routeId, {
          ...details,
          variants: details.variants.map((variant) =>
            variant.id === variantId
              ? {
                  ...variant,
                  activeResponsePresetId: options.activate ? preset.id : variant.activeResponsePresetId
                }
              : variant
          ),
          presetsByVariantId: {
            ...details.presetsByVariantId,
            [variantId]: [
              ...(details.presetsByVariantId[variantId] ?? []).filter((item) => item.id !== preset.id),
              preset
            ]
          }
        });
      }

      return next;
    });
    this.syncDraftFromSelection();
  }

  private applyPresetDelete(
    variantId: string,
    presetId: string,
    nextActivePresetId: string | null
  ): void {
    this.routeDetails.update((current) => {
      const next = new Map(current);

      for (const [routeId, details] of current.entries()) {
        if (!(variantId in details.presetsByVariantId)) {
          continue;
        }

        next.set(routeId, {
          ...details,
          variants: details.variants.map((variant) =>
            variant.id === variantId
              ? {
                  ...variant,
                  activeResponsePresetId: nextActivePresetId ?? variant.activeResponsePresetId
                }
              : variant
          ),
          presetsByVariantId: {
            ...details.presetsByVariantId,
            [variantId]: (details.presetsByVariantId[variantId] ?? []).filter(
              (preset) => preset.id !== presetId
            )
          }
        });
      }

      return next;
    });
    this.syncDraftFromSelection();
  }

  private applyVariantDelete(variantId: string): void {
    this.routeDetails.update((current) => {
      const next = new Map(current);

      for (const [routeId, details] of current.entries()) {
        if (!details.variants.some((variant) => variant.id === variantId)) {
          continue;
        }

        const { [variantId]: _removedPresets, ...presetsByVariantId } = details.presetsByVariantId;
        next.set(routeId, {
          ...details,
          variants: details.variants.filter((variant) => variant.id !== variantId),
          presetsByVariantId
        });
      }

      return next;
    });
  }

  private applyRouteUpdate(routeId: string, route: MockdockRouteSummaryDto["route"]): void {
    this.routesByWorkspaceId.update((current) => {
      const next = { ...current };

      for (const [workspaceId, routes] of Object.entries(current)) {
        if (!routes.some((item) => item.route.id === routeId)) {
          continue;
        }

        next[workspaceId] = routes.map((item) =>
          item.route.id === routeId ? { ...item, route: { ...item.route, ...route } } : item
        );
      }

      return next;
    });
  }

  private getDefaultVariantPresetFallback(
    selectedVariant: DashboardVariantOption
  ): MockdockResponsePresetDto | null {
    if (selectedVariant.selectionKey === "default") {
      return null;
    }

    const defaultVariant = this.selectedVariantOptions().find((variant) => variant.selectionKey === "default");
    if (!defaultVariant?.variantId) {
      return null;
    }

    const details = this.selectedRouteDetails();
    return (
      details?.presetsByVariantId[defaultVariant.variantId]?.find(
        (preset) => preset.id === defaultVariant.activeResponsePresetId
      ) ?? null
    );
  }

  private async ensureSelectedVariantPersisted(
    routeId: string,
    selectedVariant: DashboardVariantOption
  ): Promise<MockdockRouteResponseVariantDto> {
    if (selectedVariant.variantId) {
      const existing = this.selectedRouteDetails()?.variants.find(
        (variant) => variant.id === selectedVariant.variantId
      );
      if (existing) {
        return existing;
      }
    }

    const createdVariant = await this.api.createVariant(routeId, {
      querySignature: selectedVariant.querySignature,
      queryDisplay: selectedVariant.queryDisplay
    });

    this.routeDetails.update((current) => {
      const details = current.get(routeId);
      if (!details) {
        return current;
      }

      const next = new Map(current);
      next.set(routeId, {
        ...details,
        variants: [...details.variants.filter((variant) => variant.id !== createdVariant.id), createdVariant],
        presetsByVariantId: {
          ...details.presetsByVariantId,
          [createdVariant.id]: details.presetsByVariantId[createdVariant.id] ?? []
        }
      });
      return next;
    });
    this.selectedVariantKey.set(this.buildVariantSelectionKey(createdVariant.querySignature));

    return createdVariant;
  }

  private normalizeQuerySignature(
    query: Record<string, string | string[]>
  ): Record<string, string | string[]> | null {
    const entries = Object.entries(query)
      .filter(([, value]) => {
        if (Array.isArray(value)) {
          return value.length > 0;
        }

        return value !== "";
      })
      .map(([key, value]) => [key, Array.isArray(value) ? [...value] : value] as const)
      .sort(([left], [right]) => left.localeCompare(right));

    if (entries.length === 0) {
      return null;
    }

    return Object.fromEntries(entries);
  }

  private buildVariantSelectionKey(
    querySignature: Record<string, string | string[]> | null
  ): string {
    if (!querySignature) {
      return "default";
    }

    return JSON.stringify(querySignature);
  }

  private formatQueryDisplay(querySignature: Record<string, string | string[]> | null): string {
    if (!querySignature) {
      return "Default response";
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(querySignature)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          params.append(key, item);
        }
        continue;
      }

      params.append(key, value);
    }

    const query = params.toString();
    return query ? `?${query}` : "Default response";
  }

  private cancelPendingSave(): void {
    if (!this.saveTimer) {
      return;
    }

    clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private setEditorError(error: unknown, fallbackMessage: string): void {
    this.editorSyncState.set("error");
    this.editorErrorMessage.set(this.getErrorMessage(error, fallbackMessage));
  }

  private getErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof ApiError) {
      return error.message || fallbackMessage;
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return fallbackMessage;
  }

  private async handleEvent(event: MockdockEventMessage): Promise<void> {
    if (event.type === "request_received") {
      await this.ensureWorkspacePresent(event.payload.workspaceId);
      this.ensureActiveWorkspaceSelection(event.payload.workspaceId);
      this.markRouteAsNew(event.payload.routePatternId);
      this.syncState.set("syncing");

      await this.refreshWorkspaceRoutes(event.payload.workspaceId);
      const selectedRouteId = this.selectedRouteId();
      const selectedRouteView = this.selectedRouteView();
      const selectedRouteShouldRefresh =
        selectedRouteId === event.payload.routePatternId ||
        selectedRouteView?.memberRouteIds.includes(event.payload.routePatternId);
      if (selectedRouteShouldRefresh && selectedRouteId) {
        await this.refreshSelectedRouteData(selectedRouteId);
      }
      this.syncState.set("saved");
      return;
    }

    if (event.type === "route_pattern_updated") {
      await this.ensureWorkspacePresent(event.payload.workspaceId);
      this.ensureActiveWorkspaceSelection(event.payload.workspaceId);
      this.syncState.set("syncing");

      await this.refreshWorkspaceRoutes(event.payload.workspaceId);
      this.syncState.set("saved");
      return;
    }

    const activeWorkspaceId = this.activeWorkspaceId();
    if (!activeWorkspaceId) {
      return;
    }

    if (event.type === "response_preset_updated" || event.type === "active_preset_changed") {
      if (!this.routeBelongsToActiveWorkspace(event.payload.routePatternId)) {
        return;
      }

      this.syncState.set("syncing");
      await this.refreshSelectedRouteData(event.payload.routePatternId);
      await this.refreshWorkspaceRoutes(activeWorkspaceId);
      this.syncState.set("saved");
    }
  }

  private async ensureWorkspacePresent(workspaceId: string): Promise<void> {
    if (this.workspaces().some((workspace) => workspace.id === workspaceId)) {
      return;
    }

    const workspaces = await this.api.getWorkspaces();
    this.setWorkspaceList(workspaces);
  }

  private async refreshWorkspaceRoutes(workspaceId: string): Promise<void> {
    const generation = this.workspaceGeneration;
    const routes = await this.api.getRoutes(workspaceId);
    const isActiveWorkspace = workspaceId === this.activeWorkspaceId();
    if (isActiveWorkspace && !this.isCurrentWorkspaceGeneration(generation, workspaceId)) {
      return;
    }

    this.setRoutesForWorkspace(workspaceId, routes);

    const selectedRoute = this.selectedRoute();
    if (selectedRoute?.route.workspaceId === workspaceId) {
      this.syncSelectedRouteContext();
      this.syncDraftFromSelection();
    }

    const selectedRouteId = this.selectedRouteId();
    if (!selectedRouteId) {
      if (!isActiveWorkspace) {
        return;
      }

      const nextSelection = this.pickRouteSelection(routes);
      if (nextSelection) {
        await this.selectRoute(nextSelection);
        return;
      }

      this.selectedRouteId.set(null);
      this.selectedRequestId.set(null);
      this.clearSelectedRouteContext();
      this.syncDraftFromSelection();
      return;
    }

    if (routes.some((item) => item.route.id === selectedRouteId)) {
      return;
    }

    if (!isActiveWorkspace) {
      return;
    }

    const nextSelection = this.pickRouteSelection(routes);
    if (nextSelection) {
      await this.selectRoute(nextSelection);
      return;
    }

    this.selectedRouteId.set(null);
    this.selectedRequestId.set(null);
    this.clearSelectedRouteContext();
    this.syncDraftFromSelection();
  }

  private async refreshSelectedRouteData(routeId: string): Promise<void> {
    if (routeId !== this.selectedRouteId()) {
      return;
    }

    await this.loadRouteDetails(routeId, { force: true, includeVariants: true });
  }

  private isCurrentWorkspaceGeneration(generation: number, workspaceId: string): boolean {
    return generation === this.workspaceGeneration && workspaceId === this.activeWorkspaceId();
  }

  private ensureActiveWorkspaceSelection(workspaceId: string): void {
    if (this.activeWorkspaceId()) {
      return;
    }

    this.activeWorkspaceId.set(workspaceId);
    this.preferences.setWorkspaceId(workspaceId);
    this.setExpandedWorkspace(workspaceId);
  }

  private routeBelongsToActiveWorkspace(routeId: string): boolean {
    return this.getRoutesForWorkspace(this.activeWorkspaceId()).some((item) => item.route.id === routeId);
  }

  private getRouteById(routeId: string): MockdockRouteSummaryDto | null {
    return this.getAllRoutes().find((item) => item.route.id === routeId) ?? null;
  }

  private syncSelectedRouteContext(): void {
    const selectedRoute = this.selectedRoute();
    if (!selectedRoute) {
      this.clearSelectedRouteContext();
      return;
    }

    const nextBaseSegments = tokenizeRoutePattern(selectedRoute.route.examplePath);
    this.selectedRouteBaseSegments.set(nextBaseSegments);
  }

  private resolveSelectedRouteBaseSegments(selectedRoute: MockdockRouteSummaryDto): string[] {
    const baseSegments = this.selectedRouteBaseSegments();
    if (baseSegments.length > 0 || selectedRoute.route.pattern === "/") {
      return baseSegments;
    }

    return tokenizeRoutePattern(selectedRoute.route.examplePath);
  }

  private clearSelectedRouteContext(): void {
    this.selectedRouteBaseSegments.set([]);
    this.selectedVariantKey.set("default");
  }

  private setDraftStatusCode(statusCode: number, selectedStatusButtonKey: DashboardStatusToolbarSelectionKey): void {
    this.draft.update((current) => ({ ...current, statusCode, selectedStatusButtonKey }));
  }

  private formatStatusToolbarLabel(draft: DraftState): string {
    if (draft.selectedStatusButtonKey === "custom") {
      return `(${draft.statusCode}) Custom code`;
    }

    return String(draft.statusCode);
  }

  private getAllRoutes(): MockdockRouteSummaryDto[] {
    return Object.values(this.routesByWorkspaceId()).flat();
  }

  private upsertRouteLocally(routeSummary: MockdockRouteSummaryDto): void {
    this.routesByWorkspaceId.update((current) => {
      const workspaceId = routeSummary.route.workspaceId;
      const nextRoutes = [
        routeSummary,
        ...(current[workspaceId] ?? []).filter((item) => item.route.id !== routeSummary.route.id)
      ];

      return {
        ...current,
        [workspaceId]: nextRoutes
      };
    });
  }

  private removeRouteLocally(routeId: string): void {
    this.removeRoutesLocally([routeId], []);
  }

  private removeRoutesLocally(routeIds: string[], deletedWorkspaceIds: string[]): void {
    const routeIdSet = new Set(routeIds);
    if (routeIdSet.size === 0 && deletedWorkspaceIds.length === 0) {
      return;
    }

    const affectedWorkspaceIds = Object.entries(this.routesByWorkspaceId())
      .filter(([, routes]) => routes.some((item) => routeIdSet.has(item.route.id)))
      .map(([workspaceId]) => workspaceId);
    const deletedWorkspaceIdSet = new Set(deletedWorkspaceIds);
    const selectedRouteWasDeleted = !!this.selectedRouteId() && routeIdSet.has(this.selectedRouteId() ?? "");
    const previousActiveWorkspaceId = this.activeWorkspaceId();

    this.routesByWorkspaceId.update((current) => {
      const next = { ...current };
      for (const [workspaceId, routes] of Object.entries(current)) {
        if (deletedWorkspaceIdSet.has(workspaceId)) {
          delete next[workspaceId];
          continue;
        }

        const remainingRoutes = routes.filter((item) => !routeIdSet.has(item.route.id));
        if (remainingRoutes.length > 0) {
          next[workspaceId] = remainingRoutes;
        } else {
          delete next[workspaceId];
          if (affectedWorkspaceIds.includes(workspaceId)) {
            deletedWorkspaceIdSet.add(workspaceId);
          }
        }
      }

      return next;
    });

    this.removeRoutesFromDetailCache([...routeIdSet]);

    this.unseenRouteIds.update((current) => {
      const next = new Set(current);
      for (const routeId of routeIdSet) {
        next.delete(routeId);
      }
      this.titleBadge.setUnread(next.size);
      return next;
    });

    const nextDeletedWorkspaceIds = [...deletedWorkspaceIdSet];
    if (nextDeletedWorkspaceIds.length > 0) {
      this.removeWorkspacesLocally(nextDeletedWorkspaceIds);
    }

    if (selectedRouteWasDeleted || (previousActiveWorkspaceId && deletedWorkspaceIdSet.has(previousActiveWorkspaceId))) {
      this.reconcileSelectionAfterDelete(previousActiveWorkspaceId);
    }
  }

  private removeRoutesFromDetailCache(routeIds: string[]): void {
    for (const routeId of routeIds) {
      this.routeDetailGeneration.delete(routeId);
    }

    this.routeDetails.update((current) => {
      const next = new Map(current);
      for (const routeId of routeIds) {
        next.delete(routeId);
      }
      return next;
    });
  }

  private removeWorkspacesLocally(workspaceIds: string[]): void {
    const workspaceIdSet = new Set(workspaceIds);
    this.updateWorkspaceList((current) =>
      current.filter((workspace) => !workspaceIdSet.has(workspace.id))
    );

    this.routesByWorkspaceId.update((current) => {
      const next = { ...current };
      for (const workspaceId of workspaceIdSet) {
        delete next[workspaceId];
      }
      return next;
    });
  }

  private reconcileSelectionAfterDelete(preferredWorkspaceId: string | null): void {
    this.selectedRequestId.set(null);
    this.clearSelectedRouteContext();

    const preferredRoutes = this.getRoutesForWorkspace(preferredWorkspaceId);
    const preferredRouteId = this.pickRouteSelection(preferredRoutes);
    if (preferredWorkspaceId && preferredRouteId) {
      this.activeWorkspaceId.set(preferredWorkspaceId);
      this.preferences.setWorkspaceId(preferredWorkspaceId);
      this.setExpandedWorkspace(preferredWorkspaceId);
      void this.selectRoute(preferredRouteId);
      return;
    }

    const fallbackWorkspace = this.workspaces()[0] ?? null;
    if (!fallbackWorkspace) {
      this.activeWorkspaceId.set(null);
      this.preferences.setWorkspaceId("");
      this.selectedRouteId.set(null);
      this.syncDraftFromSelection();
      return;
    }

    this.activeWorkspaceId.set(fallbackWorkspace.id);
    this.preferences.setWorkspaceId(fallbackWorkspace.id);
    this.setExpandedWorkspace(fallbackWorkspace.id);
    const fallbackRouteId = this.pickRouteSelection(this.getRoutesForWorkspace(fallbackWorkspace.id));
    if (fallbackRouteId) {
      void this.selectRoute(fallbackRouteId);
      return;
    }

    this.selectedRouteId.set(null);
    this.syncDraftFromSelection();
  }

  private getRoutesForWorkspace(workspaceId: string | null): MockdockRouteSummaryDto[] {
    if (!workspaceId) {
      return [];
    }

    return this.routesByWorkspaceId()[workspaceId] ?? [];
  }

  private setRoutesForWorkspace(workspaceId: string, routes: MockdockRouteSummaryDto[]): void {
    this.routesByWorkspaceId.update((current) => ({
      ...current,
      [workspaceId]: routes
    }));
  }

  private setWorkspaceList(
    workspaces: WorkspaceDto[],
    preferredOrder: string[] = this.preferences.getWorkspaceOrder()
  ): void {
    const ordered = this.orderWorkspaces(workspaces, preferredOrder);
    this.workspaces.set(ordered);
    this.preferences.setWorkspaceOrder(ordered.map((workspace) => workspace.id));
  }

  private updateWorkspaceList(updater: (current: WorkspaceDto[]) => WorkspaceDto[]): void {
    this.setWorkspaceList(updater(this.workspaces()), this.workspaces().map((workspace) => workspace.id));
  }

  private orderWorkspaces(workspaces: WorkspaceDto[], preferredOrder: string[]): WorkspaceDto[] {
    const orderIndexByWorkspaceId = new Map(
      preferredOrder.map((workspaceId, index) => [workspaceId, index])
    );

    return [...workspaces]
      .map((workspace, index) => ({ workspace, index }))
      .sort((left, right) => {
        const leftOrder = orderIndexByWorkspaceId.get(left.workspace.id);
        const rightOrder = orderIndexByWorkspaceId.get(right.workspace.id);

        if (leftOrder !== undefined && rightOrder !== undefined) {
          return leftOrder - rightOrder;
        }

        if (leftOrder !== undefined) {
          return -1;
        }

        if (rightOrder !== undefined) {
          return 1;
        }

        return left.index - right.index;
      })
      .map(({ workspace }) => workspace);
  }

  private sortRoutes(routes: MockdockRouteSummaryDto[]): MockdockRouteSummaryDto[] {
    const mode = this.routeSort();

    return [...routes].sort((left, right) => {
      if (mode === "name") {
        return left.route.pattern.localeCompare(right.route.pattern);
      }

      if (mode === "hits") {
        return right.route.hitCount - left.route.hitCount;
      }

      return right.route.lastSeenAt.localeCompare(left.route.lastSeenAt);
    });
  }

  private setExpandedWorkspace(workspaceId: string | null): void {
    this.workspaceExpandedState.set(
      Object.fromEntries(
        this.workspaces().map((workspace) => [workspace.id, workspace.id === workspaceId])
      )
    );
  }

  private async loadInactiveWorkspaceRoutes(activeWorkspaceId: string | null): Promise<void> {
    const inactiveWorkspaces = this.workspaces().filter((workspace) => workspace.id !== activeWorkspaceId);
    await Promise.all(
      inactiveWorkspaces.map(async (workspace) => {
        try {
          const routes = await this.api.getRoutes(workspace.id);
          this.setRoutesForWorkspace(workspace.id, routes);
        } catch {
          // Keep the active workspace usable even if background workspace hydration fails.
        }
      })
    );
  }
}
