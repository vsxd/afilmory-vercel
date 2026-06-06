import { clsxm } from "@afilmory/ui";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { gallerySettingAtom } from "~/atoms/app";
import { siteConfig } from "~/config";
import { useContextPhotos } from "~/hooks/usePhotoViewer";
import { MageLens, TablerAperture } from "~/icons";
import {
  createGeographicRegions,
  getRegionDisplayName,
} from "~/lib/geo-regions";
import { convertPhotosToMarkersFromEXIF } from "~/lib/map-utils";
import { usePhotoRepository } from "~/runtime/app-runtime";
import type { PhotoManifest } from "~/types/photo";

import { ActionGroup } from "./ActionGroup";

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
  const gallerySetting = useAtomValue(gallerySettingAtom);
  const visiblePhotos = useContextPhotos();
  const photoRepository = usePhotoRepository();
  const photos = photoRepository.getPhotos();
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

    const photoMarkers = convertPhotosToMarkersFromEXIF(photos);
    const cityCount = createGeographicRegions(photoMarkers, "city").length;
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
    const photoMarkers = convertPhotosToMarkersFromEXIF(photos);
    const regionLabelMaps = {
      country: new Map(
        createGeographicRegions(photoMarkers, "country").map((region) => [
          region.id,
          getRegionDisplayName(region, i18n.language),
        ]),
      ),
      region: new Map(
        createGeographicRegions(photoMarkers, "region").map((region) => [
          region.id,
          getRegionDisplayName(region, i18n.language),
        ]),
      ),
      city: new Map(
        createGeographicRegions(photoMarkers, "city").map((region) => [
          region.id,
          getRegionDisplayName(region, i18n.language),
        ]),
      ),
      district: new Map(
        createGeographicRegions(photoMarkers, "district").map((region) => [
          region.id,
          getRegionDisplayName(region, i18n.language),
        ]),
      ),
    };

    return [
      ...gallerySetting.selectedTags.map((tag) => ({
        id: `tag-${tag}`,
        label: tag,
        icon: null,
      })),
      ...gallerySetting.selectedCameras.map((camera) => ({
        id: `camera-${camera}`,
        label: camera,
        icon: "camera" as const,
      })),
      ...gallerySetting.selectedLenses.map((lens) => ({
        id: `lens-${lens}`,
        label: lens,
        icon: "lens" as const,
      })),
      ...gallerySetting.selectedGeoCountries.map((id) => ({
        id: `geo-country-${id}`,
        label: regionLabelMaps.country.get(id) ?? id,
        icon: "location" as const,
      })),
      ...gallerySetting.selectedGeoRegions.map((id) => ({
        id: `geo-region-${id}`,
        label: regionLabelMaps.region.get(id) ?? id,
        icon: "location" as const,
      })),
      ...gallerySetting.selectedGeoCities.map((id) => ({
        id: `geo-city-${id}`,
        label: regionLabelMaps.city.get(id) ?? id,
        icon: "location" as const,
      })),
      ...gallerySetting.selectedGeoDistricts.map((id) => ({
        id: `geo-district-${id}`,
        label: regionLabelMaps.district.get(id) ?? id,
        icon: "location" as const,
      })),
      ...(gallerySetting.selectedTags.length > 1
        ? [
            {
              id: `tag-mode-${gallerySetting.tagFilterMode}`,
              label:
                gallerySetting.tagFilterMode === "intersection"
                  ? t("action.tag.match.all")
                  : t("action.tag.match.any"),
              icon: null,
            },
          ]
        : []),
    ];
  }, [
    gallerySetting.selectedCameras,
    gallerySetting.selectedGeoCities,
    gallerySetting.selectedGeoCountries,
    gallerySetting.selectedGeoDistricts,
    gallerySetting.selectedGeoRegions,
    gallerySetting.selectedLenses,
    gallerySetting.selectedTags,
    gallerySetting.tagFilterMode,
    i18n.language,
    photos,
    t,
  ]);

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
      className={clsxm(
        "overflow-hidden border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900",
        className,
      )}
      style={style}
    >
      <div className="px-6 pt-8 pb-6 text-center">
        <div className="mb-4 flex justify-center">
          <div className="relative inline-flex">
            {siteConfig.author.avatar && (
              <AvatarPrimitive.Root className="inline-flex size-16 items-center justify-center overflow-hidden rounded-full">
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
              <div className="from-accent to-accent/80 inline-flex size-16 items-center justify-center rounded-full bg-gradient-to-br shadow-sm">
                <i className="i-mingcute-camera-2-line text-2xl text-white" />
              </div>
            )}
          </div>
        </div>

        <h2 className="text-text mb-2 truncate text-xl leading-tight font-semibold">
          {siteConfig.name}
        </h2>

        {siteConfig.social && (
          <div className="flex items-center justify-center gap-2">
            {githubUrl && (
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-text-secondary hover:bg-fill-secondary hover:text-text inline-flex size-8 items-center justify-center rounded-full transition-colors"
                title="GitHub"
                aria-label="GitHub"
              >
                <i className="i-mingcute-github-fill text-base" />
              </a>
            )}
            {siteConfig.social.twitter && (
              <a
                href={`https://twitter.com/${siteConfig.social.twitter.replace("@", "")}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-text-secondary hover:bg-fill-secondary inline-flex size-8 items-center justify-center rounded-full transition-colors hover:text-[#1da1f2]"
                title="Twitter"
                aria-label="Twitter"
              >
                <i className="i-mingcute-twitter-fill text-base" />
              </a>
            )}
            {siteConfig.social.rss && (
              <a
                href="/feed.xml"
                target="_blank"
                rel="noreferrer noopener"
                className="text-text-secondary hover:bg-fill-secondary inline-flex size-8 items-center justify-center rounded-full transition-colors hover:text-[#ec672c]"
                title="RSS"
                aria-label="RSS"
              >
                <i className="i-mingcute-rss-2-fill text-base" />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="px-6 pb-6">
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
                <span
                  key={chip.id}
                  className="bg-fill-secondary/50 text-text-secondary inline-flex max-w-full min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-4 sm:px-2.5 sm:py-1 sm:text-[11px] sm:leading-5"
                  title={chip.label}
                >
                  {chip.icon === "camera" && (
                    <i
                      className="i-mingcute-camera-line shrink-0 text-[11px] sm:text-xs"
                      aria-hidden="true"
                    />
                  )}
                  {chip.icon === "lens" && (
                    <MageLens
                      className="shrink-0 text-[11px] sm:text-xs"
                      aria-hidden="true"
                    />
                  )}
                  {chip.icon === "location" && (
                    <i
                      className="i-mingcute-location-line shrink-0 text-[11px] sm:text-xs"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 truncate">{chip.label}</span>
                </span>
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
                      "text-text-secondary block shrink-0 whitespace-nowrap leading-none font-medium tabular-nums",
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
