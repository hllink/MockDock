import { Injectable } from "@angular/core";
import type { AppLocale } from "./i18n/i18n.types";

export type RouteSortPreference = "recent" | "name" | "hits";

@Injectable({ providedIn: "root" })
export class LocalPreferencesService {
  private readonly activeWorkspaceIdKey = "mockdock.activeWorkspaceId";
  private readonly languageKey = "mockdock.language";
  private readonly routeSortKey = "mockdock.routeSort";
  private readonly workspaceOrderKey = "mockdock.workspaceOrder";

  getWorkspaceId(): string | null {
    return this.storage()?.getItem(this.activeWorkspaceIdKey) ?? null;
  }

  setWorkspaceId(value: string): void {
    this.storage()?.setItem(this.activeWorkspaceIdKey, value);
  }

  getLanguage(): AppLocale | null {
    const value = this.storage()?.getItem(this.languageKey);
    return value === "en" || value === "pt-BR" || value === "es" || value === "zh-CN" || value === "hi"
      ? value
      : null;
  }

  setLanguage(value: AppLocale): void {
    this.storage()?.setItem(this.languageKey, value);
  }

  getRouteSort(): RouteSortPreference {
    const value = this.storage()?.getItem(this.routeSortKey);
    return value === "name" || value === "hits" ? value : "recent";
  }

  setRouteSort(value: RouteSortPreference): void {
    this.storage()?.setItem(this.routeSortKey, value);
  }

  getWorkspaceOrder(): string[] {
    const value = this.storage()?.getItem(this.workspaceOrderKey);
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0))];
    } catch {
      return [];
    }
  }

  setWorkspaceOrder(value: string[]): void {
    this.storage()?.setItem(this.workspaceOrderKey, JSON.stringify([...new Set(value)]));
  }

  private storage(): Storage | null {
    return typeof localStorage === "undefined" ? null : localStorage;
  }
}
