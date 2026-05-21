export const canUseWebGL = (() => {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    return gl !== null;
  } catch {
    return false;
  }
})();
