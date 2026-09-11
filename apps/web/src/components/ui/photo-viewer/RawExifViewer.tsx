import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ScrollArea,
} from "@afilmory/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ExifToolManager } from "~/lib/exiftool";
import { useAfilmoryRuntime } from "~/runtime/app-runtime";
import type { PhotoManifest } from "~/types/photo";

import { ExifFieldGroup } from "./exif/ExifFieldGroup";
import { exifCategories } from "./exif/field-definitions";

// Category configuration for rendering — static, defined outside component
const CATEGORY_CONFIG = [
  {
    key: "basic",
    title: "File Information",
    translationKey: "exif.raw.category.basic",
  },
  {
    key: "camera",
    title: "Camera Information",
    translationKey: "exif.raw.category.camera",
  },
  {
    key: "exposure",
    title: "Exposure Settings",
    translationKey: "exif.raw.category.exposure",
  },
  {
    key: "lens",
    title: "Lens Information",
    translationKey: "exif.raw.category.lens",
  },
  {
    key: "datetime",
    title: "Date & Time",
    translationKey: "exif.raw.category.datetime",
  },
  {
    key: "gps",
    title: "GPS Information",
    translationKey: "exif.raw.category.gps",
  },
  {
    key: "focus",
    title: "Focus System",
    translationKey: "exif.raw.category.focus",
  },
  {
    key: "flash",
    title: "Flash & Lighting",
    translationKey: "exif.raw.category.flash",
  },
  {
    key: "imageProperties",
    title: "Image Properties",
    translationKey: "exif.raw.category.imageProperties",
  },
  {
    key: "whiteBalance",
    title: "White Balance",
    translationKey: "exif.raw.category.whiteBalance",
  },
  {
    key: "fuji",
    title: "Fuji Film Simulation",
    translationKey: "exif.raw.category.fuji",
  },
  {
    key: "technical",
    title: "Technical Parameters",
    translationKey: "exif.raw.category.technical",
  },
  {
    key: "video",
    title: "Video/HEIF Properties",
    translationKey: "exif.raw.category.video",
  },
  {
    key: "faceDetection",
    title: "Face Detection",
    translationKey: "exif.raw.category.faceDetection",
  },
  {
    key: "other",
    title: "Other Metadata",
    translationKey: "exif.raw.category.other",
  },
] as const;

interface RawExifViewerProps {
  currentPhoto: PhotoManifest;
}

type ParsedExifData = Record<string, string | number | boolean | null>;

const stringifyExifValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const serializeManifestExifData = (
  exifData: PhotoManifest["exif"],
): string | null => {
  if (!exifData) return null;

  const lines = Object.entries(exifData)
    .flatMap(([key, value]) => {
      const serialized = stringifyExifValue(value);
      return serialized ? [`${key}: ${serialized}`] : [];
    })
    .sort((a, b) => a.localeCompare(b));

  return lines.length > 0 ? lines.join("\n") : null;
};

const parseRawExifData = (rawData: string): ParsedExifData => {
  const lines = rawData.split("\n").filter((line) => line.trim());
  const data: ParsedExifData = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, Math.max(0, colonIndex)).trim();
    const value = line.slice(Math.max(0, colonIndex + 1)).trim();

    if (key && value) {
      data[key] = value;
    }
  }

  return data;
};

