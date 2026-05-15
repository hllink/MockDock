import { describe, expect, it } from "vitest";

import responseStatusToolbarTemplate from "./response-status-toolbar.component.html?raw";

describe("ResponseStatusToolbarComponent", () => {
  it("binds the active family button label to the selected status label", () => {
    expect(responseStatusToolbarTemplate).toContain("statusButtonLabel(button.label)");
  });

  it("keeps the custom button label wired to the custom status label helper", () => {
    expect(responseStatusToolbarTemplate).toContain("customStatusLabel()");
  });

  it("keeps the status families in a horizontal flex row by default", () => {
    expect(responseStatusToolbarTemplate).toContain("status-strip");
  });
});
