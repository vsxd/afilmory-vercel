import { createManifest } from "@afilmory/schema";
import { act, render } from "@testing-library/react";
import { Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestNavigation } from "~/navigation/__tests__/test-router";

import { Component } from "../pages/(main)/layout";
import type { AppRuntime } from "../runtime/app-runtime";
import { createAppRuntime } from "../runtime/app-runtime";
import { AfilmoryRuntimeProvider } from "../runtime/app-runtime-provider";

const masonryRenders = vi.fn();

vi.mock("@afilmory/ui", () => ({
  ScrollArea: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ScrollElementContext: ({
    children,
  }: PropsWithChildren<{ value: HTMLElement | null }>) => <>{children}</>,
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  Outlet: () => null,
}));

vi.mock("~/config", () => ({
  siteConfig: {
    accentColor: "",
  },
}));

vi.mock("~/modules/gallery/MasonryRoot", () => ({
  MasonryRoot: () => {
    masonryRenders();
    return <div>masonry</div>;
  },
}));

vi.mock("~/providers/photos-provider", () => ({
  PhotosProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));

describe("main layout render isolation", () => {
  let runtime: AppRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = createAppRuntime({ manifest: createManifest({ photos: [] }) });
    runtime.navigation = createTestNavigation().navigation;
  });

  const renderLayout = () =>
    render(
      <AfilmoryRuntimeProvider runtime={runtime}>
        <Provider store={runtime.store}>
          <Component />
        </Provider>
      </AfilmoryRuntimeProvider>,
    );

  it("re-renders the gallery tree on viewer open but not on swipes", () => {
    renderLayout();
    const rendersAfterMount = masonryRenders.mock.calls.length;
    expect(rendersAfterMount).toBeGreaterThan(0);

    // 打开查看器改变 路由是否为详情：布局要重渲染以隐藏图库
    act(() => {
      runtime.navigation.openPhoto("a", { photoIds: ["a", "b", "c"] });
    });
    const rendersAfterOpen = masonryRenders.mock.calls.length;
    expect(rendersAfterOpen).toBeGreaterThan(rendersAfterMount);

    // 滑动换图只改 照片路由：布局（及整棵 masonry 树）不得重渲染
    act(() => {
      runtime.navigation.stepPhoto("b");
    });
    act(() => {
      runtime.navigation.stepPhoto("c");
    });
    expect(masonryRenders.mock.calls.length).toBe(rendersAfterOpen);

    // 关闭查看器要恢复图库：布局重新渲染
    act(() => {
      runtime.navigation.requestPhotoClose();
    });
    expect(masonryRenders.mock.calls.length).toBeGreaterThan(rendersAfterOpen);
  });
});
