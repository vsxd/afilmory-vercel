import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BootstrapError } from "../BootstrapError";

const recovery = vi.hoisted(() => ({
  isStaleRuntimeError: vi.fn(),
  recoverFromStaleRuntimeError: vi.fn(),
  recoverStaleRuntime: vi.fn(),
}));

vi.mock("~/lib/stale-runtime-recovery", () => recovery);

describe("BootstrapError", () => {
  beforeEach(() => {
    recovery.isStaleRuntimeError.mockReset();
    recovery.recoverFromStaleRuntimeError.mockReset();
    recovery.recoverStaleRuntime.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows ordinary startup failures without automatic stale runtime recovery", () => {
    recovery.isStaleRuntimeError.mockReturnValue(false);

    render(<BootstrapError error={new Error("Manifest Load Failed")} />);

    expect(screen.getByRole("button", { name: "Retry" })).not.toBeNull();
    expect(recovery.recoverFromStaleRuntimeError).not.toHaveBeenCalled();
  });

  it("automatically recovers from stale runtime startup failures", async () => {
    recovery.isStaleRuntimeError.mockReturnValue(true);
    recovery.recoverFromStaleRuntimeError.mockResolvedValue({
      reloadRequested: true,
    });

    render(
      <BootstrapError
        error={
          new Error(
            "Failed to fetch dynamically imported module: /assets/MiniMap.js",
          )
        }
      />,
    );

    await waitFor(() => {
      expect(recovery.recoverFromStaleRuntimeError).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryAllByText("Manifest Load Failed")).toHaveLength(0);
    });
  });

  it("uses stale runtime cleanup for the retry button", () => {
    recovery.isStaleRuntimeError.mockReturnValue(false);
    recovery.recoverStaleRuntime.mockResolvedValue({ reloadRequested: true });

    render(<BootstrapError error={new Error("Manifest Load Failed")} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(recovery.recoverStaleRuntime).toHaveBeenCalledWith({ force: true });
  });
});
