import type { PhotoManifestItem } from "@afilmory/schema";
import { MotionButtonBase } from "@afilmory/ui";
import { isNil } from "es-toolkit/compat";
import type { ReactNode } from "react";
import { Fragment, lazy, Suspense } from "react";

import {
  CarbonIsoOutline,
  MaterialSymbolsExposure,
  MaterialSymbolsShutterSpeed,
  StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens,
  TablerAperture,
} from "~/icons";

import type { ExifPanelViewModel } from "./exif-panel-view-model";
import { ExifRow as Row } from "./ExifRow";
import { HistogramChart } from "./HistogramChart";

const MiniMap = lazy(() =>
  import("./MiniMap").then((m) => ({ default: m.MiniMap })),
);

type ExifPanelTranslation = (key: string) => string;

export function BasicExifSection({
  currentPhoto,
  onTagClick,
  t,
  viewModel,
}: {
  currentPhoto: PhotoManifestItem;
  onTagClick?: (tag: string) => void;
  t: ExifPanelTranslation;
  viewModel: ExifPanelViewModel;
}) {
  const { formattedExifData, imageFormat, megaPixels } = viewModel;

  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-white/80">
        {t("exif.basic.info")}
      </h4>
      <div className="space-y-1 text-sm">
        <Row
          label={t("exif.filename")}
          value={currentPhoto.title}
          ellipsis={true}
        />
        <Row label={t("exif.format")} value={imageFormat} />
        <Row
          label={t("exif.dimensions")}
          value={`${currentPhoto.width} × ${currentPhoto.height}`}
        />
        <Row
          label={t("exif.file.size")}
          value={`${(currentPhoto.size / 1024 / 1024).toFixed(1)}MB`}
        />
        {megaPixels && (
          <Row label={t("exif.pixels")} value={`${megaPixels} MP`} />
        )}
        {formattedExifData?.colorSpace && (
          <Row
            label={t("exif.color.space")}
            value={formattedExifData.colorSpace}
          />
        )}
        {formattedExifData?.dateTime && (
          <Row
            label={t("exif.capture.time")}
            value={formattedExifData.dateTime}
          />
        )}
        {formattedExifData?.zone && (
          <Row label={t("exif.time.zone")} value={formattedExifData.zone} />
        )}
        {formattedExifData?.artist && (
          <Row label={t("exif.artist")} value={formattedExifData.artist} />
        )}
        {formattedExifData?.copyright && (
          <Row
            label={t("exif.copyright")}
            value={formattedExifData.copyright}
          />
        )}
        {formattedExifData?.software && (
          <Row label={t("exif.software")} value={formattedExifData.software} />
        )}
      </div>

      <CaptureParameterBadges t={t} viewModel={viewModel} />
      <TagSection currentPhoto={currentPhoto} onTagClick={onTagClick} t={t} />
    </div>
  );
}

function CaptureParameterBadges({
  t,
  viewModel,
}: {
  t: ExifPanelTranslation;
  viewModel: ExifPanelViewModel;
}) {
  const { formattedExifData } = viewModel;
  if (
    !formattedExifData ||
    (!formattedExifData.shutterSpeed &&
      !formattedExifData.iso &&
      !formattedExifData.aperture &&
      !formattedExifData.exposureBias &&
      !formattedExifData.focalLength35mm)
  ) {
    return null;
  }

  return (
    <div>
      <h4 className="my-2 text-sm font-medium text-white/80">
        {t("exif.capture.parameters")}
      </h4>
      <div className="grid grid-cols-2 gap-2">
        {formattedExifData.focalLength35mm && (
          <ExifBadge
            icon={
              <StreamlineImageAccessoriesLensesPhotosCameraShutterPicturePhotographyPicturesPhotoLens className="text-sm text-white/70" />
            }
            value={`${formattedExifData.focalLength35mm}mm`}
          />
        )}
        {formattedExifData.aperture && (
          <ExifBadge
            icon={<TablerAperture className="text-sm text-white/70" />}
            value={formattedExifData.aperture}
          />
        )}
        {formattedExifData.shutterSpeed && (
          <ExifBadge
            icon={
              <MaterialSymbolsShutterSpeed className="text-sm text-white/70" />
            }
            value={formattedExifData.shutterSpeed}
          />
        )}
        {formattedExifData.iso && (
          <ExifBadge
            icon={<CarbonIsoOutline className="text-sm text-white/70" />}
            value={`ISO ${formattedExifData.iso}`}
          />
        )}
        {formattedExifData.exposureBias && (
          <ExifBadge
            icon={<MaterialSymbolsExposure className="text-sm text-white/70" />}
            value={formattedExifData.exposureBias}
          />
        )}
      </div>
    </div>
  );
}

