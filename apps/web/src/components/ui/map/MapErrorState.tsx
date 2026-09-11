import { Button } from "@afilmory/ui";
import { useTranslation } from "react-i18next";

export const MapErrorState = ({ onRetry }: { onRetry?: () => void }) => {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex h-full w-full items-center justify-center p-6"
    >
      <div className="max-w-sm space-y-2 text-center">
        <i
          className="i-mingcute-warning-line text-text-secondary mx-auto mb-4 block size-8"
          aria-hidden="true"
        />
        <p className="text-text text-base font-medium">
          {t("explore.map.error.title")}
        </p>
        <p className="text-text-secondary text-sm leading-relaxed">
          {t("explore.map.error.description")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            className="rounded-xl"
            onClick={() => {
              if (onRetry) onRetry();
              else window.location.reload();
            }}
          >
            {t("error.reload")}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="rounded-xl"
            onClick={() => window.history.back()}
          >
            {t("error.go.back")}
          </Button>
        </div>
      </div>
    </div>
  );
};
