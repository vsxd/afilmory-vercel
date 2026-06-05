import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider, useAtomValue } from "jotai";
import { createStore } from "jotai/vanilla";
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gallerySettingAtom, isCommandPaletteOpenAtom } from "~/atoms/app";

import { ActionGroup } from "../ActionGroup";

vi.mock("@afilmory/ui", () => ({
  Button: ({
    children,
    ...props
  }: PropsWithChildren<ComponentPropsWithoutRef<"button">>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  clsxm: (...values: unknown[]) => values.filter(Boolean).join(" "),
  DropdownMenu: ({ children }: PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: PropsWithChildren) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "action.search.unified.title": "Search & Filter",
          "action.map.explore": "Map Explore",
          "action.view.title": "View",
          "action.view.subtitle": "Layout and ordering",
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("~/hooks/useMobile", () => ({
  useMobile: () => false,
}));

vi.mock("../panels/ViewPanel", () => ({
  ViewPanel: () => <div />,
}));

const CommandPaletteStateProbe = () => {
  const isOpen = useAtomValue(isCommandPaletteOpenAtom);
  return <div data-testid="command-palette-open">{String(isOpen)}</div>;
};

describe("ActionGroup", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens the unified search and filter command palette from the header button", () => {
    const store = createStore();

    render(
      <Provider store={store}>
        <ActionGroup />
        <CommandPaletteStateProbe />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search & Filter" }));

    expect(screen.getByTestId("command-palette-open").textContent).toBe("true");
  });

  it("counts hidden region and district filters in the search badge", () => {
    const store = createStore();
    store.set(gallerySettingAtom, (prev) => ({
      ...prev,
      selectedGeoRegions: ["region:country=cn|region=anhui"],
      selectedGeoDistricts: ["district:country=cn|city=hangzhou|district=xihu"],
    }));

    render(
      <Provider store={store}>
        <ActionGroup />
      </Provider>,
    );

    expect(
      screen.getByRole("button", { name: "Search & Filter" }).textContent,
    ).toContain("2");
  });
});
