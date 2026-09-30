import { isMapPath, parsePhotoId } from "~/navigation/routes";

// Homepage startup only needs the gallery route. Deep links also prepare their
// destination so the existing splash stays visible throughout the cold import.

type CriticalRoutePreloadModules = Record<
  string,
  (() => Promise<unknown>) | undefined
>;

export function installCriticalRoutePreloads(
  preloadModules: CriticalRoutePreloadModules,
  pathname = "/",
): Promise<void> {
  const moduleKeys = ["./pages/(main)/layout.tsx"];
  if (isMapPath(pathname)) moduleKeys.push("./pages/explore/index.tsx");
  else if (parsePhotoId(pathname) !== null)
    moduleKeys.push("./pages/(main)/photos/[photoId]/index.tsx");

  const preloadPromises = moduleKeys.map((moduleKey) => {
    const preloadModule = preloadModules[moduleKey];
    if (!preloadModule) {
      throw new Error(`Missing critical route module: ${moduleKey}`);
    }

    return preloadModule();
  });

  return Promise.all(preloadPromises).then(() => {});
}
