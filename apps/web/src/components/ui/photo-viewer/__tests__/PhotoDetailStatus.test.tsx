import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recoverStaleRuntime } from "~/lib/stale-runtime-recovery";

import { PhotoDetailStatus } from "../PhotoDetailStatus";

vi.mock("@afilmory/ui", () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<"button"> & { variant?: string }) => <button {...props} />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("~/lib/stale-runtime-recovery", () => ({
  recoverStaleRuntime: vi.fn(),
}));

describe("photo detail status", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("announces pending work and removes the notice when details become available", () => {
    const details = {
      status: "pending" as const,
      reloadRequired: false,
      retry: vi.fn(),
    };
    const { rerender } = render(<PhotoDetailStatus details={details} />);
    expect(screen.getByRole("status").textContent).toBe(
      "photo.details.loading",
    );
    rerender(<PhotoDetailStatus details={{ ...details, status: "ready" }} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("retries an ordinary failure without reloading the application", () => {
    const retry = vi.fn();
    render(
      <PhotoDetailStatus
        details={{ status: "error", reloadRequired: false, retry }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "photo.details.error",
    );
    fireEvent.click(screen.getByRole("button", { name: "photo.error.retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(recoverStaleRuntime).not.toHaveBeenCalled();
  });

  it("reloads stale resources only after an explicit click and disables duplicate clicks", () => {
    vi.mocked(recoverStaleRuntime).mockReturnValue(new Promise(() => {}));
    const retry = vi.fn();
    render(
      <PhotoDetailStatus
        details={{ status: "error", reloadRequired: true, retry }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "photo.details.unavailable",
    );
    expect(recoverStaleRuntime).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "error.reload" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(recoverStaleRuntime).toHaveBeenCalledExactlyOnceWith({
      force: true,
    });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(retry).not.toHaveBeenCalled();
  });
});
