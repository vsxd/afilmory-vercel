import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MasonryRef } from "./VirtualMasonry";
import { Masonry } from "./VirtualMasonry";

let scrollEl: HTMLElement | null = null;

vi.mock("@afilmory/ui", () => ({
  useScrollViewElement: () => scrollEl,
}));

beforeEach(() => {
  scrollEl = null;
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Masonry (pure-computed virtual masonry)", () => {
  it("renders visible cells and exposes layout metrics + item rects", () => {
    const capturedRef: { current: MasonryRef | null } = { current: null };

    const Probe = () => {
      const ref = capturedRef;
      return (
        <Masonry
          ref={ref}
          items={[{ id: "a" }, { id: "b" }, { id: "c" }]}
          columnWidth={100}
          columnGutter={4}
          rowGutter={6}
          itemHeight={() => 80}
          itemKey={(data) => data.id}
          render={({ data }) => (
            <div data-testid={`cell-${data.id}`}>{data.id}</div>
          )}
        />
      );
    };

    render(<Probe />);

    // jsdom 下容器宽度为 0 → 回退到列宽 → 单列，三个 item 垂直堆叠。
    expect(screen.getByTestId("cell-a")).toBeTruthy();

    const rect0 = capturedRef?.current?.getItemRect(0);
    expect(rect0?.width).toBe(100);
    expect(rect0?.height).toBe(80);

    const rect1 = capturedRef?.current?.getItemRect(1);
    // 第二个 cell 紧贴第一个下方 + rowGutter。
    expect(rect1?.top).toBe(80 + 6);

    const metrics = capturedRef?.current?.getLayoutMetrics();
    expect(metrics?.columnWidth).toBe(100);
    // 布局列宽（estimatePhotoVirtualRect 复算 left 用）：容器宽未知时回退目标列宽。
    expect(metrics?.layoutColumnWidth).toBe(100);
    expect(metrics?.columnCount).toBe(1);
    expect(metrics?.rowGutter).toBe(6);
  });

  it("returns null item rect for an out-of-range index", () => {
    const capturedRef: { current: MasonryRef | null } = { current: null };
    const Probe = () => {
      const ref = capturedRef;
      return (
        <Masonry
          ref={ref}
          items={[{ id: "only" }]}
          columnWidth={100}
          itemHeight={() => 50}
          itemKey={(data) => data.id}
          render={({ data }) => <div>{data.id}</div>}
        />
      );
    };
    render(<Probe />);
    expect(capturedRef?.current?.getItemRect(99)).toBeNull();
  });

  it("calls onRender with the visible index range", () => {
    const onRender = vi.fn();
    render(
      <Masonry
        items={[{ id: "a" }, { id: "b" }]}
        columnWidth={100}
        itemHeight={() => 50}
        itemKey={(data) => data.id}
        onRender={onRender}
        render={({ data }) => <div>{data.id}</div>}
      />,
    );
    expect(onRender).toHaveBeenCalled();
    const [startIndex, stopIndex] = onRender.mock.calls.at(-1) ?? [];
    expect(startIndex).toBe(0);
    expect(stopIndex).toBe(1);
  });

  it("does not re-fire onRender for scroll deltas that keep the visible set unchanged", async () => {
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "clientHeight", { value: 100 });
    scrollEl = scroller;
    const onRender = vi.fn();
    render(
      <Masonry
        items={[{ id: "a" }, { id: "b" }]}
        columnWidth={100}
        itemHeight={() => 50}
        itemKey={(data) => data.id}
        onRender={onRender}
        render={({ data }) => <div>{data.id}</div>}
      />,
    );
    const callsAfterMount = onRender.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    // 两个 50px 的 cell 都在 [10, 110] 视口内：滚动 10px 不改变可见集合，
    // onRender 不应再触发（曾因每帧新 selection 对象身份而每帧触发）。
    await act(async () => {
      scroller.scrollTop = 10;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });

    expect(onRender.mock.calls.length).toBe(callsAfterMount);
  });

  it("clears the pin once the pinned cell scrolls into the natural visible range", async () => {
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "clientHeight", { value: 100 });
    scroller.scrollTo = vi.fn();
    scrollEl = scroller;
    const items = Array.from({ length: 120 }, (_, index) => ({
      id: `photo-${index}`,
    }));
    const capturedRef: { current: MasonryRef | null } = { current: null };

    const Probe = () => {
      const ref = capturedRef;
      return (
        <Masonry
          ref={ref}
          items={items}
          columnWidth={100}
          itemHeight={() => 50}
          itemKey={(data) => data.id}
          render={({ data }) => (
            <a href={`#${data.id}`} data-gallery-photo-link>
              {data.id}
            </a>
          )}
        />
      );
    };

    render(<Probe />);

    act(() => {
      capturedRef?.current?.pinIndex(119);
    });
    // pin 让离屏 cell 强制挂载。
    expect(screen.getByText("photo-119")).toBeTruthy();

    // 滚到底部：cell 119 自然进入可见选择 → pin 解除。
    await act(async () => {
      scroller.scrollTop = 5850;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    expect(screen.getByText("photo-119")).toBeTruthy();

    // 滚回顶部：pin 已清除，cell 119 不再被强制渲染（否则整个会话都挂着）。
    await act(async () => {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    expect(screen.queryByText("photo-119")).toBeNull();
  });

  it("pins, scrolls to, and focuses a keyboard target beyond 100 virtual items", async () => {
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "clientHeight", { value: 100 });
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    scrollEl = scroller;
    const items = Array.from({ length: 120 }, (_, index) => ({
      id: `photo-${index}`,
    }));
    const capturedRef: { current: MasonryRef | null } = { current: null };

    const Probe = () => {
      const ref = capturedRef;
      return (
        <Masonry
          ref={ref}
          items={items}
          columnWidth={100}
          itemHeight={() => 50}
          itemKey={(data) => data.id}
          render={({ data }) => (
            <a href={`#${data.id}`} data-gallery-photo-link>
              {data.id}
            </a>
          )}
        />
      );
    };

    render(<Probe />);
    expect(screen.queryByText("photo-119")).toBeNull();

    act(() => {
      capturedRef?.current?.scrollToIndex(119, { focus: true });
    });

    await waitFor(() => {
      expect(screen.getByText("photo-119")).toBe(document.activeElement);
    });
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
  });

  it("focuses an already-visible target even when no scroll movement follows", async () => {
    // pin 已可见 cell 不会改变 visible 的身份（自然选择本就包含它）；聚焦
    // 不能依赖 visible 变化触发，否则"目标已渲染、无需滚动"时永远不聚焦。
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "clientHeight", { value: 100 });
    scroller.scrollTo = vi.fn();
    scrollEl = scroller;
    const capturedRef: { current: MasonryRef | null } = { current: null };

    const Probe = () => {
      const ref = capturedRef;
      return (
        <Masonry
          ref={ref}
          items={[{ id: "photo-0" }, { id: "photo-1" }]}
          columnWidth={100}
          itemHeight={() => 50}
          itemKey={(data) => data.id}
          render={({ data }) => (
            <a href={`#${data.id}`} data-gallery-photo-link>
              {data.id}
            </a>
          )}
        />
      );
    };

    render(<Probe />);
    expect(screen.getByText("photo-0")).toBeTruthy();

    act(() => {
      capturedRef?.current?.scrollToIndex(0, { focus: true });
    });

    await waitFor(() => {
      expect(screen.getByText("photo-0")).toBe(document.activeElement);
    });
  });
});
