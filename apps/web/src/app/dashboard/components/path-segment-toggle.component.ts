import { ChangeDetectionStrategy, Component, inject, input, output } from "@angular/core";

import { I18nService } from "../../core/i18n/i18n.service";
import type { DashboardRouteToken } from "../dashboard.models";

@Component({
  selector: "app-path-segment-toggle",
  standalone: true,
  templateUrl: "./path-segment-toggle.component.html",
  styleUrl: "./path-segment-toggle.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PathSegmentToggleComponent {
  protected readonly i18n = inject(I18nService);
  readonly tokens = input.required<DashboardRouteToken[]>();
  readonly copyValue = input<string>("");
  readonly copyPath = output<void>();
}