function ExifBadge({
  icon,
  value,
}: {
  icon: ReactNode;
  value: string | number;
}) {
  return (
    <div className="border-accent/20 bg-accent/10 flex h-6 items-center gap-2 rounded-md border px-2">
      {icon}
      <span className="text-xs">{value}</span>
    </div>
  );
}

function TagSection({
  currentPhoto,
  onTagClick,
  t,
}: {
  currentPhoto: PhotoManifestItem;
  onTagClick?: (tag: string) => void;
  t: ExifPanelTranslation;
}) {
  if (!currentPhoto.tags || currentPhoto.tags.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 mb-3">
      <h4 className="mb-2 text-sm font-medium text-white/80">
        {t("exif.tags")}
      </h4>
      <div className="-ml-1 flex flex-wrap gap-1.5">
        {currentPhoto.tags.map((tag) => (
          <MotionButtonBase
            type="button"
            onClick={() => onTagClick?.(tag)}
            key={tag}
            className="glassmorphic-btn border-accent/20 bg-accent/10 focus-visible:ring-accent/45 inline-flex cursor-pointer items-center rounded-full border px-2 py-1 text-xs text-white/90 backdrop-blur-sm focus-visible:ring-2"
          >
            {tag}
          </MotionButtonBase>
        ))}
      </div>
    </div>
  );
}

export function ToneExifSection({
  currentPhoto,
  t,
}: {
  currentPhoto: PhotoManifestItem;
  t: ExifPanelTranslation;
}) {
  if (!currentPhoto.toneAnalysis) return null;

  const toneTypeMap = {
    "low-key": t("exif.tone.low-key"),
    "high-key": t("exif.tone.high-key"),
    normal: t("exif.tone.normal"),
    "high-contrast": t("exif.tone.high-contrast"),
  } satisfies Record<string, string>;

  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-white/80">
        {t("exif.tone.analysis.title")}
      </h4>
      <div>
        <Row
          label={t("exif.tone.type")}
          value={
            toneTypeMap[currentPhoto.toneAnalysis.toneType] ||
            currentPhoto.toneAnalysis.toneType
          }
        />
        <div className="mt-1 mb-3 grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
          <Row
            label={t("exif.brightness.title")}
            value={`${currentPhoto.toneAnalysis.brightness}%`}
          />
          <Row
            label={t("exif.contrast.title")}
            value={`${currentPhoto.toneAnalysis.contrast}%`}
          />
          <Row
            label={t("exif.shadow.ratio")}
            value={`${Math.round(currentPhoto.toneAnalysis.shadowRatio * 100)}%`}
          />
          <Row
            label={t("exif.highlight.ratio")}
            value={`${Math.round(currentPhoto.toneAnalysis.highlightRatio * 100)}%`}
          />
        </div>
        <div className="mb-3">
          <div className="mb-2 text-xs font-medium text-white/70">
            {t("exif.histogram")}
          </div>
          <HistogramChart thumbnailUrl={currentPhoto.thumbnailUrl} />
        </div>
      </div>
    </div>
  );
}

