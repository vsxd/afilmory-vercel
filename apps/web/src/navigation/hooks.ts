import { useSyncExternalStore } from "react";

import { useAfilmoryRuntime } from "~/runtime/app-runtime";

export const useAppNavigation = () => useAfilmoryRuntime().navigation;
export function useNavigationLocation() {
  const navigation = useAppNavigation();
  return useSyncExternalStore(
    navigation.subscribe,
    navigation.getLocation,
    navigation.getLocation,
  );
}
export function useGallerySettings() {
  const navigation = useAppNavigation();
  const settings = useSyncExternalStore(
    navigation.subscribe,
    navigation.getGallerySettings,
    navigation.getGallerySettings,
  );
  return [settings, navigation.updateGallerySettings] as const;
}
export function useIsPhotoPresented() {
  const navigation = useAppNavigation();
  return useSyncExternalStore(
    navigation.subscribe,
    navigation.isPhotoPresented,
    navigation.isPhotoPresented,
  );
}
