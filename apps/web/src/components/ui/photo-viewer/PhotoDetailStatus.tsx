import { Button } from "@afilmory/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { PhotoDetailHydration } from "~/hooks/usePhotoDetailHydration";
import { recoverStaleRuntime } from "~/lib/stale-runtime-recovery";

export function PhotoDetailStatus({
  details,
}: {
  details: PhotoDetailHydration;
}) {
  const { t } = useTranslation();
  const [isReloading, setIsReloading] = useState(false);
  if (details.status === "ready") return null;

  const reload = async () => {
    setIsReloading(true);
    try {
      await recoverStaleRuntime({ force: true });
    } finally {
      setIsReloading(false);
    }
  };
  const pending = details.status === "pending" || isReloading;

  return (
    <div
      className="af-panel rounded-xl p-3 text-sm"
      role={pending ? "status" : "alert"}
      aria-live="polite"
    >
      <p className="text-ui-secondary">
        {pending
          ? t("photo.details.loading")
          : details.reloadRequired
            ? t("photo.details.unavailable")
            : t("photo.details.error")}
      </p>
      {details.status === "error" && (
        <Button
          className="mt-2 min-h-11"
          variant="surface"
          disabled={isReloading}
          onClick={() => {
            if (details.reloadRequired) void reload();
            else details.retry();
          }}
        >
          {details.reloadRequired ? t("error.reload") : t("photo.error.retry")}
        </Button>
      )}
    </div>
  );
}
