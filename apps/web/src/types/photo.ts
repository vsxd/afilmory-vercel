import type { PhotoManifestItem, PickedExif } from "@afilmory/schema";

import type { DeepReadonly } from "./readonly";

export type PhotoManifest = DeepReadonly<PhotoManifestItem>;
export type PhotoExif = DeepReadonly<PickedExif>;
