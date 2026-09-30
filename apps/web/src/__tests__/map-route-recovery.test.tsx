import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recoverStaleRuntime } from "~/lib/stale-runtime-recovery";

import { Component as MapRoute } from "../pages/explore/index";

vi.mock("~/modules/map/MapSection", () => ({
  MapSection: () => {
    throw new Error("Map rendering failed");
  },
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("~/lib/stale-runtime-recovery", () => ({
  recoverStaleRuntime: vi.fn(),
}));

describe("map route recovery", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("reloads the runtime once after a map rendering failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recoverStaleRuntime).mockReturnValue(new Promise(() => {}));
    render(<MapRoute />);
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(recoverStaleRuntime).not.toHaveBeenCalled();
    const reload = screen.getByRole("button", { name: "error.reload" });
    fireEvent.click(reload);
    fireEvent.click(reload);
    expect(recoverStaleRuntime).toHaveBeenCalledExactlyOnceWith({
      force: true,
    });
    expect(reload.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", { name: "error.go.back" }),
    ).not.toBeNull();
  });
});
