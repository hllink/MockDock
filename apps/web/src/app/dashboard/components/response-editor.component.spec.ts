import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResponseEditorComponent } from "./response-editor.component";
import { DashboardStore } from "../dashboard.store";

describe("ResponseEditorComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("keeps payload edits local until save is clicked", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.updateCodeEditorValue('{"ok":false}');

    expect(component.isDirty()).toBe(true);
    expect(store.saveResponseDraft).not.toHaveBeenCalled();

    await component.saveDraft();

    expect(store.saveResponseDraft).toHaveBeenCalledWith({
      statusCode: 200,
      payloadMode: "JSON",
      contentType: "application/json",
      payload: {
        kind: "json",
        value: { ok: false }
      },
      delayMs: 0
    });
  });

  it("hydrates text payloads into the code editor", () => {
    const store = createStoreStub({
      activePreset: {
        id: "preset-text",
        name: "Text",
        routeResponseVariantId: "variant-1",
        isSystem: false,
        statusCode: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: { kind: "text", value: "hello world" },
        delayMs: 0,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z"
      }
    });
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    expect(component.draftPayloadMode()).toBe("Text");
    expect(component.codeEditorValue()).toBe("hello world");
  });

  it("warns for invalid json but still saves the raw editor text", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.updateCodeEditorValue("{broken");
    await component.saveDraft();

    expect(component.jsonError()).toContain("Saving will keep the raw text");
    expect(store.saveResponseDraft).toHaveBeenCalledWith({
      statusCode: 200,
      payloadMode: "JSON",
      contentType: "application/json",
      payload: {
        kind: "json",
        value: "{broken"
      },
      delayMs: 0
    });
  });

  it("marks mode and content type changes as dirty without syncing immediately", () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.setDraftPayloadMode("XML");
    component.setDraftContentType("application/xml");

    expect(component.isDirty()).toBe(true);
    expect(store.editorSyncState()).toBe("saved");
    expect(store.saveResponseDraft).not.toHaveBeenCalled();
  });

  it("opens the fullscreen editor only for code payload modes", () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    expect(component.isCodeEditorMode()).toBe(true);
    expect(component.isFullscreenCodeEditorOpen()).toBe(false);

    component.openFullscreenCodeEditor();
    expect(component.isFullscreenCodeEditorOpen()).toBe(true);

    component.setDraftPayloadMode("URL Encoded");
    expect(component.isCodeEditorMode()).toBe(false);
    expect(component.isFullscreenCodeEditorOpen()).toBe(false);

    component.openFullscreenCodeEditor();
    expect(component.isFullscreenCodeEditorOpen()).toBe(false);
  });

  it("keeps unsaved fullscreen edits in the shared draft and saves them", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.openFullscreenCodeEditor();
    component.updateCodeEditorValue('{"ok":"fullscreen"}');
    component.closeFullscreenCodeEditor();

    expect(component.codeEditorValue()).toBe('{"ok":"fullscreen"}');
    expect(component.isDirty()).toBe(true);

    await component.saveDraft();

    expect(store.saveResponseDraft).toHaveBeenCalledWith({
      statusCode: 200,
      payloadMode: "JSON",
      contentType: "application/json",
      payload: {
        kind: "json",
        value: { ok: "fullscreen" }
      },
      delayMs: 0
    });
  });

  it("syncs fullscreen state when the modal closes", () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.openFullscreenCodeEditor();
    expect(component.isFullscreenCodeEditorOpen()).toBe(true);

    component.handleFullscreenDialogClose();
    expect(component.isFullscreenCodeEditorOpen()).toBe(false);
  });

  it("creates a preset from the explicit draft payload", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.setDraftPayloadMode("URL Encoded");
    component.updateFieldEntry(0, "key", "page");
    component.updateFieldEntry(0, "value", "1");

    await component.createPresetFromDraft();

    expect(store.createPresetFromResponseDraft).toHaveBeenCalledWith({
      statusCode: 200,
      payloadMode: "URL Encoded",
      contentType: "application/x-www-form-urlencoded",
      payload: {
        kind: "urlEncoded",
        entries: [{ key: "page", value: "1" }]
      },
      delayMs: 0
    });
  });

  it("hydrates delay from the active preset and shows the delay badge", () => {
    const store = createStoreStub({
      activePreset: {
        ...createPresetStub("preset-slow", "Slow"),
        delayMs: 1500
      }
    });
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    expect(component.draftDelayMs()).toBe(1500);
    expect(component.hasSimulatedDelay()).toBe(true);
    expect(component.delayBadgeLabel()).toContain("1500");
  });

  it("marks delay changes as dirty and persists the edited delay", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.applyDelayChip(5000);

    expect(component.draftDelayMs()).toBe(5000);
    expect(component.isDirty()).toBe(true);

    await component.saveDraft();

    expect(store.saveResponseDraft).toHaveBeenCalledWith({
      statusCode: 200,
      payloadMode: "JSON",
      contentType: "application/json",
      payload: {
        kind: "json",
        value: { ok: true }
      },
      delayMs: 5000
    });
  });

  it("creates presets with the current edited delay", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.setDraftDelay("10000");

    await component.createPresetFromDraft();

    expect(store.createPresetFromResponseDraft).toHaveBeenCalledWith({
      statusCode: 200,
      payloadMode: "JSON",
      contentType: "application/json",
      payload: {
        kind: "json",
        value: { ok: true }
      },
      delayMs: 10000
    });
  });

  it("does not open preset delete confirmation for the only preset", () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.openDeletePresetConfirm();

    expect(component.canDeleteActivePreset()).toBe(false);
    expect(component.isDeletePresetConfirmOpen()).toBe(false);
  });

  it("does not allow deleting the system default preset even when another preset remains", () => {
    const activePreset = createPresetStub("preset-1", "Default", true);
    const store = createStoreStub({
      activePreset,
      selectedVariantPresets: [
        activePreset,
        createPresetStub("preset-2", "Fallback")
      ]
    });
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.openDeletePresetConfirm();
    expect(component.canDeleteActivePreset()).toBe(false);
    expect(component.isDeletePresetConfirmOpen()).toBe(false);
  });

  it("deletes a non-system preset after confirmation when another preset remains", async () => {
    const defaultPreset = createPresetStub("preset-1", "Default", true);
    const activePreset = createPresetStub("preset-2", "Fallback");
    const store = createStoreStub({
      activePreset,
      selectedVariantPresets: [defaultPreset, activePreset]
    });
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.openDeletePresetConfirm();
    expect(component.isDeletePresetConfirmOpen()).toBe(true);

    await component.confirmDeletePreset();

    expect(store.deletePreset).toHaveBeenCalledWith("preset-2");
    expect(component.isDeletePresetConfirmOpen()).toBe(false);
  });

  it("shows a friendly payload-too-large message when the save fails", () => {
    const store = createStoreStub({
      editorSyncState: signal("error"),
      editorErrorMessage: signal("Payload too large")
    });
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    expect(component.saveErrorMessage()).toContain("Payload too large. Try a smaller file.");
  });

  it("prefers the uploaded file mime type for binary drafts", async () => {
    const store = createStoreStub();
    TestBed.configureTestingModule({
      providers: [{ provide: DashboardStore, useValue: store }]
    });

    const component = TestBed.runInInjectionContext(() => new ResponseEditorComponent()) as any;
    TestBed.flushEffects();

    component.setDraftPayloadMode("Binary");
    component.readFileAsBase64 = vi.fn().mockResolvedValue("YWJj");

    await component.updateBinaryFile({
      target: {
        files: [new File(["abc"], "avatar.png", { type: "image/png" })],
        value: "C:\\fakepath\\avatar.png"
      }
    });

    expect(component.draftContentType()).toBe("image/png");
    expect(component.binaryPayload()).toMatchObject({
      fileName: "avatar.png",
      mimeType: "image/png",
      base64: "YWJj"
    });
  });
});

