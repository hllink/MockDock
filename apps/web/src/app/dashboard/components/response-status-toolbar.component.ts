import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, inject } from "@angular/core";

import { I18nService } from "../../core/i18n/i18n.service";

type StatusToolbarSelectionKey = "2xx" | "3xx" | "4xx" | "5xx";

type StatusToolbarOption = {
  code: number;
  label: string;
};

type StatusToolbarButton = {
  label: "2xx" | "3xx" | "4xx" | "5xx";
  statusCode: number;
  description: string;
  options: readonly StatusToolbarOption[];
};

type StatusSelectionChange = {
  key: StatusToolbarSelectionKey;
  statusCode: number;
};

@Component({
  selector: "app-response-status-toolbar",
  standalone: true,
  inputs: ["statusCode", "selectedStatusButtonKey", "selectedStatusButtonLabel"],
  outputs: ["statusSelectionChange", "customStatusCodeChange"],
  templateUrl: "./response-status-toolbar.component.html",
  styleUrl: "./response-status-toolbar.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResponseStatusToolbarComponent {
  private static readonly minStatusCode = 100;
  private static readonly maxStatusCode = 599;
  private static readonly overlayViewportPadding = 12;
  private static readonly overlayOffset = 8;
  private static readonly familyMenuMinWidth = 184;
  private static readonly customPopupMinWidth = 208;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly i18n = inject(I18nService);

  statusCode = 200;
  selectedStatusButtonKey: "2xx" | "3xx" | "4xx" | "5xx" | "custom" = "2xx";
  selectedStatusButtonLabel = "200";
  readonly statusSelectionChange = new EventEmitter<StatusSelectionChange>();
  readonly customStatusCodeChange = new EventEmitter<number>();
  protected openFamilyMenu: StatusToolbarSelectionKey | null = null;
  protected customPopupOpen = false;
  protected customStatusCodeInput = "200";
  protected familyMenuTop: string | null = null;
  protected familyMenuLeft: string | null = null;
  protected familyMenuMinWidth: string | null = null;
  protected customPopupTop: string | null = null;
  protected customPopupLeft: string | null = null;
  protected customPopupMinWidth: string | null = null;

  protected readonly statusButtons: readonly StatusToolbarButton[] = [
    {
      label: "2xx",
      statusCode: 200,
      description: "Success",
      options: [
        { code: 200, label: "200 OK" },
        { code: 201, label: "201 Created" },
        { code: 202, label: "202 Accepted" },
        { code: 204, label: "204 No Content" }
      ]
    },
    {
      label: "3xx",
      statusCode: 302,
      description: "Redirect",
      options: [
        { code: 301, label: "301 Moved Permanently" },
        { code: 302, label: "302 Found" },
        { code: 307, label: "307 Temporary Redirect" },
        { code: 308, label: "308 Permanent Redirect" }
      ]
    },
    {
      label: "4xx",
      statusCode: 404,
      description: "Client error",
      options: [
        { code: 400, label: "400 Bad Request" },
        { code: 401, label: "401 Unauthorized" },
        { code: 403, label: "403 Forbidden" },
        { code: 404, label: "404 Not Found" },
        { code: 409, label: "409 Conflict" },
        { code: 422, label: "422 Unprocessable Content" },
        { code: 429, label: "429 Too Many Requests" }
      ]
    },
    {
      label: "5xx",
      statusCode: 500,
      description: "Server error",
      options: [
        { code: 500, label: "500 Internal Server Error" },
        { code: 501, label: "501 Not Implemented" },
        { code: 502, label: "502 Bad Gateway" },
        { code: 503, label: "503 Service Unavailable" },
        { code: 504, label: "504 Gateway Timeout" }
      ]
    }
  ];

  protected selectFamilyDefault(button: StatusToolbarButton): void {
    this.emitFamilyStatus(button.label, button.statusCode);
  }

  protected toggleFamilyMenu(event: MouseEvent, label: StatusToolbarSelectionKey): void {
    const menu = this.getFamilyMenuElement(label);
    if (!menu) {
      return;
    }

    this.hideCustomPopup();
    if (this.openFamilyMenu === label && menu.matches(":popover-open")) {
      this.hideFamilyMenu(label);
      return;
    }

    this.hideFamilyMenu(this.openFamilyMenu);
    this.setFamilyMenuPosition(event.currentTarget);
    menu.showPopover();
    this.openFamilyMenu = label;
  }

  protected selectFamilyOption(label: StatusToolbarSelectionKey, statusCode: number): void {
    this.emitFamilyStatus(label, statusCode);
  }

  protected toggleCustomPopup(event: MouseEvent): void {
    const popup = this.getCustomPopupElement();
    if (!popup) {
      return;
    }

    this.hideFamilyMenu(this.openFamilyMenu);
    if (this.customPopupOpen && popup.matches(":popover-open")) {
      this.hideCustomPopup();
      return;
    }

    this.setCustomPopupPosition(event.currentTarget);
    this.customStatusCodeInput = String(this.statusCode);
    popup.showPopover();
    this.customPopupOpen = true;
  }

  protected updateCustomStatusCodeInput(value: string): void {
    this.customStatusCodeInput = value;
  }

  protected applyCustomStatusCode(): void {
    const nextValue = Number(this.customStatusCodeInput);
    if (
      Number.isNaN(nextValue) ||
      nextValue < ResponseStatusToolbarComponent.minStatusCode ||
      nextValue > ResponseStatusToolbarComponent.maxStatusCode
    ) {
      return;
    }

    this.customStatusCodeChange.emit(nextValue);
    this.customPopupOpen = false;
    this.openFamilyMenu = null;
    this.clearCustomPopupPosition();
    this.clearFamilyMenuPosition();
  }

  protected closeCustomPopup(): void {
    this.hideCustomPopup();
  }

  protected handleFamilyMenuToggle(label: StatusToolbarSelectionKey, event: Event): void {
    const menu = event.currentTarget;
    if (!(menu instanceof HTMLElement) || menu.matches(":popover-open")) {
      return;
    }

    if (this.openFamilyMenu === label) {
      this.openFamilyMenu = null;
      this.clearFamilyMenuPosition();
    }
  }

  protected handleCustomPopupToggle(event: Event): void {
    const popup = event.currentTarget;
    if (!(popup instanceof HTMLElement) || popup.matches(":popover-open")) {
      return;
    }

    this.customPopupOpen = false;
    this.clearCustomPopupPosition();
  }

  protected customStatusLabel(): string {
    return this.selectedStatusButtonKey === "custom"
      ? this.selectedStatusButtonLabel
      : this.i18n.t("responseStatus.customCode");
  }

  protected statusButtonLabel(buttonLabel: StatusToolbarSelectionKey): string {
    return this.selectedStatusButtonKey === buttonLabel ? this.selectedStatusButtonLabel : buttonLabel;
  }

  @HostListener("document:click", ["$event"])
  protected handleDocumentClick(event: MouseEvent): void {
    if (this.host.nativeElement.contains(event.target as Node | null)) {
      return;
    }

    this.closeAllPopups();
  }

  @HostListener("window:resize")
  protected handleWindowResize(): void {
    this.closeAllPopups();
  }

  private emitFamilyStatus(key: StatusToolbarSelectionKey, statusCode: number): void {
    this.statusSelectionChange.emit({ key, statusCode });
    this.closeAllPopups();
  }

  private setFamilyMenuPosition(anchor: EventTarget | null): void {
    const position = this.buildOverlayPosition(
      this.resolveAnchorRect(anchor),
      ResponseStatusToolbarComponent.familyMenuMinWidth,
      "left"
    );
    this.familyMenuTop = position.top;
    this.familyMenuLeft = position.left;
    this.familyMenuMinWidth = position.minWidth;
  }

  private setCustomPopupPosition(anchor: EventTarget | null): void {
    const position = this.buildOverlayPosition(
      this.resolveAnchorRect(anchor),
      ResponseStatusToolbarComponent.customPopupMinWidth,
      "right"
    );
    this.customPopupTop = position.top;
    this.customPopupLeft = position.left;
    this.customPopupMinWidth = position.minWidth;
  }

  private resolveAnchorRect(anchor: EventTarget | null): DOMRect {
    const element = anchor instanceof HTMLElement ? anchor : this.host.nativeElement;
    const container =
      element.closest<HTMLElement>(".status-family, .custom-status") ?? element;
    return container.getBoundingClientRect();
  }

  private buildOverlayPosition(
    anchorRect: DOMRect,
    minWidth: number,
    alignment: "left" | "right"
  ): { top: string; left: string; minWidth: string } {
    const width = Math.max(Math.ceil(anchorRect.width), minWidth);
    const maxLeft = Math.max(
      ResponseStatusToolbarComponent.overlayViewportPadding,
      window.innerWidth - width - ResponseStatusToolbarComponent.overlayViewportPadding
    );
    const rawLeft =
      alignment === "right" ? anchorRect.right - width : anchorRect.left;
    const clampedLeft = Math.min(
      Math.max(ResponseStatusToolbarComponent.overlayViewportPadding, rawLeft),
      maxLeft
    );

    return {
      top: `${Math.ceil(anchorRect.bottom + ResponseStatusToolbarComponent.overlayOffset)}px`,
      left: `${Math.ceil(clampedLeft)}px`,
      minWidth: `${width}px`
    };
  }

  private closeAllPopups(): void {
    this.hideFamilyMenu(this.openFamilyMenu);
    this.hideCustomPopup();
  }

  private clearFamilyMenuPosition(): void {
    this.familyMenuTop = null;
    this.familyMenuLeft = null;
    this.familyMenuMinWidth = null;
  }

  private clearCustomPopupPosition(): void {
    this.customPopupTop = null;
    this.customPopupLeft = null;
    this.customPopupMinWidth = null;
  }

  private getFamilyMenuElement(label: StatusToolbarSelectionKey | null): HTMLElement | null {
    if (!label) {
      return null;
    }

    return this.host.nativeElement.querySelector<HTMLElement>(`[data-family-menu="${label}"]`);
  }

  private getCustomPopupElement(): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>("[data-custom-popup]");
  }

  private hideFamilyMenu(label: StatusToolbarSelectionKey | null): void {
    const menu = this.getFamilyMenuElement(label);
    if (menu?.matches(":popover-open")) {
      menu.hidePopover();
    }

    if (label !== null) {
      this.openFamilyMenu = null;
    }
    this.clearFamilyMenuPosition();
  }

  private hideCustomPopup(): void {
    const popup = this.getCustomPopupElement();
    if (popup?.matches(":popover-open")) {
      popup.hidePopover();
    }

    this.customPopupOpen = false;
    this.clearCustomPopupPosition();
  }
}
