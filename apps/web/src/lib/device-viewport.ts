const getUserAgent = () => {
  if (typeof navigator === "undefined") {
    return "";
  }

  return navigator.userAgent;
};

export const isSafari = (() => {
  const userAgent = getUserAgent();

  return (
    /Safari/i.test(userAgent) &&
    !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android/i.test(userAgent)
  );
})();

export const isMobileDevice = (() => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = getUserAgent();
  const userAgentDataMobile = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData?.mobile;
  const isKnownMobileUserAgent =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent,
    );
  const isDesktopModeIPad =
    /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  const isCoarseTouchPrimaryInput =
    navigator.maxTouchPoints > 0 &&
    window.matchMedia?.("(pointer: coarse) and (hover: none)").matches === true;

  // `ontouchstart` alone misclassifies hybrid Windows laptops as mobile.
  return Boolean(
    userAgentDataMobile ??
    (isKnownMobileUserAgent || isDesktopModeIPad || isCoarseTouchPrimaryInput),
  );
})();
