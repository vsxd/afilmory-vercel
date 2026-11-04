import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

import { PHOTO_VIEWER_FIT_SCALE } from "./animations/utils";
import type { DisplayImage, DisplayImagePhoto } from "./display-image";
import { selectDisplayImage } from "./display-image";

/** Choose once per photo before starting its request; resizing can request detail. */
export function useDisplayImage(
  originalSrc: string,
  photo: DisplayImagePhoto,
  viewportRef: RefObject<HTMLElement | null>,
) {
  const { width, height, isHDR, video, displayImages } = photo;
  const hasVideo = Boolean(video && video.type !== "none");
  const eligible = Boolean(displayImages?.length && !isHDR && !hasVideo);
  const [selection, setSelection] = useState<{
    originalSrc: string;
    image?: DisplayImage;
  } | null>(null);
  useLayoutEffect(() => {
    if (!eligible) return;
    const viewport = viewportRef.current;
    setSelection((previous) =>
      previous?.originalSrc === originalSrc
        ? previous
        : {
            originalSrc,
            image: selectDisplayImage(
              { width, height, isHDR, displayImages },
              {
                width: viewport?.clientWidth || window.innerWidth,
                height: viewport?.clientHeight || window.innerHeight,
                dpr: window.devicePixelRatio,
              },
              PHOTO_VIEWER_FIT_SCALE,
            ),
          },
    );
  }, [originalSrc, width, height, isHDR, displayImages, eligible, viewportRef]);
  return {
    ready: !eligible || selection?.originalSrc === originalSrc,
    image:
      eligible && selection?.originalSrc === originalSrc
        ? selection.image
        : undefined,
  };
}
