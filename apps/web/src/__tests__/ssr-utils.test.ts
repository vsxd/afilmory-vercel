// @vitest-environment node

import { describe, expect, it } from "vitest";

import { isMobile } from "../hooks/useMobile";
import { getCanUseWebGL, getCanUseWebGL2 } from "../lib/feature";
import { springScrollTo } from "../lib/scroller";

describe("apps/web SSR utility safety", () => {
  it("reports WebGL as unavailable without document", () => {
    expect(getCanUseWebGL()).toBe(false);
    expect(getCanUseWebGL2()).toBe(false);
  });

  it("reports non-mobile without window", () => {
    expect(isMobile()).toBe(false);
  });

  it("allows springScrollTo to no-op without DOM globals", () => {
    expect(springScrollTo(100)).toBeNull();
  });
});
