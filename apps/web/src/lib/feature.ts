export const canUseWebGL = (() => {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    // 探测完立即释放上下文：iOS 对同页存活 WebGL 上下文数量有硬上限，
    // 不释放会让这个探测永久占用一个名额。
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
})();
