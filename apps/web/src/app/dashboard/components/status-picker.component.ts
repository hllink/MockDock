import { ChangeDetectionStrategy, Component, EventEmitter } from "@angular/core";

import { ResponseStatusToolbarComponent } from "./response-status-toolbar.component";

@Component({
  selector: "app-status-picker",
  standalone: true,
  imports: [ResponseStatusToolbarComponent],
  inputs: ["statusCode"],
  outputs: ["statusCodeChange"],
  templateUrl: "./status-picker.component.html",
  styleUrl: "./status-picker.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusPickerComponent {
  statusCode = 200;
  readonly statusCodeChange = new EventEmitter<number>();

  protected emitStatusCode(statusCode: number): void {
    this.statusCodeChange.emit(statusCode);
  }

  protected selectedStatusButtonKey(): "2xx" | "3xx" | "4xx" | "5xx" | "custom" {
    if (this.statusCode >= 200 && this.statusCode < 300) {
      return "2xx";
    }

    if (this.statusCode >= 300 && this.statusCode < 400) {
      return "3xx";
    }

    if (this.statusCode >= 400 && this.statusCode < 500) {
      return "4xx";
    }

    if (this.statusCode >= 500 && this.statusCode < 600) {
      return "5xx";
    }

    return "custom";
  }

  protected selectedStatusButtonLabel(): string {
    return this.selectedStatusButtonKey() === "custom"
      ? `(${this.statusCode}) Custom code`
      : this.selectedStatusButtonKey();
  }
}
