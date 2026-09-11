import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GalleryFloatingActions } from "../GalleryFloatingActions";

vi.mock("@afilmory/ui", () => ({
  clsxm: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
vi.mock("../ActionGroup", () => ({
  ActionGroup: ({
    onOverlayOpenChange,
  }: {
    onOverlayOpenChange: (open: boolean) => void;
  }) => {
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          ref={trigger}
          onClick={() => {
            setOpen(true);
            onOverlayOpenChange(true);
          }}
        >
          View
        </button>
        {open &&
          createPortal(
            <button
              onClick={() => {
                setOpen(false);
                onOverlayOpenChange(false);
                trigger.current?.focus();
              }}
            >
              Close panel
            </button>,
            document.body,
          )}
      </>
    );
  },
}));
afterEach(cleanup);

describe("GalleryFloatingActions", () => {
  it("inherits gallery isolation when a photo viewer hides the background", () => {
    const { container } = render(
      <main style={{ visibility: "hidden" }}>
        <GalleryFloatingActions isVisible isMobile />
      </main>,
    );
    const toolbar = container.querySelector<HTMLElement>(
      "[data-gallery-floating-actions]",
    )!;
    expect(getComputedStyle(toolbar).visibility).toBe("hidden");
    expect(screen.queryByRole("button", { name: "View" })).toBeNull();
  });

  it("keeps the same trigger available after scroll resets while its portal is open", () => {
    const { container, rerender } = render(
      <GalleryFloatingActions isVisible isMobile />,
    );
    const toolbar = container.querySelector<HTMLElement>(
      "[data-gallery-floating-actions]",
    )!;
    const trigger = screen.getByRole("button", { name: "View" });
    fireEvent.click(trigger);
    const close = screen.getByRole("button", { name: "Close panel" });
    act(() => close.focus());

    rerender(<GalleryFloatingActions isVisible={false} isMobile />);
    expect(toolbar.style.visibility).toBe("");
    expect(toolbar.hasAttribute("inert")).toBe(false);

    fireEvent.click(close);
    expect(screen.getByRole("button", { name: "View" })).toBe(trigger);
    expect(document.activeElement).toBe(trigger);
    expect(toolbar.style.visibility).toBe("");
  });

  it("hides and disables the existing controls only after focus leaves below the scroll threshold", () => {
    const { container, rerender } = render(
      <>
        <GalleryFloatingActions isVisible isMobile />
        <button>Photo</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "View" });
    act(() => trigger.focus());
    rerender(
      <>
        <GalleryFloatingActions isVisible={false} isMobile />
        <button>Photo</button>
      </>,
    );
    expect(screen.getByRole("button", { name: "View" })).toBe(trigger);
    act(() => screen.getByRole("button", { name: "Photo" }).focus());
    const toolbar = container.querySelector<HTMLElement>(
      "[data-gallery-floating-actions]",
    )!;
    expect(toolbar.style.visibility).toBe("hidden");
    expect(toolbar.hasAttribute("inert")).toBe(true);
    expect(trigger.isConnected).toBe(true);
  });
});
