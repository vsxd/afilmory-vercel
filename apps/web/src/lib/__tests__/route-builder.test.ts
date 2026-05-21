import { describe, expect, it, vi } from "vitest";

import { buildGlobRoutes } from "../route-builder";

describe("buildGlobRoutes", () => {
  it("does not inject a fake lazy loader for grouped routes without a layout module", () => {
    const photoIndexLoader = vi.fn();

    const routes = buildGlobRoutes({
      "./pages/(main)/photos/[photoId]/index.tsx": photoIndexLoader,
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]?.path).toBe("");
    expect(routes[0]?.lazy).toBeUndefined();
    expect(routes[0]?.children?.[0]?.path).toBe("photos");
    expect(routes[0]?.children?.[0]?.children?.[0]?.path).toBe(":photoId");
    expect(routes[0]?.children?.[0]?.children?.[0]?.children?.[0]?.path).toBe(
      "",
    );
    expect(routes[0]?.children?.[0]?.children?.[0]?.children?.[0]?.lazy).toBe(
      photoIndexLoader,
    );
  });

  it("keeps the real lazy loader when a grouped route layout exists", () => {
    const layoutLoader = vi.fn();
    const indexLoader = vi.fn();

    const routes = buildGlobRoutes({
      "./pages/(main)/layout.tsx": layoutLoader,
      "./pages/(main)/index.tsx": indexLoader,
    });

    expect(routes[0]?.lazy).toBe(layoutLoader);
    expect(routes[0]?.children?.[0]?.lazy).toBe(indexLoader);
  });
});