export function FormattedExifSections({
  currentPhoto,
  t,
  viewModel,
}: {
  currentPhoto: PhotoManifestItem;
  t: ExifPanelTranslation;
  viewModel: ExifPanelViewModel;
}) {
  if (!viewModel.formattedExifData) return null;

  return (
    <Fragment>
      <CameraExifSection t={t} viewModel={viewModel} />
      <CaptureModeExifSection t={t} viewModel={viewModel} />
      <FujiRecipeExifSection t={t} viewModel={viewModel} />
      <LocationExifSection
        currentPhoto={currentPhoto}
        t={t}
        viewModel={viewModel}
      />
      <TechnicalExifSection t={t} viewModel={viewModel} />
    </Fragment>
  );
}

function CameraExifSection({
  t,
  viewModel,
}: {
  t: ExifPanelTranslation;
  viewModel: ExifPanelViewModel;
}) {
  const { formattedExifData } = viewModel;
  if (!formattedExifData?.camera && !formattedExifData?.lens) return null;

  return (
    <div>
      <h4 className="my-2 text-sm font-medium text-white/80">
        {t("exif.device.info")}
      </h4>
      <div className="space-y-1 text-sm">
        {formattedExifData.camera && (
          <Row label={t("exif.camera")} value={formattedExifData.camera} />
        )}
        {formattedExifData.lens && (
          <Row label={t("exif.lens")} value={formattedExifData.lens} />
        )}
        {formattedExifData.lensMake &&
          !formattedExifData.lens?.includes(formattedExifData.lensMake) && (
            <Row
              label={t("exif.lensmake")}
              value={formattedExifData.lensMake}
            />
          )}
        {formattedExifData.focalLength && (
          <Row
            label={t("exif.focal.length.actual")}
            value={`${formattedExifData.focalLength}mm`}
          />
        )}
        {formattedExifData.focalLength35mm && (
          <Row
            label={t("exif.focal.length.equivalent")}
            value={`${formattedExifData.focalLength35mm}mm`}
          />
        )}
        {formattedExifData.maxAperture && (
          <Row
            label={t("exif.max.aperture")}
            value={`f/${formattedExifData.maxAperture}`}
          />
        )}
      </div>
    </div>
  );
}

function CaptureModeExifSection({
  t,
  viewModel,
}: {
  t: ExifPanelTranslation;
  viewModel: ExifPanelViewModel;
}) {
  const { formattedExifData } = viewModel;
  if (
    !formattedExifData ||
    (!formattedExifData.exposureMode &&
      !formattedExifData.exposureProgram &&
      !formattedExifData.meteringMode &&
      !formattedExifData.whiteBalance &&
      !formattedExifData.lightSource &&
      !formattedExifData.flash)
  ) {
    return null;
  }

  return (
    <div>
      <h4 className="my-2 text-sm font-medium text-white/80">
        {t("exif.capture.mode")}
      </h4>
      <div className="space-y-1 text-sm">
        {!isNil(formattedExifData.exposureProgram) && (
          <Row
            label={t("exif.exposureprogram.title")}
            value={formattedExifData.exposureProgram}
          />
        )}
        {!isNil(formattedExifData.exposureMode) && (
          <Row
            label={t("exif.exposure.mode.title")}
            value={formattedExifData.exposureMode}
          />
        )}
        {!isNil(formattedExifData.meteringMode) && (
          <Row
            label={t("exif.metering.mode.type")}
            value={formattedExifData.meteringMode}
          />
        )}
        {!isNil(formattedExifData.whiteBalance) && (
          <Row
            label={t("exif.white.balance.title")}
            value={formattedExifData.whiteBalance}
          />
        )}
        {!isNil(formattedExifData.whiteBalanceBias) && (
          <Row
            label={t("exif.white.balance.bias")}
            value={`${formattedExifData.whiteBalanceBias} Mired`}
          />
        )}
        {!isNil(formattedExifData.wbShiftAB) && (
          <Row
            label={t("exif.white.balance.shift.ab")}
            value={formattedExifData.wbShiftAB}
          />
        )}
        {!isNil(formattedExifData.wbShiftGM) && (
          <Row
            label={t("exif.white.balance.shift.gm")}
            value={formattedExifData.wbShiftGM}
          />
        )}
        {!isNil(formattedExifData.flash) && (
          <Row label={t("exif.flash.title")} value={formattedExifData.flash} />
        )}
        {!isNil(formattedExifData.lightSource) && (
          <Row
            label={t("exif.light.source.type")}
            value={formattedExifData.lightSource}
          />
        )}
        {!isNil(formattedExifData.sceneCaptureType) && (
          <Row
            label={t("exif.scene.capture.type")}
            value={formattedExifData.sceneCaptureType}
          />
        )}
        {!isNil(formattedExifData.flashMeteringMode) && (
          <Row
            label={t("exif.flash.metering.mode")}
            value={formattedExifData.flashMeteringMode}
          />
        )}
      </div>
    </div>
  );
}

