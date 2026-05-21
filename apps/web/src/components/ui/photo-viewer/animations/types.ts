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
}

export type PhotoViewerTransition = PhotoViewerTransitionState & {
  variant: PhotoViewerTransitionVariant;
};
