import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadingIndicatorRef } from "../LoadingIndicator";
import { LoadingIndicator } from "../LoadingIndicator";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const renderIndicator = () => {
  const ref: { current: LoadingIndicatorRef | null } = { current: null };
  render(<LoadingIndicator ref={ref} />);
  return ref;
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LoadingIndicator", () => {
  beforeEach(() => vi.useFakeTimers());

  it("renders nothing until a visible state arrives", () => {
    renderIndicator();

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces loading states through a polite live region", () => {
    const ref = renderIndicator();

    act(() => {
      ref.current!.updateLoadingState({ isVisible: true, loadingProgress: 42 });
      vi.advanceTimersByTime(180);
    });

    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("loading.default");
  });

  it.each([
    ["high", "loading.webgl.quality.high", "text-green-400"],
    ["medium", "loading.webgl.quality.medium", "text-amber-400"],
    ["low", "loading.webgl.quality.low", "text-red-400"],
  ] as const)(
    "translates the %s WebGL quality badge and colors it via a palette utility",
    (quality, labelKey, colorClass) => {
      const ref = renderIndicator();

      act(() => {
        ref.current!.updateLoadingState({
          isVisible: true,
          isWebGLLoading: true,
          webglQuality: quality,
        });
        vi.advanceTimersByTime(180);
      });

      const badge = screen.getByText(labelKey);
      expect(badge.classList.contains(colorClass)).toBe(true);
      // 颜色必须走调色板工具类，而不是内联 hex。
      expect(badge.getAttribute("style")).toBeNull();
    },
  );

  it("hides the quality badge while quality is unknown", () => {
    const ref = renderIndicator();

    act(() => {
      ref.current!.updateLoadingState({
        isVisible: true,
        isWebGLLoading: true,
        webglQuality: "unknown",
      });
      vi.advanceTimersByTime(180);
    });

    expect(screen.getByRole("status").textContent).not.toContain("unknown");
  });

  it("announces a persistent error without contradictory loading text", () => {
    const ref = renderIndicator();

    act(() => {
      ref.current!.updateLoadingState({
        isVisible: true,
        isError: true,
        errorMessage: "photo.error.loading",
      });
    });

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.getAttribute("aria-atomic")).toBe("true");
    expect(alert.textContent).toContain("photo.error.loading");
    expect(alert.textContent).not.toContain("loading.default");
  });

  it("never displays loading when a cached image paints before the delay", () => {
    const ref = renderIndicator();
    act(() => {
      ref.current!.updateLoadingState({ isVisible: true });
      vi.advanceTimersByTime(179);
    });
    expect(screen.queryByRole("status")).toBeNull();
    act(() => {
      ref.current!.updateLoadingState({ isVisible: false });
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the latest pending progress and hides immediately after completion", () => {
    const ref = renderIndicator();
    act(() => {
      ref.current!.updateLoadingState({ isVisible: true, loadingProgress: 0 });
      vi.advanceTimersByTime(100);
      ref.current!.updateLoadingState({ loadingProgress: 70 });
      vi.advanceTimersByTime(80);
    });
    expect(screen.getByRole("status").textContent).toContain("70%");
    act(() => ref.current!.updateLoadingState({ isVisible: false }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("cancels pending loading on reset and gives the next photo its own delay", () => {
    const ref = renderIndicator();
    act(() => {
      ref.current!.updateLoadingState({ isVisible: true });
      vi.advanceTimersByTime(150);
      ref.current!.resetLoadingState();
      ref.current!.updateLoadingState({ isVisible: true, loadingProgress: 20 });
      vi.advanceTimersByTime(30);
    });
    expect(screen.queryByRole("status")).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByRole("status").textContent).toContain("20%");
  });

  it("cancels the pending display timer when unmounted", () => {
    const ref: { current: LoadingIndicatorRef | null } = { current: null };
    const { unmount } = render(<LoadingIndicator ref={ref} />);
    act(() => ref.current!.updateLoadingState({ isVisible: true }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows an actionable failure and a retry button outside the dismiss gesture", () => {
    const onRetry = vi.fn();
    const ref = renderIndicator();
    act(() => {
      ref.current!.updateLoadingState({
        isVisible: true,
        isError: true,
        errorMessage: "Original photo not found",
        errorDescription: "Let the site owner know.",
        onRetry,
      });
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Original photo not found");
    expect(alert.textContent).toContain("Let the site owner know.");
    expect(alert.dataset.photoViewerGestureIgnore).toBeDefined();
    expect(alert.classList.contains("pointer-events-auto")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "photo.error.retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