function FujiRecipeExifSection({
  t,
  viewModel,
}: {
  t: ExifPanelTranslation;
  viewModel: ExifPanelViewModel;
}) {
  const recipe = viewModel.formattedExifData?.fujiRecipe;
  if (!recipe) return null;

  return (
    <div>
      <h4 className="my-2 text-sm font-medium text-white/80">
        {t("exif.fuji.film.simulation")}
      </h4>
      <div className="space-y-1 text-sm">
        {recipe.FilmMode && (
          <Row label={t("exif.film.mode")} value={recipe.FilmMode} />
        )}
        {!isNil(recipe.DynamicRange) && (
          <Row label={t("exif.dynamic.range")} value={recipe.DynamicRange} />
        )}
        {!isNil(recipe.WhiteBalance) && (
          <Row
            label={t("exif.white.balance.title")}
            value={recipe.WhiteBalance}
          />
        )}
        {!isNil(recipe.HighlightTone) && (
          <Row label={t("exif.highlight.tone")} value={recipe.HighlightTone} />
        )}
        {!isNil(recipe.ShadowTone) && (
          <Row label={t("exif.shadow.tone")} value={recipe.ShadowTone} />
        )}
        {!isNil(recipe.Saturation) && (
          <Row label={t("exif.saturation")} value={recipe.Saturation} />
        )}
        {!isNil(recipe.Sharpness) && (
          <Row label={t("exif.sharpness")} value={recipe.Sharpness} />
        )}
        {!isNil(recipe.NoiseReduction) && (
          <Row
            label={t("exif.noise.reduction")}
            value={recipe.NoiseReduction}
          />
        )}
        {!isNil(recipe.Clarity) && (
          <Row label={t("exif.clarity")} value={recipe.Clarity} />
        )}
        {!isNil(recipe.ColorChromeEffect) && (
          <Row
            label={t("exif.color.effect")}
            value={recipe.ColorChromeEffect}
          />
        )}
        {!isNil(recipe.ColorChromeFxBlue) && (
          <Row
            label={t("exif.blue.color.effect")}
            value={recipe.ColorChromeFxBlue}
          />
        )}
        {!isNil(recipe.WhiteBalanceFineTune) && (
          <Row
            label={t("exif.white.balance.fine.tune")}
            value={recipe.WhiteBalanceFineTune}
          />
        )}
        {(!isNil(recipe.GrainEffectRoughness) ||
          !isNil(recipe.GrainEffectSize)) && (
          <Fragment>
            {recipe.GrainEffectRoughness && (
              <Row
                label={t("exif.grain.effect.intensity")}
                value={recipe.GrainEffectRoughness}
              />
            )}
            {!isNil(recipe.GrainEffectSize) && (
              <Row
                label={t("exif.grain.effect.size")}
                value={recipe.GrainEffectSize}
              />
            )}
          </Fragment>
        )}
      </div>
    </div>
  );
}

