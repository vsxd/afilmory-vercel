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

it("does not allocate a canvas or probe GPU capabilities when its module is imported", async () => {
  const createElement = vi.spyOn(document, "createElement");
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

  await import("../feature");

  expect(createElement).not.toHaveBeenCalled();
  expect(getContext).not.toHaveBeenCalled();
});

it("probes each capability on demand once and releases its context immediately", async () => {
  const loseContext = vi.fn();
  const context = createProbeContext(loseContext);
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context);

  const { getCanUseWebGL, getCanUseWebGL2 } = await import("../feature");

  expect(getCanUseWebGL()).toBe(true);
  expect(getCanUseWebGL()).toBe(true);
  expect(getContext).toHaveBeenCalledExactlyOnceWith("webgl");
  expect(loseContext).toHaveBeenCalledTimes(1);

  expect(getCanUseWebGL2()).toBe(true);
  expect(getCanUseWebGL2()).toBe(true);
  expect(getContext).toHaveBeenCalledTimes(2);
  expect(getContext).toHaveBeenLastCalledWith("webgl2");
  expect(loseContext).toHaveBeenCalledTimes(2);
});

it("does not treat a WebGL1-only browser as supporting MapLibre", async () => {
  const loseContext = vi.fn();
  const context = createProbeContext(loseContext);
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation((type) => (type === "webgl" ? context : null));

  const { getCanUseWebGL, getCanUseWebGL2 } = await import("../feature");

  expect(getCanUseWebGL2()).toBe(false);
  expect(getCanUseWebGL2()).toBe(false);
  expect(getContext).toHaveBeenCalledExactlyOnceWith("webgl2");
  expect(getCanUseWebGL()).toBe(true);
  expect(getContext).toHaveBeenCalledTimes(2);
  expect(loseContext).toHaveBeenCalledTimes(1);
});

it("caches blocked graphics contexts as unavailable without retrying every render", async () => {
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => {
      throw new Error("Graphics disabled");
    });

  const { getCanUseWebGL, getCanUseWebGL2 } = await import("../feature");

  expect(getCanUseWebGL()).toBe(false);
  expect(getCanUseWebGL2()).toBe(false);
  expect(getCanUseWebGL()).toBe(false);
  expect(getCanUseWebGL2()).toBe(false);
  expect(getContext).toHaveBeenCalledTimes(2);
});
