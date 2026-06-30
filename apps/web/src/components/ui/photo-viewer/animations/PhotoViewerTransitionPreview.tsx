import { Spring, Thumbhash } from "@afilmory/ui";
import { m } from "motion/react";

import type { PhotoViewerTransition } from "./types";

interface PhotoViewerTransitionPreviewProps {
  transition: PhotoViewerTransition;
  onComplete: () => void;
}

// 守卫目标尺寸为 0 的情况，避免 Infinity/NaN 的缩放比破坏动画。
const safeScale = (from: number, to: number) => (to > 0 ? from / to : 1);

export const PhotoViewerTransitionPreview = ({
  transition,
  onComplete,
}: PhotoViewerTransitionPreviewProps) => {
  const baseTransition = Spring.snappy(0.5);
  const thumbHash =
    typeof transition.thumbHash === "string" ? transition.thumbHash : null;

  const { from, to } = transition;

  // 用 transform: scale 表达尺寸变化，而非逐帧动画 width/height。
  // 元素静态布局为「目标(to)尺寸」，配合 transform-origin: top-left，
  // 起始时缩放到 from 大小，再动到 1 —— 全程只动 transform，不触发逐帧布局/重排。
  //
  // 为何视觉等价：画廊瓦片与查看器取景框都按照片宽高比布局，故 scaleX≈scaleY
  // (等比)，object-cover 子图不会被拉伸；又因 渲染尺寸 = to尺寸 × scale(t)
  // = lerp(from, to)，spring 下的尺寸路径与原 width/height 动画逐帧一致。
  const fromScaleX = safeScale(from.width, to.width);
  const fromScaleY = safeScale(from.height, to.height);

  // 决策点(borderRadius 在缩放下会被一并放大/缩小)：起始圆角预除以缩放比，
  // 使屏幕上的圆角端点与原实现一致(渲染圆角 = 设定值 × scale)。若希望过渡中
  // 圆角观感不同，调整这里即可。
  const fromBorderRadius =
    fromScaleX > 0 ? from.borderRadius / fromScaleX : from.borderRadius;

  return (
    <m.div
      className="pointer-events-none fixed top-0 left-0 z-40 origin-top-left"
      data-variant={`photo-viewer-transition-${transition.variant}`}
      style={{ width: to.width, height: to.height }}
      initial={{
        x: from.left,
        y: from.top,
        scaleX: fromScaleX,
        scaleY: fromScaleY,
        borderRadius: fromBorderRadius,
        opacity: 1,
      }}
      animate={{
        x: to.left,
        y: to.top,
        scaleX: 1,
        scaleY: 1,
        borderRadius: to.borderRadius,
        opacity: 1,
      }}
      transition={baseTransition}
      onAnimationComplete={onComplete}
    >
      <div className="relative h-full w-full overflow-hidden bg-black">
        {thumbHash && (
          <Thumbhash
            thumbHash={thumbHash}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        )}
        <img
          src={transition.imageSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      </div>
    </m.div>
  );
};
