import { useTranslation } from "react-i18next";

export const MapLoadingState = () => {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="flex h-full w-full items-center justify-center p-6"
    >
      <div className="max-w-sm space-y-2 text-center">
        <i
          className="i-mingcute-map-line text-text-secondary mx-auto mb-4 block size-8"
          aria-hidden="true"
        />
        <p className="text-text text-base font-medium">
          {t("explore.loading.map")}
        </p>
        <p className="text-text-secondary text-sm leading-relaxed">
          {t("explore.parsing.location")}
        </p>
      </div>
    </div>
  );
};
