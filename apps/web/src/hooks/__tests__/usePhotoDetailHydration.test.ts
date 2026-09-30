import { createManifest } from "@afilmory/schema";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PhotoRepository } from "~/data-runtime/photo-repository";

import { usePhotoDetailHydration } from "../usePhotoDetailHydration";

const createPhoto = (id: string) => ({
  id,
  title: id,
  description: "",
  dateTaken: "2026-09-30T00:00:00.000Z",
  tags: [],
  originalUrl: `/originals/${id}.jpg`,
  thumbnailUrl: `/thumbnails/${id}.jpg`,
  thumbHash: null,
  width: 100,
  height: 100,
  aspectRatio: 1,
  s3Key: `${id}.jpg`,
  lastModified: "2026-09-30T00:00:00.000Z",
  size: 1,
  exif: { Make: "Summary" },
  toneAnalysis: null,
  location: null,
});

const detailResponse = (...ids: string[]) =>
  Response.json({
    schema: "afilmory-web-delivery",
    version: 3,
    kind: "photo-details",
    photos: Object.fromEntries(
      ids.map((id) => [
        id,
        { exif: { Make: "Complete" }, toneAnalysis: null, location: null },
      ]),
    ),
  });

const repositories: PhotoRepository[] = [];
function createRepository(fetcher: typeof fetch, sharedShard = false) {
  const repository = new PhotoRepository(
    createManifest({ photos: [createPhoto("a"), createPhoto("b")] }),
    {
      fetcher,
      delivery: {
        detailShards: sharedShard
          ? [{ url: "/assets/ab.json", photoIds: ["a", "b"] }]
          : ["a", "b"].map((id) => ({
              url: `/assets/${id}.json`,
              photoIds: [id],
            })),
      },
    },
  );
  repositories.push(repository);
  return repository;
}

describe("photo detail hydration", () => {
  afterEach(() => {
    cleanup();
    for (const repository of repositories.splice(0)) repository.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("preserves the summary after a failure and publishes complete data after an explicit retry", async () => {
    const pending = Promise.withResolvers<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(detailResponse("a"));
    const repository = createRepository(fetcher);
    const { result } = renderHook(() =>
      usePhotoDetailHydration(repository, "a"),
    );

    expect(result.current.status).toBe("pending");
    await act(async () => pending.resolve(new Response(null, { status: 503 })));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.reloadRequired).toBe(false);
    expect(repository.getPhoto("a")?.exif?.Make).toBe("Summary");
    expect(repository.getVersion()).toBe(0);

    act(() => result.current.retry());
    expect(result.current.status).toBe("pending");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(repository.getPhoto("a")?.exif?.Make).toBe("Complete");
  });

  it.each([404, 410])(
    "offers a manual reload for HTTP %s without looping requests",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      const repository = createRepository(fetcher);
      const { result, rerender } = renderHook(() =>
        usePhotoDetailHydration(repository, "a"),
      );
      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.reloadRequired).toBe(true);
      rerender();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("does not let a previous photo's late failure replace the current photo state", async () => {
    const a = Promise.withResolvers<Response>();
    const b = Promise.withResolvers<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((url) =>
        url === "/assets/a.json" ? a.promise : b.promise,
      );
    const repository = createRepository(fetcher);
    const { result, rerender } = renderHook(
      ({ id }) => usePhotoDetailHydration(repository, id),
      { initialProps: { id: "a" } },
    );
    rerender({ id: "b" });
    await act(async () => b.resolve(detailResponse("b")));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => a.resolve(new Response(null, { status: 404 })));
    expect(result.current.status).toBe("ready");
    expect(result.current.reloadRequired).toBe(false);
  });

  it("ignores unrelated snapshot publications while a foreground request is pending", async () => {
    const a = Promise.withResolvers<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        url === "/assets/a.json" ? a.promise : detailResponse("b"),
      );
    const repository = createRepository(fetcher);
    const ensureDetails = vi.spyOn(repository, "ensurePhotoDetails");
    const { result } = renderHook(() => {
      // The real route also renders on every repository publication.
      useSyncExternalStore(repository.subscribe, repository.getPhotos);
      return usePhotoDetailHydration(repository, "a");
    });
    await act(async () => repository.ensurePhotoDetails("b"));
    expect(result.current.status).toBe("pending");
    expect(ensureDetails.mock.calls.filter(([id]) => id === "a")).toHaveLength(
      1,
    );
    await act(async () => a.resolve(detailResponse("a")));
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("shares a pending shard when navigation changes between two photos in it", async () => {
    const pending = Promise.withResolvers<Response>();
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(pending.promise);
    const repository = createRepository(fetcher, true);
    const { result, rerender } = renderHook(
      ({ id }) => usePhotoDetailHydration(repository, id),
      { initialProps: { id: "a" } },
    );
    rerender({ id: "b" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(detailResponse("a", "b")));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(repository.getPhoto("a")?.exif?.Make).toBe("Complete");
    expect(repository.getPhoto("b")?.exif?.Make).toBe("Complete");
  });

  it("prefetches neighbours only after foreground success, without restarting on rerenders", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const pending = Promise.withResolvers<Response>();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(detailResponse("a"));
    const repository = createRepository(fetcher);
    const prefetch = vi
      .spyOn(repository, "prefetchPhotoDetails")
      .mockResolvedValue();
    const { result, rerender } = renderHook(() =>
      usePhotoDetailHydration(repository, "a", undefined, "b"),
    );
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(prefetch).not.toHaveBeenCalled();
    await act(async () => pending.resolve(new Response(null, { status: 503 })));
    expect(result.current.status).toBe("error");
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(prefetch).not.toHaveBeenCalled();
    await act(async () => result.current.retry());
    expect(result.current.status).toBe("ready");
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(prefetch).toHaveBeenCalledExactlyOnceWith(["b"]);
    rerender();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it("does not hydrate missing photos or already complete inline manifests", () => {
    const repository = new PhotoRepository(
      createManifest({ photos: [createPhoto("a")] }),
    );
    repositories.push(repository);
    const ensureDetails = vi.spyOn(repository, "ensurePhotoDetails");
    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) =>
        usePhotoDetailHydration(repository, id),
      { initialProps: { id: undefined as string | undefined } },
    );
    expect(result.current.status).toBe("ready");
    rerender({ id: "a" });
    expect(result.current.status).toBe("ready");
    expect(ensureDetails).not.toHaveBeenCalled();
  });
});