export const RawExifViewer: React.FC<RawExifViewerProps> = ({
  currentPhoto,
}) => {
  const { t } = useTranslation();
  const runtime = useAfilmoryRuntime();
  const [isOpen, setIsOpen] = useState(false);
  const [rawExifData, setRawExifData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const currentPhotoIdRef = useRef(currentPhoto.id);

  currentPhotoIdRef.current = currentPhoto.id;

  useEffect(() => {
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setIsOpen(false);
    setRawExifData(null);
    setIsLoading(false);
  }, [currentPhoto.id]);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
    };
  }, []);

  const handleOpenModal = async () => {
    if (rawExifData) {
      setIsOpen(true);
      return;
    }

    setIsLoading(true);
    activeRequestRef.current?.abort();
    const requestController = new AbortController();
    activeRequestRef.current = requestController;
    const requestPhotoId = currentPhoto.id;

    try {
      const sourcePath = new URL(
        currentPhoto.originalUrl,
        window.location.href,
      ).pathname.toLowerCase();
      const cachedImage = runtime.imageCache.get(currentPhoto.originalUrl);
      const cacheMayContainConvertedPixels =
        /\.(?:heic|heif|hif|tif|tiff)$/.test(sourcePath);
      let blob = cacheMayContainConvertedPixels ? undefined : cachedImage?.blob;

      if (!blob) {
        const response = await fetch(currentPhoto.originalUrl, {
          signal: requestController.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch original image: ${response.status}`);
        }
        blob = await response.blob();
      }

      const data = await ExifToolManager.parse(blob, currentPhoto.s3Key);
      if (
        requestController.signal.aborted ||
        currentPhotoIdRef.current !== requestPhotoId
      ) {
        return;
      }

      setRawExifData(data || null);
      setIsOpen(true);
    } catch (error) {
      if (
        requestController.signal.aborted ||
        currentPhotoIdRef.current !== requestPhotoId
      ) {
        return;
      }
      console.error("Failed to parse EXIF data:", error);
      const fallbackData = serializeManifestExifData(currentPhoto.exif);

      if (fallbackData) {
        setRawExifData(fallbackData);
        setIsOpen(true);
      } else {
        toast.error(
          t("exif.raw.parse.error", {
            defaultValue: "Failed to parse EXIF data",
          }),
        );
      }
    } finally {
      if (activeRequestRef.current === requestController) {
        activeRequestRef.current = null;
      }
      if (
        !requestController.signal.aborted &&
        currentPhotoIdRef.current === requestPhotoId
      ) {
        setIsLoading(false);
      }
    }
  };

  const parsedData = rawExifData ? parseRawExifData(rawExifData) : {};
  const dataEntries = Object.entries(parsedData);

  const getCategoryData = (categoryKeys: readonly string[]) => {
    return dataEntries.filter(([key]) =>
      categoryKeys.some((catKey) => key.includes(catKey)),
    );
  };

  const getUncategorizedData = () => {
    const allCategoryKeys = Object.values(exifCategories).flat();
    return dataEntries.filter(
      ([key]) => !allCategoryKeys.some((catKey) => key.includes(catKey)),
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setIsLoading(false);
    }
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={handleOpenModal}
          disabled={isLoading}
          aria-label={t("exif.raw.title", { defaultValue: "Raw EXIF Data" })}
          title={t("exif.raw.title", { defaultValue: "Raw EXIF Data" })}
          className="af-control flex size-11 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50 lg:size-9"
        >
          {isLoading ? (
            <i
              className="i-mingcute-loading-3-line size-5 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <i className="i-mingcute-braces-line size-5" aria-hidden="true" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent
        data-photo-viewer-nested-overlay=""
        className="text-text flex h-[80vh] max-w-4xl flex-col gap-2"
      >
        <div className="flex items-start justify-between gap-4">
          <DialogHeader className="min-w-0 text-start">
            <DialogTitle>
              {t("exif.raw.title", { defaultValue: "Raw EXIF Data" })}
            </DialogTitle>
            <DialogDescription>
              {t("exif.raw.description", {
                defaultValue:
                  "Complete EXIF metadata extracted from the image file",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <button
              type="button"
              className="af-control flex size-11 shrink-0 items-center justify-center rounded-full"
              aria-label={t("exif.raw.close", {
                defaultValue: "Close raw EXIF",
              })}
              title={t("exif.raw.close", { defaultValue: "Close raw EXIF" })}
            >
              <i className="i-mingcute-close-line size-5" aria-hidden="true" />
            </button>
          </DialogClose>
        </div>

        {isLoading && (
          <div
            role="status"
            aria-live="polite"
            className="text-text-secondary flex h-full grow flex-col items-center justify-center gap-4"
          >
            <i
              className="i-mingcute-loading-3-line animate-spin text-3xl"
              aria-hidden="true"
            />
            <span className="text-sm">
              {t("exif.raw.loading", {
                defaultValue: "Loading EXIF data…",
              })}
            </span>
          </div>
        )}

        <ScrollArea
          rootClassName="h-0 grow flex-1 -mb-6 -mx-6"
          viewportClassName="px-7 pb-6 pt-4 [&_*]:select-text"
          flex
        >
          <div className="min-w-0 space-y-6">
            {CATEGORY_CONFIG.map(({ key, title, translationKey }) => (
              <ExifFieldGroup
                key={key}
                title={title}
                translationKey={translationKey}
                fields={getCategoryData(
                  exifCategories[key as keyof typeof exifCategories],
                )}
              />
            ))}

            {/* Uncategorized Data */}
            <ExifFieldGroup
              title="Uncategorized"
              translationKey="exif.raw.category.uncategorized"
              fields={getUncategorizedData()}
            />

            {!isLoading && dataEntries.length === 0 && (
              <div className="text-text-secondary py-8 text-center text-sm">
                {t("exif.raw.no.data", {
                  defaultValue: "No EXIF data available",
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
