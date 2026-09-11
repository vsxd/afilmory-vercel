import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "../button";

// Painted focus boundaries are checked against the real app CSS in browser tests.
describe("Button keyboard focus", () => {
  afterEach(cleanup);

  it.each(["primary", "surface"] as const)(
    "keeps the %s action focusable",
    (variant) => {
      const { getByRole } = render(
        <Button variant={variant}>Reload Application</Button>,
      );
      const button = getByRole("button");
      button.focus();
      expect(document.activeElement).toBe(button);
    },
  );

  it("forwards focus to a slotted navigation link", () => {
    const { getByRole } = render(
      <Button asChild variant="surface">
        <a href="/photos">Photos</a>
      </Button>,
    );
    const link = getByRole("link", { name: "Photos" });
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(link.getAttribute("href")).toBe("/photos");
  });
});
