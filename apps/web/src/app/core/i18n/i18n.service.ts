import { DOCUMENT } from "@angular/common";
import { Injectable, computed, inject, signal } from "@angular/core";

import { LocalPreferencesService } from "../local-preferences.service";
import { SUPPORTED_LOCALES, TRANSLATIONS } from "./translations";
import type {
  AppLocale,
  SupportedLocaleOption,
  TranslationDictionary,
  TranslationParams
} from "./i18n.types";

const LOCALE_ALIASES: Readonly<Record<string, AppLocale>> = {
  en: "en",
  "en-us": "en",
  "en-gb": "en",
  pt: "pt-BR",
  "pt-br": "pt-BR",
  es: "es",
  "es-es": "es",
  "es-419": "es",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  hi: "hi",
  "hi-in": "hi"
} as const;

@Injectable({ providedIn: "root" })
export class I18nService {
  private readonly preferences = inject(LocalPreferencesService);
  private readonly document = inject(DOCUMENT);

  private readonly localeSignal = signal<AppLocale>(this.resolveInitialLocale());

  readonly locale = this.localeSignal.asReadonly();
  readonly localeOptions: readonly SupportedLocaleOption[] = SUPPORTED_LOCALES;
  private readonly dictionary = computed(() => TRANSLATIONS[this.localeSignal()]);

  constructor() {
    this.document.documentElement.lang = this.localeSignal();
  }

  setLocale(locale: AppLocale): void {
    if (this.localeSignal() === locale) {
      return;
    }

    this.localeSignal.set(locale);
    this.preferences.setLanguage(locale);
    this.document.documentElement.lang = locale;
  }

  t(key: string, params?: TranslationParams): string {
    const value = this.lookup(key);
    if (typeof value !== "string") {
      return key;
    }

    return interpolate(value, params);
  }

  tm(key: string): readonly string[] {
    const value = this.lookup(key);
    return Array.isArray(value) ? value : [];
  }

  languageLabel(locale: AppLocale): string {
    const option = SUPPORTED_LOCALES.find((item) => item.code === locale);
    return option ? this.dictionary().common.languages[option.labelKey] : locale;
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat(this.localeSignal()).format(value);
  }

  formatDateTime(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat(this.localeSignal(), {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  pluralSuffix(count: number): string {
    return count === 1 ? "" : "s";
  }

  private resolveInitialLocale(): AppLocale {
    const stored = this.preferences.getLanguage();
    if (stored) {
      return stored;
    }

    const browserLocale = typeof navigator === "undefined" ? null : navigator.language;
    return normalizeLocale(browserLocale);
  }

  private lookup(key: string): unknown {
    let current: unknown = this.dictionary();
    for (const segment of key.split(".")) {
      if (!current || typeof current !== "object" || !(segment in current)) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
  if (!value) {
    return "en";
  }

  const normalized = value.toLowerCase();
  return (
    LOCALE_ALIASES[normalized] ??
    LOCALE_ALIASES[normalized.split("-")[0] ?? ""] ??
    "en"
  );
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template;
  }

  return template.replaceAll(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export type { AppLocale, TranslationDictionary };
