function supportsWebGL(contextType: "webgl" | "webgl2"): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    const gl =
      contextType === "webgl2"
        ? canvas.getContext("webgl2")
        : canvas.getContext("webgl");
    // 探测完立即释放上下文：iOS 对同页存活 WebGL 上下文数量有硬上限，
    // 不释放会让这个探测永久占用一个名额。
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

let webGLSupport: boolean | undefined;
let webGL2Support: boolean | undefined;

// Loading viewer/map code must not allocate GPU contexts. Probe only when a
// mounted consumer needs the capability, and reuse positive and negative results.
export function getCanUseWebGL(): boolean {
  return (webGLSupport ??= supportsWebGL("webgl"));
}

// MapLibre v6 requires WebGL2 even when the image viewer can use WebGL1.
export function getCanUseWebGL2(): boolean {
  return (webGL2Support ??= supportsWebGL("webgl2"));
}
