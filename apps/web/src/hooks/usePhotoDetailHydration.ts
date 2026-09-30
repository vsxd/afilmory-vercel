import { useCallback, useEffect, useState } from "react";

import type { PhotoRepository } from "~/data-runtime/photo-repository";
import { ManifestShardRequestError } from "~/data-runtime/photo-repository";

export interface PhotoDetailHydration {
  status: "pending" | "ready" | "error";
  reloadRequired: boolean;
  retry: () => void;
}

interface HydrationAttempt {
  repository: PhotoRepository;
  photoId: string;
  attempt: number;
  status: PhotoDetailHydration["status"];
  reloadRequired: boolean;
}

/** UI state belongs to this route; shared data and request ownership stay in the repository. */
export function usePhotoDetailHydration(
  repository: PhotoRepository,
  photoId: string | undefined,
  previousPhotoId?: string,
  nextPhotoId?: string,
): PhotoDetailHydration {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<HydrationAttempt | null>(null);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!photoId || !repository.hasDeferredPhotoDetails(photoId)) return;
    let cancelled = false;
    const identity = { repository, photoId, attempt };
    setResult({ ...identity, status: "pending", reloadRequired: false });

    void repository.ensurePhotoDetails(photoId).then(
      () => {
        if (!cancelled) {
          setResult({ ...identity, status: "ready", reloadRequired: false });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setResult({
            ...identity,
            status: "error",
            reloadRequired:
              error instanceof ManifestShardRequestError &&
              (error.status === 404 || error.status === 410),
          });
        }
      },
    );

    return () => {
      // A shard can have other consumers. Do not cancel its shared request;
      // only prevent a late result for a previous route from replacing this UI.
      cancelled = true;
    };
  }, [attempt, photoId, repository]);

  const currentResult =
    result?.repository === repository &&
    result.photoId === photoId &&
    result.attempt === attempt
      ? result
      : null;
  const status =
    !photoId || !repository.hasDeferredPhotoDetails(photoId)
      ? "ready"
      : (currentResult?.status ?? "pending");

  useEffect(() => {
    if (!photoId || status !== "ready") return;
    const neighborIds = [previousPhotoId, nextPhotoId].flatMap((id) =>
      id ? [id] : [],
    );
    if (neighborIds.length === 0) return;
    const prefetch = () => {
      void repository.prefetchPhotoDetails(neighborIds).catch(() => {
        // Prefetch is optional. Opening that photo starts a foreground attempt.
      });
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(prefetch, { timeout: 1_500 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 200);
    return () => clearTimeout(id);
  }, [nextPhotoId, photoId, previousPhotoId, repository, status]);

  return {
    status,
    reloadRequired:
      status === "error" && currentResult?.reloadRequired === true,
    retry,
  };
}
