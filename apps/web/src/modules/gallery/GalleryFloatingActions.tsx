import { clsxm } from "@afilmory/ui";
import { useState } from "react";

import { ActionGroup } from "./ActionGroup";

export const GalleryFloatingActions = ({
  isVisible,
  isMobile,
}: {
  isVisible: boolean;
  isMobile: boolean;
}) => {
  const [hasFocus, setHasFocus] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const visible = isVisible || hasFocus || overlayOpen;

  return (
    <div
      data-gallery-floating-actions
      // Keep the trigger instance alive while a portalled panel owns focus.
      // Closing the panel can then restore focus even if filtering reset scroll.
      inert={!visible}
      // Inherit a hidden gallery's visibility while the photo viewer is open.
      style={{ visibility: visible ? undefined : "hidden" }}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocus(false);
        }
      }}
      className={clsxm(
        "af-popover fixed z-40 rounded-2xl p-2 transition-[opacity,transform] duration-200 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        isMobile
          ? "bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2"
          : "top-6 right-6",
      )}
    >
      <ActionGroup onOverlayOpenChange={setOverlayOpen} />
    </div>
  );
};
