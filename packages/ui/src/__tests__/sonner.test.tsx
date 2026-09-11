import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "../sonner";

afterEach(() => {
  act(() => toast.dismiss());
  cleanup();
});

describe("Toaster", () => {
  it("retains the unstyled adapter when options change and keeps dismissal accessible", async () => {
    const onDismiss = vi.fn();
    render(
      <Toaster
        closeButton
        toastOptions={{
          duration: Infinity,
          closeButtonAriaLabel: "Dismiss notification",
        }}
      />,
    );
    act(() => {
      toast.info("Copied photo link", {
        description: "Ready to share",
        onDismiss,
      });
    });

    const title = await screen.findByText("Copied photo link");
    expect(
      title.closest<HTMLElement>("[data-sonner-toast]")?.dataset.styled,
    ).toBe("false");
    expect(screen.getByText("Ready to share")).toBeTruthy();
    const close = screen.getByRole("button", { name: "Dismiss notification" });
    act(() => close.focus());
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(onDismiss).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByText("Copied photo link")).toBeNull(),
    );
  });

  it("preserves action callbacks and their ability to keep a notification open", async () => {
    const onClick = vi.fn((event: React.MouseEvent<HTMLButtonElement>) =>
      event.preventDefault(),
    );
    render(<Toaster duration={Infinity} />);
    act(() => {
      toast("Export ready", { action: { label: "Download", onClick } });
    });

    const action = await screen.findByRole("button", { name: "Download" });
    fireEvent.click(action);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Export ready")).toBeTruthy();
  });
});
