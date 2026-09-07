import { GlassButton } from "@afilmory/ui";
import { useTranslation } from "react-i18next";

import { useAppNavigation } from "~/navigation/hooks";

export const MapBackButton = () => {
  const { t } = useTranslation();
  const navigation = useAppNavigation();
  const handleBack = () => navigation.showGallery(undefined, true);

  return (
    <GlassButton
      className="absolute top-[calc(env(safe-area-inset-top)+1rem)] left-[calc(env(safe-area-inset-left)+1rem)] z-50 size-12"
      onClick={handleBack}
      aria-label={t("explore.back.to.gallery")}
      title={t("explore.back.to.gallery")}
    >
      <i
        className="i-mingcute-arrow-left-line text-base text-white"
        aria-hidden="true"
      />
    </GlassButton>
  );
};
