import type { ComponentProps } from "react";

import { useAppNavigation } from "./hooks";
import { isPlainLinkClick } from "./link-click";

/** Native href for copy/new-tab; ordinary activation carries in-app origin context. */
export function PhotoLink({
  photoId,
  photoIds,
  onClick,
  ...props
}: Omit<ComponentProps<"a">, "href"> & {
  photoId: string;
  photoIds?: string[];
}) {
  const navigation = useAppNavigation();
  return (
    <a
      {...props}
      href={navigation.photoHref(photoId)}
      onClick={(event) => {
        if (!isPlainLinkClick(event)) return;
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        navigation.openPhoto(photoId, { photoIds });
      }}
    />
  );
}
