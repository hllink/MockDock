import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from "@angular/core";

import { I18nService } from "../core/i18n/i18n.service";

export type AmbientStateMode = "page" | "overlay";
export type AmbientStateVariant = "empty" | "loading" | "saving";

@Component({
  selector: "app-ambient-state",
  standalone: true,
  templateUrl: "./ambient-state.component.html",
  styleUrl: "./ambient-state.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AmbientStateComponent {
  private static readonly messageDurationMs = 8000;
  private static readonly starterRequestUrl = "http://localhost:52052/demo/hello";

  readonly mode = input<AmbientStateMode>("page");
  readonly variant = input.required<AmbientStateVariant>();

  protected readonly i18n = inject(I18nService);
  protected readonly currentMessage = signal("");
  protected readonly isGlitching = signal(false);
  protected readonly helpModalOpen = signal(false);
  protected readonly addressCopied = signal(false);
  protected readonly hostClasses = computed(
    () => `ambient-state ambient-state-${this.mode()} ambient-state-${this.variant()}`
  );
  protected readonly showHelpEntry = computed(
    () => this.mode() === "page" && this.variant() === "empty"
  );

  private readonly destroyRef = inject(DestroyRef);
  private rotationTimer: ReturnType<typeof setTimeout> | null = null;
  private glitchTimer: ReturnType<typeof setTimeout> | null = null;
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private activeVariant: AmbientStateVariant | null = null;

  constructor() {
    effect(() => {
      const variant = this.variant();
      this.i18n.locale();
      if (this.activeVariant === variant && this.currentMessage()) {
        return;
      }

      this.activeVariant = variant;
      this.startRotation(variant);
    });

    this.destroyRef.onDestroy(() => {
      this.clearTimers();
    });
  }

  protected openHelpModal(): void {
    this.helpModalOpen.set(true);
  }

  protected closeHelpModal(): void {
    this.helpModalOpen.set(false);
  }

  protected starterRequestUrl(): string {
    return AmbientStateComponent.starterRequestUrl;
  }

  protected async copyStarterAddress(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(AmbientStateComponent.starterRequestUrl);
      this.addressCopied.set(true);
      if (this.copyFeedbackTimer) {
        clearTimeout(this.copyFeedbackTimer);
      }
      this.copyFeedbackTimer = setTimeout(() => {
        this.addressCopied.set(false);
        this.copyFeedbackTimer = null;
      }, 1800);
    } catch {
      // Ignore clipboard failures in unsupported or restricted contexts.
    }
  }

  private startRotation(variant: AmbientStateVariant): void {
    this.clearTimers();
    this.currentMessage.set(this.pickRandomMessage(variant));
    this.scheduleNextMessage(variant);
  }

  private scheduleNextMessage(variant: AmbientStateVariant): void {
    const messages = this.getMessages(variant);
    if (messages.length <= 1) {
      return;
    }

    this.rotationTimer = setTimeout(() => {
      this.currentMessage.set(this.pickRandomMessage(variant, this.currentMessage()));
      this.triggerGlitch();
      this.scheduleNextMessage(variant);
    }, AmbientStateComponent.messageDurationMs);
  }

  private triggerGlitch(): void {
    if (Math.random() < 0.35) {
      this.isGlitching.set(true);
      this.glitchTimer = setTimeout(() => {
        this.isGlitching.set(false);
        this.glitchTimer = null;
      }, 120);
    }
  }

  private clearTimers(): void {
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }

    if (this.glitchTimer) {
      clearTimeout(this.glitchTimer);
      this.glitchTimer = null;
    }

    if (this.copyFeedbackTimer) {
      clearTimeout(this.copyFeedbackTimer);
      this.copyFeedbackTimer = null;
    }

    this.isGlitching.set(false);
  }

  private pickRandomMessage(
    variant: AmbientStateVariant,
    currentMessage: string | null = null
  ): string {
    const messages = this.getMessages(variant);
    if (messages.length === 0) {
      return "";
    }

    if (messages.length === 1) {
      return messages[0] ?? "";
    }

    let nextMessage = "";
    while (!nextMessage || nextMessage === currentMessage) {
      nextMessage = messages[Math.floor(Math.random() * messages.length)] ?? messages[0] ?? "";
    }

    return nextMessage;
  }

  private getMessages(variant: AmbientStateVariant): readonly string[] {
    this.i18n.locale();
    return this.i18n.tm(`ambient.messages.${variant}`);
  }
}
