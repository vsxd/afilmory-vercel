export const AFILMORY_MANIFEST_SCHEMA = "afilmory.manifest" as const;
export const CURRENT_MANIFEST_VERSION = 2 as const;

export type ManifestSchema = typeof AFILMORY_MANIFEST_SCHEMA;
export type ManifestVersion = typeof CURRENT_MANIFEST_VERSION;
