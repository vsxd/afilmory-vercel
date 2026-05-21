const getUserAgent = () => {
  if (typeof navigator === "undefined") {
    return "";
  }

  return navigator.userAgent;
};

export const isSafari = (() => {
  const userAgent = getUserAgent();

  return /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
})();

export const isMobileDevice = (() => {
  if (typeof window === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      getUserAgent(),
    ) ||
    // 现代检测方式：支持触摸且屏幕较小
    "ontouchstart" in window
  );
})();
