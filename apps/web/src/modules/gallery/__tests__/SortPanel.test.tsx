import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "jotai";
import { createStore } from "jotai/vanilla";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestNavigation } from "~/navigation/__tests__/test-router";
import type { NavigationController } from "~/navigation/controller";

import { SortPanel } from "../panels/SortPanel";

let navigation: NavigationController;
vi.mock("~/runtime/app-runtime", () => ({
  useAfilmoryRuntime: () => ({ navigation }),
}));
vi.mock("@afilmory/ui", () => ({
  clsxm: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "action.sort.newest.first": "Newest first",
          "action.sort.oldest.first": "Oldest first",
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

describe("SortPanel", () => {
  afterEach(() => {
    cleanup();
  });

  const renderPanel = (store: ReturnType<typeof createStore>) =>
    render(
      <Provider store={store}>
        <SortPanel />
      </Provider>,
    );

  it("exposes the active sort order via aria-pressed (parity with FilterPanel chips)", () => {
    const store = createStore();
    navigation = createTestNavigation().navigation;
    renderPanel(store);

    expect(
      screen
        .getByRole("button", { name: "Newest first" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Oldest first" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("switches the sort order and flips aria-pressed on click", () => {
    const store = createStore();
    navigation = createTestNavigation().navigation;
    renderPanel(store);

    fireEvent.click(screen.getByRole("button", { name: "Oldest first" }));

    expect(navigation.getGallerySettings().sortOrder).toBe("asc");
    expect(
      screen
        .getByRole("button", { name: "Oldest first" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps both sort choices available to keyboard focus", () => {
    const store = createStore();
    navigation = createTestNavigation().navigation;
    renderPanel(store);

    for (const name of ["Newest first", "Oldest first"]) {
      const button = screen.getByRole("button", { name });
      button.focus();
      expect(document.activeElement).toBe(button);
    }
  });
});
