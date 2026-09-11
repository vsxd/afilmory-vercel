import * as maplibre from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre v6 ships a separate ESM worker. Bundle its shared imports too;
// plain ?url would leave a missing maplibre-gl-shared.mjs in production.
maplibre.setWorkerUrl(workerUrl);

export * as maplibre from "maplibre-gl";
