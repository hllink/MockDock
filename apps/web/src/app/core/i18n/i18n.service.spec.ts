import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalPreferencesService } from "../local-preferences.service";
import { I18nService, normalizeLocale } from "./i18n.service";

describe("I18nService", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it("normalizes browser locales into supported locales", () => {
    expect(normalizeLocale("pt")).toBe("pt-BR");
    expect(normalizeLocale("pt-BR")).toBe("pt-BR");
    expect(normalizeLocale("es-MX")).toBe("es");
    expect(normalizeLocale("zh-Hans")).toBe("zh-CN");
    expect(normalizeLocale("fr-FR")).toBe("en");
  });

  it("prefers the persisted locale over the browser locale", () => {
    vi.stubGlobal("navigator", { language: "es-MX" });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: LocalPreferencesService,
          useValue: {
            getLanguage: vi.fn(() => "pt-BR"),
            setLanguage: vi.fn()
          }
        }
      ]
    });

    const service = TestBed.inject(I18nService);

    expect(service.locale()).toBe("pt-BR");
    expect(service.t("common.language")).toBe("Idioma");
  });

  it("persists a user-selected locale and updates translated text", () => {
    const setLanguage = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: LocalPreferencesService,
          useValue: {
            getLanguage: vi.fn(() => null),
            setLanguage
          }
        }
      ]
    });

    const service = TestBed.inject(I18nService);
    service.setLocale("zh-CN");

    expect(setLanguage).toHaveBeenCalledWith("zh-CN");
    expect(service.locale()).toBe("zh-CN");
    expect(service.t("common.copy")).toBe("复制");
  });
});
