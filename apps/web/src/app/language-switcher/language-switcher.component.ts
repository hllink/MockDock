import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, signal } from "@angular/core";

import { I18nService } from "../core/i18n/i18n.service";
import type { AppLocale } from "../core/i18n/i18n.types";

@Component({
  selector: "app-language-switcher",
  standalone: true,
  templateUrl: "./language-switcher.component.html",
  styleUrl: "./language-switcher.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LanguageSwitcherComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly open = signal(false);
  protected readonly localeFlags: Record<AppLocale, string> = {
    en: "🇺🇸",
    "pt-BR": "🇧🇷",
    es: "🇪🇸",
    "zh-CN": "🇨🇳",
    hi: "🇮🇳"
  };

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected toggleMenu(): void {
    this.open.update((current) => !current);
  }

  protected selectLocale(locale: AppLocale): void {
    this.i18n.setLocale(locale);
    this.open.set(false);
  }

  protected isActive(locale: AppLocale): boolean {
    return this.i18n.locale() === locale;
  }

  protected flagFor(locale: AppLocale): string {
    return this.localeFlags[locale];
  }

  @HostListener("document:click", ["$event"])
  protected handleDocumentClick(event: MouseEvent): void {
    if (this.host.nativeElement.contains(event.target as Node | null)) {
      return;
    }

    this.open.set(false);
  }
}
