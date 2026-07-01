export interface AnimationFrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: number;
}

export type PhotoViewerTransitionVariant = "entry" | "exit";

export interface PhotoViewerTransitionState {
  photoId: string;
  imageSrc: string;
  thumbHash?: string | null;
  from: AnimationFrameRect;
  to: AnimationFrameRect;
  /**
   * 退出 FLIP 的竖直初速度（px/s）。由下滑关闭的释放速度提供，喂给 y 弹簧使
   * “快速下甩关闭”物理连续、无停顿。缺省时按普通关闭处理。
   */
  velocityY?: number;
}

export type PhotoViewerTransition = PhotoViewerTransitionState & {
  variant: PhotoViewerTransitionVariant;
};
