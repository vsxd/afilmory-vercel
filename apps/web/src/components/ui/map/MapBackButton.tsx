import { GlassButton } from "@afilmory/ui";
import { startTransition } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";

export const MapBackButton = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const handleBack = () => {
    startTransition(() => {
      const fallbackSearchParams = new URLSearchParams(location.search);
      fallbackSearchParams.delete("photoId");
      fallbackSearchParams.delete("returnTo");

      navigate(
        {
          pathname: "/",
          search: fallbackSearchParams.toString()
            ? `?${fallbackSearchParams.toString()}`
            : "",
        },
        { replace: true },
      );
    });
  };

  return (
    <GlassButton
      className="absolute top-[calc(env(safe-area-inset-top)+1rem)] left-[calc(env(safe-area-inset-left)+1rem)] z-50 size-12"
      onClick={handleBack}
      aria-label={t("explore.back.to.gallery")}
      title={t("explore.back.to.gallery")}
    >
      <i className="i-mingcute-arrow-left-line text-base text-white" />
    </GlassButton>
  );
};
