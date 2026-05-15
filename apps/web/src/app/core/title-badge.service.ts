import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class TitleBadgeService {
  private readonly baseTitle = "MockDock";

  setUnread(count: number): void {
    if (typeof document === "undefined") {
      return;
    }

    document.title = count > 0 ? `(${count}) ${this.baseTitle}` : this.baseTitle;
  }
}
