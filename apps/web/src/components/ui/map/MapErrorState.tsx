import { Button } from "@afilmory/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { recoverStaleRuntime } from "~/lib/stale-runtime-recovery";

export const MapErrorState = () => {
  const { t } = useTranslation();
  const [isReloading, setIsReloading] = useState(false);
  const reload = async () => {
    setIsReloading(true);
    try {
      // A fresh runtime also resets failed map resources and stale module URLs.
      await recoverStaleRuntime({ force: true });
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex h-full w-full items-center justify-center p-6"
    >
      <div className="max-w-sm space-y-2 text-center">
        <i
          className="i-mingcute-warning-line text-ui-secondary mx-auto mb-4 block size-8"
          aria-hidden="true"
        />
        <p className="text-ui text-base font-medium">
          {t("explore.map.error.title")}
        </p>
        <p className="text-ui-secondary text-sm leading-relaxed">
          {t("explore.map.error.description")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            className="rounded-xl"
            disabled={isReloading}
            onClick={() => void reload()}
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