function LocationExifSection({
  currentPhoto,
  t,
  viewModel,
}: {
  currentPhoto: PhotoManifestItem;
  t: ExifPanelTranslation;
  viewModel: ExifPanelViewModel;
}) {
  const { decimalLatitude, decimalLongitude, formattedExifData } = viewModel;
  if (!formattedExifData?.gps) return null;

  return (
    <div>
      <h4 className="my-2 text-sm font-medium text-white/80">
        {t("exif.gps.location.info")}
      </h4>
      <div className="space-y-1 text-sm">
        <Row
          label={t("exif.gps.latitude")}
          value={formattedExifData.gps.latitude}
        />
        <Row
          label={t("exif.gps.longitude")}
          value={formattedExifData.gps.longitude}
        />
        {formattedExifData.gps.altitude && (
          <Row
            label={t("exif.gps.altitude")}
            value={`${formattedExifData.gps.altitude}m`}
          />
        )}
        {currentPhoto.location && (
          <div className="mt-3 space-y-1">
            {(currentPhoto.location.city || currentPhoto.location.country) && (
              <Row
                label={t("exif.gps.city")}
                value={[
                  currentPhoto.location.city,
                  currentPhoto.location.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              />
            )}
            {currentPhoto.location.locationName && (
              <Row
                label={t("exif.gps.address")}
                value={currentPhoto.location.locationName}
                ellipsis={true}
              />
            )}
          </div>
        )}
        {decimalLatitude !== null && decimalLongitude !== null && (
          <Suspense
            fallback={
              <div className="mt-3 h-40 w-full rounded-lg border border-white/10 bg-white/5" />
            }
          >
            <div className="mt-3">
              <MiniMap
                latitude={decimalLatitude}
                longitude={decimalLongitude}
                photoId={currentPhoto.id}
              />
            </div>
          </Suspense>
        )}
      </div>
    </div>
  );
}

function TechnicalExifSection({
  t,
  viewModel,
}: {
  t: ExifPanelTranslation;
  viewModel: ExifPanelViewModel;
}) {
  const { formattedExifData } = viewModel;
  if (
    !formattedExifData ||
    (!formattedExifData.brightnessValue &&
      !formattedExifData.shutterSpeedValue &&
      !formattedExifData.apertureValue &&
      !formattedExifData.sensingMethod &&
      !formattedExifData.focalPlaneXResolution &&
      !formattedExifData.focalPlaneYResolution)
  ) {
    return null;
  }

  return (
    <div>
      <h4 className="my-2 text-sm font-medium text-white/80">
        {t("exif.technical.parameters")}
      </h4>
      <div className="space-y-1 text-sm">
        {formattedExifData.brightnessValue && (
          <Row
            label={t("exif.brightness.value")}
            value={formattedExifData.brightnessValue}
          />
        )}
        {formattedExifData.shutterSpeedValue && (
          <Row
            label={t("exif.shutter.speed.value")}
            value={formattedExifData.shutterSpeedValue}
          />
        )}
        {formattedExifData.apertureValue && (
          <Row
            label={t("exif.aperture.value")}
            value={formattedExifData.apertureValue}
          />
        )}
        {formattedExifData.sensingMethod && (
          <Row
            label={t("exif.sensing.method.type")}
            value={formattedExifData.sensingMethod}
          />
        )}
        {(formattedExifData.focalPlaneXResolution ||
          formattedExifData.focalPlaneYResolution) && (
          <Row
            label={t("exif.focal.plane.resolution")}
            value={`${formattedExifData.focalPlaneXResolution || t("exif.not.available")} × ${formattedExifData.focalPlaneYResolution || t("exif.not.available")}`}
          />
        )}
      </div>
    </div>
  );
}
