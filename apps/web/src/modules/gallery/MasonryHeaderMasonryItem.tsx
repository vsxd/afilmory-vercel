import { clsxm } from "@afilmory/ui";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { siteConfig } from "~/config";
import { useContextPhotos } from "~/hooks/usePhotoViewer";
import { TablerAperture } from "~/icons";
import { getPhotoGeoData } from "~/lib/geo-regions";
import { useGallerySettings } from "~/navigation/hooks";
import { usePhotoRepositorySnapshot } from "~/runtime/app-runtime";
import type { PhotoManifest } from "~/types/photo";

import { ActionGroup } from "./ActionGroup";
import {
  applyGalleryCommandAction,
  buildActiveFilterChips,
} from "./command-palette/model";
import { createGeoRegionLabelMaps } from "./filter-options";

const getPhotoCameraName = (photo: PhotoManifest) => {
  const make = photo.exif?.Make?.trim();
  const model = photo.exif?.Model?.trim();
  if (!make || !model) return null;
  return `${make} ${model}`;
};

const getPhotoLensName = (photo: PhotoManifest) => {
  const model = photo.exif?.LensModel?.trim();
  if (!model) return null;
  const make = photo.exif?.LensMake?.trim();
  return make ? `${make} ${model}` : model;
};

const getGitHubUrl = (github: string | undefined) => {
  const value = github?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("github.com/")) return `https://${value}`;
  return `https://github.com/${value.replace(/^@/, "")}`;
};

