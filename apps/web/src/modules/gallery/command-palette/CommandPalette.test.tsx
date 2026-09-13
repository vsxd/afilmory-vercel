import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestNavigation } from "~/navigation/__tests__/test-router";
import type { NavigationController } from "~/navigation/controller";

import { CommandPalette } from "./CommandPalette";

// jsdom 没有 scrollIntoView（选中项滚动效果会触发）
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

let navigation: NavigationController;
let isMobile = false;
let shouldReduceMotion = false;
let allTags: string[] = [];

vi.mock("motion/react", () => ({
  useReducedMotion: () => shouldReduceMotion,
}));

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
  usePhotos: () => [],
  getViewerSourceMode: () => "all",
  useOpenPhotoViewer: () => vi.fn(),
}));

vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({ navigation }),
  usePhotoRepositorySnapshot: () => [],
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
    navigation = createTestNavigation().navigation;
    isMobile = false;
    shouldReduceMotion = false;
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
    const { getByRole } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });

    const lastFocusable = getByRole("button", {
      name: "action.search.view-photos",
    });
    lastFocusable.focus();
    fireEvent.keyDown(lastFocusable, { key: "Tab" });

    expect(document.activeElement).toBe(
      getByRole("button", { name: "common.close" }),
    );
  });

  it("wraps Shift+Tab from the first focusable element to the last", () => {
    const { getByRole } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });

    const firstFocusable = getByRole("button", {
      name: "common.close",
    });
    firstFocusable.focus();
    fireEvent.keyDown(firstFocusable, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(
      getByRole("button", { name: "action.search.view-photos" }),
    );
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
      getByText("action.search.grouped-summary").getAttribute("aria-live"),
    ).toBe("polite");
  });

  it.each([
    { reducedMotion: false, behavior: "smooth" },
    { reducedMotion: true, behavior: "auto" },
  ])(
    "scrolls the keyboard target with $behavior behavior when reduced motion is $reducedMotion",
    ({ reducedMotion, behavior }) => {
      shouldReduceMotion = reducedMotion;
      allTags = ["alpha", "beta"];
      const { getByRole } = renderPalette({ isOpen: true, onClose: vi.fn() });
      const input = getByRole("combobox");
      fireEvent.change(input, { target: { value: "tag" } });
      const target = getByRole("option", { name: /beta/ });
      const scrollIntoView = vi.spyOn(target, "scrollIntoView");

      fireEvent.keyDown(input, { key: "ArrowDown" });

      expect(input.getAttribute("aria-activedescendant")).toBe(target.id);
      expect(target.getAttribute("aria-selected")).toBe("true");
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        behavior,
      });
    },
  );

  it("clears an unmatched query without removing applied filters", () => {
    navigation = createTestNavigation("/?tags=alpha&sort=asc").navigation;
    allTags = ["alpha", "beta"];
    const { getByRole, getAllByRole, getByTestId } = renderPalette({
      isOpen: true,
      onClose: vi.fn(),
    });
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "zzzz-unmatched-query" } });

    fireEvent.click(
      getAllByRole("button", { name: "action.search.clear-query" })[0],
    );

    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(getByTestId("filter-panel-button")).toBeDefined();
    expect(navigation.getGallerySettings()).toMatchObject({
      selectedTags: ["alpha"],
      sortOrder: "asc",
    });
  });

  it("distinguishes applied filters from the keyboard-highlighted result", () => {
    navigation = createTestNavigation("/?tags=alpha").navigation;
    allTags = ["alpha", "beta"];
    const { getByRole } = renderPalette({ isOpen: true, onClose: vi.fn() });
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "tag" } });

    const applied = getByRole("option", { name: /alpha/ });
    const other = getByRole("option", { name: /beta/ });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(applied.getAttribute("aria-description")).toBe(
      "action.search.filter-applied",
    );
    expect(applied.getAttribute("aria-selected")).toBe("false");
    expect(other.getAttribute("aria-description")).toBeNull();
    expect(other.getAttribute("aria-selected")).toBe("true");
    expect(navigation.getGallerySettings().selectedTags).toEqual(["alpha"]);
  });
});
