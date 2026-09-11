import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialogFocusManagement } from "~/hooks/useDialogFocusManagement";
import { useModalIsolation } from "~/hooks/useModalIsolation";

const DialogHarness = ({
  focusContainerOnOpen = false,
  isOpen,
  opener,
}: {
  focusContainerOnOpen?: boolean;
  isOpen: boolean;
  opener: HTMLElement;
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusManagement({
    dialogRef,
    focusContainerOnOpen,
    initialFocusSelector: "[data-photo-viewer-close]",
    isOpen,
    returnFocusElement: opener,
  });

  return isOpen ? (
    <div ref={dialogRef} role="dialog" tabIndex={-1}>
      <button type="button" data-photo-viewer-close>
        Close
      </button>
      <button type="button">Last action</button>
    </div>
  ) : null;
};

describe("useDialogFocusManagement", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("focuses the preferred control, traps Tab, and restores the opener", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const view = render(<DialogHarness isOpen opener={opener} />);
    const close = view.getByRole("button", { name: "Close" });
    const last = view.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(document.activeElement).toBe(close));

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    view.rerender(<DialogHarness isOpen={false} opener={opener} />);
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("can focus the dialog container without opening a mobile keyboard", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const view = render(
      <DialogHarness focusContainerOnOpen isOpen opener={opener} />,
    );
    const dialog = view.getByRole("dialog");
    const last = view.getByRole("button", { name: "Last action" });

    await waitFor(() => expect(document.activeElement).toBe(dialog));
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    view.unmount();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("waits for ancestor modal isolation to release before restoring focus", async () => {
    const main = document.createElement("main");
    main.id = "main-content";
    const opener = document.createElement("button");
    main.append(opener);
    document.body.append(main);
    const nativeFocus = opener.focus.bind(opener);
    // jsdom does not enforce inert; reproduce the browser's focus contract.
    vi.spyOn(opener, "focus").mockImplementation((options) => {
      if (!opener.closest("[inert]")) nativeFocus(options);
    });
    function IsolatedDialog({ isOpen }: { isOpen: boolean }) {
      useModalIsolation(isOpen);
      return <DialogHarness isOpen={isOpen} opener={opener} />;
    }
    const view = render(<IsolatedDialog isOpen />);
    await waitFor(() =>
      expect(document.activeElement).toBe(view.getByText("Close")),
    );
    expect(main.hasAttribute("inert")).toBe(true);

    view.rerender(<IsolatedDialog isOpen={false} />);
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(main.hasAttribute("inert")).toBe(false);
    main.remove();
  });
});
