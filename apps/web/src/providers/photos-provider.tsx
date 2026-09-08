/* eslint-disable react-refresh/only-export-components */

import { createContext } from "react";

import type { PhotoManifest } from "~/types/photo";

export const PhotosContext = createContext<readonly PhotoManifest[]>(null!);

export const PhotosProvider = ({
  children,
  photos,
}: {
  children: React.ReactNode;
  photos: readonly PhotoManifest[];
}) => {
  return <PhotosContext value={photos}>{children}</PhotosContext>;
};
