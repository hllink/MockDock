import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from "@angular/core";
import type { ResponseFieldEntryDto, ResponsePayloadDto } from "@mockdock/shared";

import { I18nService } from "../../core/i18n/i18n.service";
import { DashboardStore } from "../dashboard.store";
import {
  DASHBOARD_PAYLOAD_MODES,
  type DashboardPayloadMode,
  type DashboardResponseEditorDraft
} from "../dashboard.models";
import {
  getContentTypeForMode,
  getPayloadModeForContentType,
  getStatusToolbarSelectionKey,
  inferPayloadModeFromResponse,
  isValidStatusCode,
  normalizeContentType,
  type DashboardStatusToolbarSelectionKey
} from "../response-draft.helpers";
import { ResponseStatusToolbarComponent } from "./response-status-toolbar.component";
import { CodeEditorComponent } from "./code-editor.component";
import type { MockdockResponsePresetDto } from "../../core/mockdock-api.models";

type ContentTypeOption = {
  label: string;
  value: string;
};

type StatusSelectionChange = {
  key: "2xx" | "3xx" | "4xx" | "5xx";
  statusCode: number;
};

interface EditorDraftState extends DashboardResponseEditorDraft {
  selectedStatusButtonKey: DashboardStatusToolbarSelectionKey;
  codeValue: string;
}

const FALLBACK_CONTENT_TYPE_OPTIONS: readonly ContentTypeOption[] = [
  { label: "None", value: "" },
  { label: "application/json", value: "application/json" },
  { label: "text/plain; charset=utf-8", value: "text/plain; charset=utf-8" },
  { label: "application/xml", value: "application/xml" },
  { label: "multipart/form-data", value: "multipart/form-data" },
  { label: "application/x-www-form-urlencoded", value: "application/x-www-form-urlencoded" },
  { label: "application/octet-stream", value: "application/octet-stream" }
] as const;

const DELAY_CHIP_VALUES = [100, 300, 1000, 5000, 10000] as const;

