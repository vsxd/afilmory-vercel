import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScrollArea } from "./ScrollArea";

describe("ScrollArea", () => {
  it("puts the scroll viewport in the keyboard tab order and accepts focus", () => {
    const { container } = render(
      <ScrollArea>
        <div>content</div>
      </ScrollArea>,
    );

    expect(screen.getByText("content")).toBeTruthy();
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    expect(viewport?.getAttribute("tabindex")).toBe("0");
    viewport?.focus();
    expect(document.activeElement).toBe(viewport);
  });

  it("removes an explicitly non-focusable viewport from the tab order", () => {
    const { container } = render(
      <ScrollArea focusable={false}>
        <div>content</div>
      </ScrollArea>,
    );

    expect(
      container
        .querySelector("[data-radix-scroll-area-viewport]")
        ?.getAttribute("tabindex"),
    ).toBe("-1");
  });
});