function createPresetStub(id: string, name: string, isSystem = false) {
  return {
    id,
    name,
    routeResponseVariantId: "variant-1",
    isSystem,
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: { kind: "json", value: { ok: true } },
    delayMs: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z"
  };
}

function createStoreStub(overrides: Record<string, unknown> = {}) {
  const defaultPreset = createPresetStub("preset-1", "Default");
  const activePreset = (overrides["activePreset"] as object | undefined) ?? defaultPreset;
  const selectedVariantPresets =
    (overrides["selectedVariantPresets"] as object[] | undefined) ?? [activePreset];
  const {
    activePreset: _activePresetOverride,
    selectedVariantPresets: _selectedVariantPresetsOverride,
    ...restOverrides
  } = overrides;

  return {
    editorSyncState: signal("saved"),
    editorErrorMessage: signal(""),
    payloadModes: ["JSON", "Text", "XML", "URL Encoded"] as const,
    contentTypeOptions: [{ label: "JSON", value: "application/json" }],
    selectedVariantPresets: signal(selectedVariantPresets),
    activePreset: signal(activePreset),
    selectedVariant: signal({
      queryDisplay: "Default response",
      saved: true
    }),
    selectedRouteId: signal("route-1"),
    selectedRequestId: signal("request-1"),
    saveResponseDraft: vi.fn(async () => undefined),
    createPresetFromResponseDraft: vi.fn(async () => undefined),
    createNamedPresetFromResponseDraft: vi.fn(async () => undefined),
    renamePreset: vi.fn(async () => undefined),
    deletePreset: vi.fn(async () => undefined),
    activateExistingPreset: vi.fn(async () => undefined),
    ...restOverrides
  };
}
