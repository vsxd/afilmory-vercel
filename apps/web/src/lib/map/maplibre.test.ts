import { expect, it, vi } from "vitest";

const setWorkerUrl = vi.hoisted(() => vi.fn());
vi.mock("maplibre-gl", () => ({ setWorkerUrl }));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "/assets/maplibre-worker.js",
}));

it("configures the bundled worker before exposing MapLibre to map components", async () => {
  const { maplibre } = await import("./maplibre");
  expect(maplibre.setWorkerUrl).toBe(setWorkerUrl);
  expect(setWorkerUrl).toHaveBeenCalledExactlyOnceWith(
    "/assets/maplibre-worker.js",
  );
});