@Component({
  selector: "app-response-editor",
  standalone: true,
  imports: [ResponseStatusToolbarComponent, CodeEditorComponent],
  templateUrl: "./response-editor.component.html",
  styleUrl: "./response-editor.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResponseEditorComponent {
  protected readonly i18n = inject(I18nService);
  private readonly store = inject(DashboardStore) as Partial<DashboardStore>;
  private readonly fallbackPayloadModes = DASHBOARD_PAYLOAD_MODES;
  private readonly fallbackContentTypeOptions = FALLBACK_CONTENT_TYPE_OPTIONS;
  private readonly draft = signal<EditorDraftState>(this.buildEmptyDraft());
  private readonly draftBaseline = signal(this.serializeDraft(this.buildEmptyDraft()));
  private readonly fullscreenDialog = viewChild<ElementRef<HTMLDialogElement>>("fullscreenCodeEditorDialog");
  private readonly presetDialogMode = signal<"create" | "rename" | null>(null);
  private readonly presetDialogName = signal("");
  private readonly deletePresetConfirmOpen = signal(false);
  private readonly fullscreenCodeEditorOpen = signal(false);
  private readonly deletingPreset = signal(false);
  private readonly editorResetToken = signal("");
  private readonly jsonErrorMessage = signal("");
  private readonly localErrorMessage = signal("");
  protected readonly isDirty = computed(
    () => this.serializeDraft(this.draft()) !== this.draftBaseline()
  );
  protected readonly delayChipValues = DELAY_CHIP_VALUES;

  constructor() {
    effect(() => {
      const routeId = this.store.selectedRouteId?.() ?? "no-route";
      const selectedRequestId = this.store.selectedRequestId?.() ?? "no-request";
      const selectedVariant = this.store.selectedVariant?.() ?? null;
      const preset = this.store.activePreset?.() ?? null;
      const nextDraft = this.buildDraftFromPreset(preset);
      this.draft.set(nextDraft);
      this.draftBaseline.set(this.serializeDraft(nextDraft));
      this.presetDialogMode.set(null);
      this.presetDialogName.set("");
      this.deletePresetConfirmOpen.set(false);
      this.fullscreenCodeEditorOpen.set(false);
      this.deletingPreset.set(false);
      this.jsonErrorMessage.set("");
      this.localErrorMessage.set("");
      this.editorResetToken.set(
        [
          routeId,
          selectedRequestId,
          selectedVariant?.selectionKey ?? "no-variant",
          selectedVariant?.saved ? "saved" : "captured",
          preset?.id ?? "no-preset",
          preset?.updatedAt ?? "no-update"
        ].join(":")
      );
    });

    effect(() => {
      const dialog = this.fullscreenDialog()?.nativeElement ?? null;
      const shouldOpen = this.fullscreenCodeEditorOpen();
      if (!dialog) {
        return;
      }

      if (shouldOpen && !dialog.open) {
        dialog.showModal();
        return;
      }

      if (!shouldOpen && dialog.open) {
        dialog.close();
      }
    });
  }

  protected syncState(): string {
    switch (this.syncStateKey()) {
      case "syncing":
        return this.i18n.t("responseEditor.syncStateSyncing");
      case "saved":
        return this.i18n.t("responseEditor.syncStateSaved");
      case "error":
        return this.i18n.t("responseEditor.syncStateError");
      default:
        return this.i18n.t("responseEditor.syncStateIdle");
    }
  }

  protected syncStateKey(): "idle" | "syncing" | "saved" | "error" {
    return (this.store.editorSyncState?.() ?? "idle") as "idle" | "syncing" | "saved" | "error";
  }

  protected payloadModes(): readonly DashboardPayloadMode[] {
    return this.store.payloadModes ?? this.fallbackPayloadModes;
  }

  protected contentTypeOptions(): readonly ContentTypeOption[] {
    return (this.store.contentTypeOptions ?? this.fallbackContentTypeOptions).map((option) => ({
      ...option,
      label: option.value ? option.label : this.i18n.t("common.none")
    }));
  }

  protected availablePresets(): MockdockResponsePresetDto[] {
    return this.store.selectedVariantPresets?.() ?? [];
  }

  protected activePresetId(): string {
    return this.store.activePreset?.()?.id ?? "";
  }

  protected variantLabel(): string {
    return this.store.selectedVariant?.()?.queryDisplay ?? this.i18n.t("responseEditor.defaultResponse");
  }

  protected isSavedVariant(): boolean {
    return this.store.selectedVariant?.()?.saved ?? false;
  }

  protected isPresetDialogOpen(): boolean {
    return this.presetDialogMode() !== null;
  }

  protected presetDialogTitle(): string {
    return this.presetDialogMode() === "create"
      ? this.i18n.t("responseEditor.newPreset")
      : this.i18n.t("responseEditor.renamePresetTitle");
  }

  protected presetDialogConfirmLabel(): string {
    return this.presetDialogMode() === "create"
      ? this.i18n.t("responseEditor.createPreset")
      : this.i18n.t("responseEditor.saveName");
  }

  protected canRenameActivePreset(): boolean {
    return !!this.activePresetId();
  }

  protected canDeleteActivePreset(): boolean {
    const activePreset = this.store.activePreset?.() ?? null;
    return !!activePreset && !activePreset.isSystem && this.availablePresets().length > 1;
  }

  protected activePresetName(): string {
    return this.store.activePreset?.()?.name ?? this.i18n.t("responseEditor.presetFallbackName");
  }

  protected isDeletePresetConfirmOpen(): boolean {
    return this.deletePresetConfirmOpen();
  }

  protected isDeletingPreset(): boolean {
    return this.deletingPreset();
  }

  protected presetDialogNameValue(): string {
    return this.presetDialogName();
  }

  protected draftStatusCode(): number {
    return this.draft().statusCode;
  }

  protected selectedStatusButtonKey(): string {
    return this.draft().selectedStatusButtonKey;
  }

  protected selectedStatusButtonLabel(): string {
    const draft = this.draft();
    return draft.selectedStatusButtonKey === "custom"
      ? `(${draft.statusCode}) ${this.i18n.t("responseStatus.customCode")}`
      : String(draft.statusCode);
  }

  protected draftPayloadMode(): DashboardPayloadMode {
    return this.draft().payloadMode;
  }

  protected draftContentType(): string {
    return this.draft().contentType;
  }

  protected draftDelayMs(): number {
    return this.draft().delayMs;
  }

  protected hasSimulatedDelay(): boolean {
    return this.draft().delayMs > 0;
  }

  protected delayBadgeLabel(): string {
    return this.i18n.t("responseEditor.delayActiveBadge", {
      delayMs: this.draft().delayMs
    });
  }

  protected codeEditorValue(): string {
    return this.draft().codeValue;
  }

  protected codeEditorResetToken(): string {
    return this.editorResetToken();
  }

  protected jsonError(): string {
    return this.jsonErrorMessage();
  }

  protected saveErrorMessage(): string {
    const remoteError = this.store.editorErrorMessage?.() ?? "";
    const localError = this.localErrorMessage();
    if (remoteError) {
      return `${this.i18n.t("responseEditor.saveErrorPrefix")} ${this.humanizeErrorMessage(remoteError)}`;
    }

    return localError;
  }

  protected fieldEntries(): ResponseFieldEntryDto[] {
    const payload = this.draft().payload;
    if (payload.kind === "formData" || payload.kind === "urlEncoded") {
      return payload.entries;
    }

    return [];
  }

  protected binaryPayload() {
    const payload = this.draft().payload;
    return payload.kind === "binary" ? payload : null;
  }

  protected editorLanguage(): "json" | "xml" | "plain" {
    switch (this.draft().payload.kind) {
      case "json":
        return "json";
      case "xml":
        return "xml";
      default:
        return "plain";
    }
  }

  protected isCodeEditorMode(): boolean {
    const kind = this.draft().payload.kind;
    return kind === "json" || kind === "text" || kind === "xml" || kind === "raw";
  }

  protected isFullscreenCodeEditorOpen(): boolean {
    return this.fullscreenCodeEditorOpen();
  }

  protected isFieldEditorMode(): boolean {
    const kind = this.draft().payload.kind;
    return kind === "formData" || kind === "urlEncoded";
  }

  protected openFullscreenCodeEditor(): void {
    if (!this.isCodeEditorMode()) {
      return;
    }

    this.fullscreenCodeEditorOpen.set(true);
  }

  protected closeFullscreenCodeEditor(): void {
    this.fullscreenCodeEditorOpen.set(false);
  }

  protected handleFullscreenDialogClose(): void {
    if (this.fullscreenCodeEditorOpen()) {
      this.fullscreenCodeEditorOpen.set(false);
    }
  }

  protected updateDraftStatusCode(statusCode: number): void {
    this.updateDraft((current) => ({
      ...current,
      statusCode,
      selectedStatusButtonKey: getStatusToolbarSelectionKey(statusCode)
    }));
  }

  protected selectDraftStatusCode(selection: StatusSelectionChange): void {
    this.updateDraft((current) => ({
      ...current,
      statusCode: selection.statusCode,
      selectedStatusButtonKey: selection.key
    }));
  }

  protected setCustomDraftStatusCode(statusCode: number): void {
    if (!isValidStatusCode(statusCode)) {
      return;
    }

    this.updateDraft((current) => ({
      ...current,
      statusCode,
      selectedStatusButtonKey: "custom"
    }));
  }

  protected setDraftPayloadMode(payloadMode: DashboardPayloadMode): void {
    this.updateDraft((current) => {
      const contentType = getContentTypeForMode(payloadMode) ?? "";
      const nextPayload = this.convertPayloadForMode(
        this.getEditableSourcePayload(current),
        payloadMode,
        contentType
      );
      return {
        ...current,
        payloadMode,
        contentType,
        codeValue: this.isCodePayloadMode(payloadMode) ? this.payloadToString(nextPayload) : "",
        payload: nextPayload
      };
    });

    if (!this.isCodePayloadMode(payloadMode)) {
      this.closeFullscreenCodeEditor();
    }
  }

  protected setDraftContentType(contentType: string): void {
    const nextContentType = normalizeContentType(contentType) ?? "";
    this.updateDraft((current) => {
      const payloadMode = getPayloadModeForContentType(nextContentType, current.payload);
      const nextPayload = this.convertPayloadForMode(
        this.getEditableSourcePayload(current),
        payloadMode,
        nextContentType
      );
      return {
        ...current,
        contentType: nextContentType,
        payloadMode,
        codeValue: this.isCodePayloadMode(payloadMode) ? this.payloadToString(nextPayload) : "",
        payload: nextPayload
      };
    });

    if (!this.isCodeEditorMode()) {
      this.closeFullscreenCodeEditor();
    }
  }

  protected updateCodeEditorValue(value: string): void {
    if (this.draft().payloadMode === "JSON") {
      this.jsonErrorMessage.set(this.validateJson(value));
    } else {
      this.jsonErrorMessage.set("");
    }

    this.updateDraft((current) => ({
      ...current,
      codeValue: value
    }));
  }

  protected setDraftDelay(value: string | number): void {
    const parsed = typeof value === "number" ? value : Number.parseInt(value.trim() || "0", 10);
    const nextDelay = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    this.updateDraft((current) => ({
      ...current,
      delayMs: nextDelay
    }));
  }

  protected applyDelayChip(delayMs: number): void {
    this.setDraftDelay(delayMs);
  }

  protected addFieldEntry(): void {
    this.updateDraft((current) => ({
      ...current,
      payload: this.updateFieldPayload(current.payload, (entries) => [...entries, { key: "", value: "" }])
    }));
  }

  protected updateFieldEntry(index: number, field: "key" | "value", value: string): void {
    this.updateDraft((current) => ({
      ...current,
      payload: this.updateFieldPayload(current.payload, (entries) =>
        entries.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, [field]: value } : entry
        )
      )
    }));
  }

  protected removeFieldEntry(index: number): void {
    this.updateDraft((current) => ({
      ...current,
      payload: this.updateFieldPayload(current.payload, (entries) => {
        const nextEntries = entries.filter((_, entryIndex) => entryIndex !== index);
        return nextEntries.length > 0 ? nextEntries : [{ key: "", value: "" }];
      })
    }));
  }

  protected async updateBinaryFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (!file) {
      return;
    }

    this.localErrorMessage.set("");

    try {
      const base64 = await this.readFileAsBase64(file);
      this.updateDraft((current) => {
        const nextMimeType = file.type || current.contentType || "application/octet-stream";
        return {
          ...current,
          contentType: nextMimeType,
          payloadMode: "Binary",
          payload: {
            kind: "binary",
            fileName: file.name,
            mimeType: nextMimeType,
            base64,
            sizeBytes: file.size
          }
        };
      });
    } catch (error) {
      this.localErrorMessage.set(this.humanizeErrorMessage(error instanceof Error ? error.message : ""));
    } finally {
      if (input) {
        input.value = "";
      }
    }
  }

  protected clearBinaryFile(): void {
    this.updateDraft((current) => ({
      ...current,
      payload: {
        kind: "binary",
        fileName: "payload.bin",
        mimeType: current.contentType || "application/octet-stream",
        base64: "",
        sizeBytes: 0
      }
    }));
  }

  protected async saveDraft(): Promise<void> {
    if (!this.isDirty()) {
      return;
    }

    this.localErrorMessage.set("");
    await this.store.saveResponseDraft?.(this.buildSaveDraft());
  }

  protected revertDraft(): void {
    const preset = this.store.activePreset?.() ?? null;
    const nextDraft = this.buildDraftFromPreset(preset);
    this.draft.set(nextDraft);
    this.draftBaseline.set(this.serializeDraft(nextDraft));
  }

  protected async createPresetFromDraft(): Promise<void> {
    await this.store.createPresetFromResponseDraft?.(this.buildSaveDraft());
  }

  protected openCreatePresetDialog(): void {
    this.presetDialogMode.set("create");
    this.presetDialogName.set(this.i18n.t("responseEditor.presetDefaultDraftName"));
  }

  protected openRenamePresetDialog(): void {
    const activePreset = this.store.activePreset?.() ?? null;
    if (!activePreset) {
      return;
    }

    this.presetDialogMode.set("rename");
    this.presetDialogName.set(activePreset.name);
  }

  protected closePresetDialog(): void {
    this.presetDialogMode.set(null);
    this.presetDialogName.set("");
  }

  protected openDeletePresetConfirm(): void {
    if (!this.canDeleteActivePreset()) {
      return;
    }

    this.deletePresetConfirmOpen.set(true);
  }

  protected closeDeletePresetConfirm(): void {
    if (this.deletingPreset()) {
      return;
    }

    this.deletePresetConfirmOpen.set(false);
  }

  protected updatePresetDialogName(value: string): void {
    this.presetDialogName.set(value);
  }

  protected async submitPresetDialog(): Promise<void> {
    const mode = this.presetDialogMode();
    const name = this.presetDialogName().trim();
    if (!name) {
      return;
    }

    if (mode === "create") {
      await this.store.createNamedPresetFromResponseDraft?.(this.buildSaveDraft(), name);
      this.closePresetDialog();
      return;
    }

    const activePresetId = this.activePresetId();
    if (!activePresetId) {
      return;
    }

    await this.store.renamePreset?.(activePresetId, name);
    this.closePresetDialog();
  }

  protected async confirmDeletePreset(): Promise<void> {
    const activePresetId = this.activePresetId();
    if (!activePresetId || !this.canDeleteActivePreset()) {
      this.closeDeletePresetConfirm();
      return;
    }

    this.deletingPreset.set(true);
    try {
      await this.store.deletePreset?.(activePresetId);
      this.deletePresetConfirmOpen.set(false);
    } finally {
      this.deletingPreset.set(false);
    }
  }

  public async createPresetFromCurrentDraft(): Promise<void> {
    await this.createPresetFromDraft();
  }

  protected activateExistingPreset(presetId: string): void {
    if (!presetId || presetId === this.activePresetId()) {
      return;
    }

    void this.store.activateExistingPreset?.(presetId).catch(() => undefined);
  }

  private buildSaveDraft(): DashboardResponseEditorDraft {
    const current = this.draft();
    return {
      statusCode: current.statusCode,
      payloadMode: current.payloadMode,
      contentType: current.contentType,
      payload: this.buildPayloadFromState(current),
      delayMs: current.delayMs
    };
  }

  private buildEmptyDraft(): EditorDraftState {
    return {
      statusCode: 200,
      selectedStatusButtonKey: "2xx",
      payloadMode: "JSON",
      contentType: "application/json",
      codeValue: "",
      payload: { kind: "json", value: null },
      delayMs: 0
    };
  }

  private buildDraftFromPreset(preset: MockdockResponsePresetDto | null): EditorDraftState {
    if (!preset) {
      return this.buildEmptyDraft();
    }

    const payloadMode = inferPayloadModeFromResponse(preset.body, preset.headers);
    return {
      statusCode: preset.statusCode,
      selectedStatusButtonKey: getStatusToolbarSelectionKey(preset.statusCode),
      payloadMode,
      contentType: normalizeContentType(preset.headers["content-type"]) ?? getContentTypeForMode(payloadMode) ?? "",
      codeValue: this.payloadToString(preset.body),
      payload: preset.body,
      delayMs: preset.delayMs
    };
  }

  private isCodePayloadMode(payloadMode: DashboardPayloadMode): boolean {
    return payloadMode === "JSON" || payloadMode === "Text" || payloadMode === "XML" || payloadMode === "Raw";
  }

  private convertPayloadForMode(
    payload: ResponsePayloadDto,
    payloadMode: DashboardPayloadMode,
    contentType: string
  ): ResponsePayloadDto {
    switch (payloadMode) {
      case "JSON":
        return this.ensureJsonPayload(payload);
      case "Text":
        return { kind: "text", value: this.payloadToString(payload) };
      case "XML":
        return { kind: "xml", value: this.payloadToString(payload) };
      case "Raw":
        return { kind: "raw", value: this.payloadToString(payload) };
      case "Form Data":
        return {
          kind: "formData",
          entries: this.ensureFieldEntries(payload)
        };
      case "URL Encoded":
        return {
          kind: "urlEncoded",
          entries: this.ensureFieldEntries(payload)
        };
      case "Binary":
        return payload.kind === "binary"
          ? payload
          : {
              kind: "binary",
              fileName: "payload.bin",
              mimeType: contentType || "application/octet-stream",
              base64: "",
              sizeBytes: 0
            };
    }
  }

  private getEditableSourcePayload(state: EditorDraftState): ResponsePayloadDto {
    switch (state.payloadMode) {
      case "JSON":
      case "Text":
      case "XML":
      case "Raw":
        return { kind: "raw", value: state.codeValue };
      case "Form Data":
      case "URL Encoded":
      case "Binary":
        return state.payload;
    }
  }

  private buildPayloadFromState(state: EditorDraftState): ResponsePayloadDto {
    switch (state.payloadMode) {
      case "JSON": {
        const bodyText = state.codeValue.trim();
        if (!bodyText) {
          return {
            kind: "json",
            value: null
          };
        }

        try {
          return {
            kind: "json",
            value: JSON.parse(state.codeValue)
          };
        } catch {
          return {
            kind: "json",
            value: state.codeValue
          };
        }
      }
      case "Text":
        return { kind: "text", value: state.codeValue };
      case "XML":
        return { kind: "xml", value: state.codeValue };
      case "Raw":
        return { kind: "raw", value: state.codeValue };
      case "Form Data":
      case "URL Encoded":
      case "Binary":
        return state.payload;
    }
  }

  private ensureJsonPayload(payload: ResponsePayloadDto): ResponsePayloadDto {
    if (payload.kind === "json") {
      return payload;
    }

    const text = this.payloadToString(payload).trim();
    if (!text) {
      return { kind: "json", value: null };
    }

    try {
      return { kind: "json", value: JSON.parse(text) };
    } catch {
      return { kind: "json", value: text };
    }
  }

  private payloadToString(payload: ResponsePayloadDto): string {
    switch (payload.kind) {
      case "json":
        if (payload.value === null || payload.value === undefined) {
          return "";
        }

        if (typeof payload.value === "string") {
          const trimmedValue = payload.value.trim();
          if (!trimmedValue) {
            return "";
          }

          try {
            return JSON.stringify(JSON.parse(payload.value), null, 2);
          } catch {
            return payload.value;
          }
        }

        return JSON.stringify(payload.value, null, 2);
      case "text":
      case "xml":
      case "raw":
        return payload.value;
      case "urlEncoded": {
        const params = new URLSearchParams();
        for (const entry of payload.entries) {
          params.append(entry.key, entry.value);
        }
        return params.toString();
      }
      case "formData":
        return payload.entries.map((entry) => `${entry.key}: ${entry.value}`).join("\n");
      case "binary":
        return payload.base64;
    }
  }

  private ensureFieldEntries(payload: ResponsePayloadDto): ResponseFieldEntryDto[] {
    if (payload.kind === "formData" || payload.kind === "urlEncoded") {
      return payload.entries.length > 0 ? payload.entries : [{ key: "", value: "" }];
    }

    return [{ key: "", value: "" }];
  }

  private updateFieldPayload(
    payload: ResponsePayloadDto,
    update: (entries: ResponseFieldEntryDto[]) => ResponseFieldEntryDto[]
  ): ResponsePayloadDto {
    if (payload.kind !== "formData" && payload.kind !== "urlEncoded") {
      return payload;
    }

    return {
      ...payload,
      entries: update(payload.entries)
    };
  }

  private serializeDraft(draft: EditorDraftState): string {
    return JSON.stringify({
      statusCode: draft.statusCode,
      selectedStatusButtonKey: draft.selectedStatusButtonKey,
      payloadMode: draft.payloadMode,
      contentType: draft.contentType,
      codeValue: draft.codeValue,
      payload: draft.payload,
      delayMs: draft.delayMs
    });
  }

  private updateDraft(update: (current: EditorDraftState) => EditorDraftState): void {
    this.draft.update(update);
  }

  private validateJson(value: string): string {
    if (!value.trim()) {
      return "";
    }

    try {
      JSON.parse(value);
      return "";
    } catch {
      return this.i18n.t("responseEditor.invalidJson");
    }
  }

  private humanizeErrorMessage(message: string): string {
    if (!message) {
      return "";
    }

    return message.toLowerCase().includes("payload too large")
      ? this.i18n.t("responseEditor.payloadTooLarge")
      : message;
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const [, base64 = ""] = result.split(",", 2);
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  }
}
