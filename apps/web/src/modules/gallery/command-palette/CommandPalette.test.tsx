import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavigationController } from "~/navigation/controller";

import { CommandPalette } from "./CommandPalette";

// jsdom 没有 scrollIntoView（选中项滚动效果会触发）
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

const navigation = new NavigationController();
let isMobile = false;
let allTags: string[] = [];

vi.mock("@afilmory/ui", () => ({
  clsxm: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: "en",
      getResource: () => null,
      services: {
        interpolator: { interpolate: (template: string) => template },
      },
    },
  }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("~/hooks/useMobile", () => ({
  useMobile: () => isMobile,
}));

vi.mock("~/hooks/usePanelDragDismiss", () => ({
  usePanelDragDismiss: () => ({
    offset: 0,
    isDragging: false,
    handleRef: () => {},
  }),
}));

vi.mock("~/hooks/usePhotoViewer", () => ({
  getViewerPhotos: () => [],
  getViewerSourceMode: () => "all",
  useOpenPhotoViewer: () => vi.fn(),
}));

vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({ navigation }),
  usePhotoRepository: () => ({
    getAllTags: () => allTags,
    getAllCameras: () => [],
    getAllLenses: () => [],
    getPhotos: () => [],
  }),
}));

vi.mock("~/components/ui/ThumbnailImage", () => ({
  ThumbnailImage: () => null,
}));

vi.mock("~/modules/gallery/panels/FilterPanel", () => ({
  FilterPanel: () => (
    <button type="button" data-testid="filter-panel-button">
      filter
    </button>
  ),
}));

describe("CommandPalette", () => {
  let store: ReturnType<typeof createStore>;
  let main: HTMLElement;

  const renderPalette = (props: { isOpen: boolean; onClose: () => void }) =>
    render(<CommandPalette {...props} />, {
      wrapper: ({ children }: PropsWithChildren) => (
        <Provider store={store}>{children}</Provider>
      ),
    });

  beforeEach(() => {
    isMobile = false;
    allTags = [];
    store = createStore();
    main = document.createElement("main");
    main.id = "main-content";
    document.body.append(main);
  });

  afterEach(() => {
    cleanup();
    main.remove();
    vi.clearAllMocks();
  });

  it("exposes modal dialog semantics on the palette panel", () => {
    const { getByRole } = renderPalette({ isOpen: true, onClose: vi.fn() });

    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe(
      "action.search.unified.title",
    );
  });

  it("autofocuses the search input on desktop", async () => {
    const { getByPlaceholderText } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        getByPlaceholderText("action.search.placeholder"),
      );
    });
  });

  it("moves focus onto the panel itself on mobile (no virtual keyboard pop)", async () => {
    isMobile = true;

    const { getByRole } = renderPalette({ isOpen: true, onClose: vi.fn() });

    await waitFor(() => {
      expect(document.activeElement).toBe(getByRole("dialog"));
    });
  });

  it("isolates the background gallery and restores it on close", () => {
    document.body.style.overflow = "auto";
    const view = renderPalette({ isOpen: true, onClose: vi.fn() });

    expect(main.hasAttribute("inert")).toBe(true);
    expect(main.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");

    view.rerender(<CommandPalette isOpen={false} onClose={vi.fn()} />);

    expect(main.hasAttribute("inert")).toBe(false);
    expect(main.hasAttribute("aria-hidden")).toBe(false);
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    const { getByRole, getByTestId } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });

    const lastFocusable = getByTestId("filter-panel-button");
    lastFocusable.focus();
    fireEvent.keyDown(lastFocusable, { key: "Tab" });

    expect(document.activeElement).toBe(
      getByRole("button", { name: "action.search.reset" }),
    );
  });

  it("wraps Shift+Tab from the first focusable element to the last", () => {
    const { getByRole, getByTestId } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });

    const firstFocusable = getByRole("button", {
      name: "action.search.reset",
    });
    firstFocusable.focus();
    fireEvent.keyDown(firstFocusable, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(getByTestId("filter-panel-button"));
  });

  it("restores focus to the previously focused element on close", () => {
    const trigger = document.createElement("button");
    main.append(trigger);
    trigger.focus();

    const view = renderPalette({ isOpen: true, onClose: vi.fn() });
    view.rerender(<CommandPalette isOpen={false} onClose={vi.fn()} />);

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("expands the combobox onto the results listbox only while results are shown", () => {
    allTags = ["alpha", "beta"];
    const { getByRole, queryByRole } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });

    const input = getByRole("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBeNull();
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    expect(queryByRole("listbox")).toBeNull();

    fireEvent.change(input, { target: { value: "tag" } });

    const listbox = getByRole("listbox");
    expect(listbox.id).not.toBe("");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("moves aria-activedescendant and aria-selected with arrow-key navigation", () => {
    allTags = ["alpha", "beta"];
    const { getByRole, getAllByRole } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });

    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "tag" } });

    const [first, second] = getAllByRole("option");
    expect(getAllByRole("option")).toHaveLength(2);
    expect(first.id).not.toBe("");
    expect(input.getAttribute("aria-activedescendant")).toBe(first.id);
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(second.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(input.getAttribute("aria-activedescendant")).toBe(second.id);
    expect(first.getAttribute("aria-selected")).toBe("false");
    expect(second.getAttribute("aria-selected")).toBe("true");
  });

  it("announces the result summary through a polite live region", () => {
    allTags = ["alpha"];
    const { getByRole, getByText } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });

    expect(
      getByText("action.search.showing-filters").getAttribute("aria-live"),
    ).toBe("polite");

    fireEvent.change(getByRole("combobox"), { target: { value: "tag" } });

    expect(
      getByText("action.search.command-count").getAttribute("aria-live"),
    ).toBe("polite");
  });
});
