import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDialogFocusManagement } from "~/hooks/useDialogFocusManagement";
import { useModalIsolation } from "~/hooks/useModalIsolation";

const DialogHarness = ({
  focusContainerOnOpen = false,
  initialFocusSelector = "[data-photo-viewer-close]",
  isOpen,
  opener,
  retainReturnFocusOnSuspend = false,
  restoreFocusOnClose = true,
}: {
  focusContainerOnOpen?: boolean;
  initialFocusSelector?: string;
  isOpen: boolean;
  opener?: HTMLElement;
  retainReturnFocusOnSuspend?: boolean;
  restoreFocusOnClose?: boolean;
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusManagement({
    dialogRef,
    focusContainerOnOpen,
    initialFocusSelector,
    isOpen,
    retainReturnFocusOnSuspend,
    restoreFocusOnClose,
    returnFocusElement: opener,
  });

  return isOpen ? (
    <div ref={dialogRef} role="dialog" tabIndex={-1}>
      <div data-dialog-heading>
        <button type="button" data-photo-viewer-close>
          Close
        </button>
      </div>
      <input aria-label="Search" />
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

  it.each([
    {
      name: "hidden attribute",
      hide: (element: HTMLElement) => {
        element.hidden = true;
      },
    },
    {
      name: "display: none",
      hide: (element: HTMLElement) => {
        element.style.display = "none";
      },
    },
    {
      name: "visibility: hidden",
      hide: (element: HTMLElement) => {
        element.style.visibility = "hidden";
      },
    },
    {
      name: "visibility: collapse",
      hide: (element: HTMLElement) => {
        element.style.visibility = "collapse";
      },
    },
  ])(
    "omits controls inside an ancestor with $name from the Tab cycle",
    async ({ hide }) => {
      const view = render(<DialogHarness isOpen />);
      const close = view.getByRole("button", { name: "Close" });
      const input = view.getByRole("textbox", { name: "Search" });
      const last = view.getByRole("button", { name: "Last action" });
      await waitFor(() => expect(document.activeElement).toBe(close));

      hide(close.parentElement!);
      last.focus();
      fireEvent.keyDown(last, { key: "Tab" });
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    },
  );

  it("honors a focus handoff set in the same render that closes the dialog", async () => {
    const opener = document.createElement("button");
    const viewer = document.createElement("button");
    document.body.append(opener, viewer);
    opener.focus();
    const view = render(<DialogHarness isOpen opener={opener} />);
    await waitFor(() =>
      expect(document.activeElement).toBe(view.getByText("Close")),
    );

    view.rerender(
      <DialogHarness
        isOpen={false}
        opener={opener}
        restoreFocusOnClose={false}
      />,
    );
    viewer.focus();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    expect(document.activeElement).toBe(viewer);
    opener.remove();
    viewer.remove();
  });

  it("does not reset active keyboard focus when only the restoration policy changes", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    const view = render(<DialogHarness isOpen opener={opener} />);
    await waitFor(() =>
      expect(document.activeElement).toBe(view.getByText("Close")),
    );
    const last = view.getByText("Last action");
    last.focus();
    view.rerender(
      <DialogHarness isOpen opener={opener} restoreFocusOnClose={false} />,
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    expect(document.activeElement).toBe(last);
    opener.remove();
  });

  it.each([false, true])(
    "keeps typing focus and the opener when opening policy changes, applying it next time (container: %s)",
    async (focusContainerOnOpen) => {
      const opener = document.createElement("button");
      document.body.append(opener);
      opener.focus();
      // Omit returnFocusElement to exercise the captured external opener.
      const view = render(<DialogHarness isOpen />);
      await waitFor(() =>
        expect(document.activeElement).toBe(view.getByText("Close")),
      );
      const input = view.getByRole("textbox", { name: "Search" });
      input.focus();
      fireEvent.change(input, { target: { value: "photo" } });
      const nextPolicy = {
        focusContainerOnOpen,
        initialFocusSelector: "input",
      };
      view.rerender(<DialogHarness isOpen {...nextPolicy} />);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      expect(document.activeElement).toBe(input);

      view.rerender(<DialogHarness isOpen={false} {...nextPolicy} />);
      await waitFor(() => expect(document.activeElement).toBe(opener));
      view.rerender(<DialogHarness isOpen {...nextPolicy} />);
      await waitFor(() =>
        expect(document.activeElement).toBe(
          focusContainerOnOpen
            ? view.getByRole("dialog")
            : view.getByRole("textbox", { name: "Search" }),
        ),
      );
      view.unmount();
      await waitFor(() => expect(document.activeElement).toBe(opener));
      opener.remove();
    },
  );

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

  it("retains the external opener through a search → viewer → search handoff", async () => {
    const firstOpener = document.createElement("button");
    const nextOpener = document.createElement("button");
    document.body.append(firstOpener, nextOpener);
    firstOpener.focus();

    function Handoff({ stage }: { stage: "search" | "photo" | "closed" }) {
      return (
        <>
          <section data-testid="search">
            <DialogHarness
              isOpen={stage === "search"}
              retainReturnFocusOnSuspend
              restoreFocusOnClose={stage !== "photo"}
            />
          </section>
          <section data-testid="photo">
            <DialogHarness
              isOpen={stage === "photo"}
              restoreFocusOnClose={false}
            />
          </section>
        </>
      );
    }
    const view = render(<Handoff stage="search" />);
    await waitFor(() =>
      expect(view.getByTestId("search").contains(document.activeElement)).toBe(
        true,
      ),
    );
    view.rerender(<Handoff stage="photo" />);
    await waitFor(() =>
      expect(view.getByTestId("photo").contains(document.activeElement)).toBe(
        true,
      ),
    );
    view.rerender(<Handoff stage="search" />);
    await waitFor(() =>
      expect(view.getByTestId("search").contains(document.activeElement)).toBe(
        true,
      ),
    );
    view.rerender(<Handoff stage="closed" />);
    await waitFor(() => expect(document.activeElement).toBe(firstOpener));

    // An ordinary close completes that trip; a later session has a new opener.
    nextOpener.focus();
    view.rerender(<Handoff stage="search" />);
    await waitFor(() =>
      expect(view.getByTestId("search").contains(document.activeElement)).toBe(
        true,
      ),
    );
    view.rerender(<Handoff stage="closed" />);
    await waitFor(() => expect(document.activeElement).toBe(nextOpener));
    firstOpener.remove();
    nextOpener.remove();
  });

  it.each([false, true])(
    "uses the current opener when retention is disabled or the old opener was removed (retention: %s)",
    async (retainReturnFocusOnSuspend) => {
      const opener = document.createElement("button");
      const currentOpener = document.createElement("button");
      document.body.append(opener, currentOpener);
      opener.focus();
      const view = render(
        <DialogHarness
          isOpen
          retainReturnFocusOnSuspend={retainReturnFocusOnSuspend}
        />,
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(view.getByText("Close")),
      );
      view.rerender(
        <DialogHarness
          isOpen={false}
          retainReturnFocusOnSuspend={retainReturnFocusOnSuspend}
          restoreFocusOnClose={false}
        />,
      );
      if (retainReturnFocusOnSuspend) opener.remove();
      currentOpener.focus();
      view.rerender(
        <DialogHarness
          isOpen
          retainReturnFocusOnSuspend={retainReturnFocusOnSuspend}
        />,
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(view.getByText("Close")),
      );
      view.rerender(
        <DialogHarness
          isOpen={false}
          retainReturnFocusOnSuspend={retainReturnFocusOnSuspend}
        />,
      );
      await waitFor(() => expect(document.activeElement).toBe(currentOpener));
      opener.remove();
      currentOpener.remove();
    },
  );
});
