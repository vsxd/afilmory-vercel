import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function createProbeContext(loseContext: () => void): WebGLRenderingContext {
  const context: Pick<WebGLRenderingContext, "getExtension"> = {
    getExtension: vi
      .fn<WebGLRenderingContext["getExtension"]>()
      .mockReturnValue({ loseContext }),
  };
  return context as WebGLRenderingContext;
}

it("detects WebGL2 separately and releases each capability probe context", async () => {
  const loseContext = vi.fn();
  const context = createProbeContext(loseContext);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);

  const { canUseWebGL, canUseWebGL2 } = await import("../feature");

  expect(canUseWebGL).toBe(true);
  expect(canUseWebGL2).toBe(true);
  expect(loseContext).toHaveBeenCalledTimes(2);
});

it("does not treat a WebGL1-only browser as supporting MapLibre", async () => {
  const loseContext = vi.fn();
  const context = createProbeContext(loseContext);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (type) => (type === "webgl" ? context : null),
  );

  const { canUseWebGL, canUseWebGL2 } = await import("../feature");

  expect(canUseWebGL).toBe(true);
  expect(canUseWebGL2).toBe(false);
  expect(loseContext).toHaveBeenCalledTimes(1);
});

it("treats blocked graphics contexts as unavailable", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    throw new Error("Graphics disabled");
  });

  const { canUseWebGL, canUseWebGL2 } = await import("../feature");

  expect(canUseWebGL).toBe(false);
  expect(canUseWebGL2).toBe(false);
});