export const MasonryHeaderMasonryItem = ({
  style,
  className,
}: {
  style?: React.CSSProperties;
  className?: string;
}) => {
  const { t, i18n } = useTranslation();
  const [gallerySetting, setGallerySetting] = useGallerySettings();
  const visiblePhotos = useContextPhotos();
  const photos = usePhotoRepositorySnapshot();
  const visiblePhotoCount = visiblePhotos.length;
  const githubUrl = getGitHubUrl(siteConfig.social?.github);
  const statsGridRef = useRef<HTMLDivElement>(null);
  const [statsGridDensity, setStatsGridDensity] = useState<
    "normal" | "compact" | "tight"
  >("normal");

  const hasFilters =
    gallerySetting.selectedTags.length > 0 ||
    gallerySetting.selectedCameras.length > 0 ||
    gallerySetting.selectedLenses.length > 0 ||
    gallerySetting.selectedGeoCountries.length > 0 ||
    gallerySetting.selectedGeoRegions.length > 0 ||
    gallerySetting.selectedGeoCities.length > 0 ||
    gallerySetting.selectedGeoDistricts.length > 0;

  const libraryStats = useMemo(() => {
    const cameraSet = new Set<string>();
    const lensSet = new Set<string>();

    for (const photo of photos) {
      const camera = getPhotoCameraName(photo);
      if (camera) cameraSet.add(camera);

      const lens = getPhotoLensName(photo);
      if (lens) lensSet.add(lens);
    }

    const { markers: photoMarkers, regionsByLevel } = getPhotoGeoData(photos);
    const cityCount = regionsByLevel.city.length;
    const hasCityData = cityCount > 0;

    return [
      {
        id: "photos",
        value: photos.length,
        label: t("gallery.library.stats.photos"),
        icon: "i-mingcute-pic-fill",
      },
      {
        id: "cameras",
        value: cameraSet.size,
        label: t("gallery.library.stats.cameras"),
        icon: "i-mingcute-camera-fill",
      },
      {
        id: "lenses",
        value: lensSet.size,
        label: t("gallery.library.stats.lenses"),
        icon: "aperture",
      },
      {
        id: hasCityData ? "cities" : "gps",
        value: hasCityData ? cityCount : photoMarkers.length,
        label: hasCityData
          ? t("gallery.library.stats.cities")
          : t("gallery.library.stats.gpsPhotos"),
        icon: hasCityData
          ? "i-mingcute-building-5-line"
          : "i-mingcute-location-fill",
      },
    ];
  }, [photos, t]);

  const filterChips = useMemo(() => {
    const regionLabelMaps = createGeoRegionLabelMaps(
      getPhotoGeoData(photos).regionsByLevel,
      i18n.language,
    );

    return buildActiveFilterChips({ gallerySetting, regionLabelMaps });
  }, [gallerySetting, i18n.language, photos]);

  useEffect(() => {
    const element = statsGridRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const updateLayout = (width: number) => {
      if (width < 210) {
        setStatsGridDensity("tight");
        return;
      }

      if (width < 280) {
        setStatsGridDensity("compact");
        return;
      }

      setStatsGridDensity("normal");
    };

    updateLayout(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateLayout(entry.contentRect.width);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [hasFilters]);

  return (
    <div
      className={clsxm("af-panel overflow-hidden", className)}
      style={style}
      data-gallery-header
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 lg:flex-col lg:gap-3 lg:px-5 lg:pt-6 lg:pb-4 lg:text-center">
        <div className="flex shrink-0 justify-center">
          <div className="relative inline-flex">
            {siteConfig.author.avatar && (
              <AvatarPrimitive.Root className="inline-flex size-12 items-center justify-center overflow-hidden rounded-full lg:size-16">
                <AvatarPrimitive.Image
                  src={siteConfig.author.avatar}
                  className="size-full object-cover"
                  alt={siteConfig.author.name || siteConfig.name}
                />
                <AvatarPrimitive.Fallback className="size-full">
                  <div className="bg-material-medium size-full" />
                </AvatarPrimitive.Fallback>
              </AvatarPrimitive.Root>
            )}
            {!siteConfig.author.avatar && (
              <div className="bg-accent text-accent-content inline-flex size-12 items-center justify-center rounded-full lg:size-16">
                <i
                  className="i-mingcute-camera-2-line text-2xl"
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 lg:w-full">
          <h1 className="text-text text-lg leading-snug font-semibold text-balance wrap-anywhere lg:text-xl">
            {siteConfig.name}
          </h1>

          {siteConfig.social && (
            <div className="-ml-2 flex flex-wrap items-center gap-1 lg:ml-0 lg:justify-center">
              {githubUrl && (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-text-secondary hover:bg-fill-secondary hover:text-text inline-flex size-11 items-center justify-center rounded-full transition-colors"
                  title="GitHub"
                  aria-label="GitHub"
                >
                  <i
                    className="i-mingcute-github-fill text-base"
                    aria-hidden="true"
                  />
                </a>
              )}
              {siteConfig.social.twitter && (
                <a
                  href={`https://twitter.com/${siteConfig.social.twitter.replace("@", "")}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-text-secondary hover:bg-fill-secondary inline-flex size-11 items-center justify-center rounded-full transition-colors hover:text-[#1da1f2]"
                  title="Twitter"
                  aria-label="Twitter"
                >
                  <i
                    className="i-mingcute-twitter-fill text-base"
                    aria-hidden="true"
                  />
                </a>
              )}
              {siteConfig.social.rss && (
                <a
                  href="/feed.xml"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-text-secondary hover:bg-fill-secondary inline-flex size-11 items-center justify-center rounded-full transition-colors hover:text-[#ec672c]"
                  title="RSS"
                  aria-label="RSS"
                >
                  <i
                    className="i-mingcute-rss-2-fill text-base"
                    aria-hidden="true"
                  />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 lg:px-5 lg:pb-5">
        <ActionGroup />
      </div>

      <div className="border-fill-secondary border-t px-4 py-2 sm:px-5 sm:py-2.5">
        {hasFilters ? (
          <div className="space-y-2 sm:space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-text-secondary text-[10px] leading-none font-medium sm:text-xs">
                {t("gallery.library.filters.title")}
              </span>
              <span className="text-text-secondary text-[10px] leading-none font-medium tabular-nums sm:text-xs">
                {t("gallery.library.filters.subtitle", {
                  count: visiblePhotoCount,
                })}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {filterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  data-filter-chip={chip.id}
                  className="af-control text-text-secondary inline-flex min-h-11 max-w-full min-w-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left text-xs leading-4"
                  aria-label={t("gallery.filters.remove", {
                    label: chip.label,
                  })}
                  onClick={(event) => {
                    const button = event.currentTarget;
                    const nextChip =
                      button.nextElementSibling ??
                      button.previousElementSibling;
                    const nextId =
                      nextChip instanceof HTMLElement
                        ? nextChip.dataset.filterChip
                        : undefined;
                    const gallery =
                      button.closest("[data-gallery-root]") ??
                      button.closest("[data-gallery-header]");
                    setGallerySetting((previous) =>
                      applyGalleryCommandAction(previous, chip.action),
                    );
                    // Filtering can remount the measured desktop header. Resolve the
                    // replacement control after the new photo set has committed.
                    requestAnimationFrame(() => {
                      const header = gallery?.matches("[data-gallery-header]")
                        ? gallery
                        : gallery?.querySelector("[data-gallery-header]");
                      const next = Array.from(
                        header?.querySelectorAll<HTMLButtonElement>(
                          "[data-filter-chip]",
                        ) ?? [],
                      ).find(
                        (element) => element.dataset.filterChip === nextId,
                      );
                      (
                        next ??
                        header?.querySelector<HTMLButtonElement>(
                          "[data-gallery-search]",
                        )
                      )?.focus({ preventScroll: true });
                    });
                  }}
                >
                  <i
                    className={clsxm(chip.icon, "shrink-0 text-sm")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 wrap-anywhere">{chip.label}</span>
                  <i
                    className="i-mingcute-close-line ml-auto shrink-0 text-sm"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            ref={statsGridRef}
            className="divide-fill-secondary grid grid-cols-4 divide-x"
          >
            {libraryStats.map((stat) => (
              <div
                key={stat.id}
                className={clsxm(
                  "flex min-w-0 justify-center first:pl-0 last:pr-0",
                  statsGridDensity === "tight" && "px-0",
                  statsGridDensity === "compact" && "px-0.5",
                  statsGridDensity === "normal" && "px-1.5 sm:px-2",
                )}
              >
                <div
                  className={clsxm(
                    "inline-flex min-w-max flex-col items-center justify-center text-center",
                    statsGridDensity === "normal" && "gap-0.5",
                    statsGridDensity === "compact" && "gap-0.5",
                    statsGridDensity === "tight" && "gap-0.5",
                  )}
                  title={`${stat.label}: ${stat.value}`}
                  role="group"
                  aria-label={`${stat.label}: ${stat.value}`}
                >
                  <span
                    className={clsxm(
                      "text-text-secondary flex shrink-0 items-center justify-center",
                      statsGridDensity === "normal" && "h-4 w-5",
                      statsGridDensity === "compact" && "h-4 w-5",
                      statsGridDensity === "tight" && "h-3.5 w-4",
                    )}
                  >
                    {stat.icon === "aperture" ? (
                      <TablerAperture
                        className={clsxm(
                          statsGridDensity === "normal" && "text-[16px]",
                          statsGridDensity === "compact" && "text-[15px]",
                          statsGridDensity === "tight" && "text-sm",
                        )}
                        aria-hidden="true"
                      />
                    ) : (
                      <i
                        className={clsxm(
                          stat.icon,
                          statsGridDensity === "normal" && "text-[16px]",
                          statsGridDensity === "compact" && "text-[15px]",
                          statsGridDensity === "tight" && "text-sm",
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span
                    className={clsxm(
                      "text-text block shrink-0 whitespace-nowrap leading-none font-medium tabular-nums",
                      statsGridDensity === "normal" && "text-[15px]",
                      statsGridDensity === "compact" && "text-sm",
                      statsGridDensity === "tight" && "text-[13px]",
                    )}
                  >
                    {stat.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
