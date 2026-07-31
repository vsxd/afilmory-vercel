import type { AfilmoryManifest } from "@afilmory/schema";
import type { SiteConfig } from "@config";

import type { WebDeliveryRuntimeDescriptor } from "../data-runtime/delivery-manifest";

export type StartupMetricDetail = Record<string, unknown>;

export type StartupReporter = {
  marks: Array<{
    name: string;
    time: number;
    detail?: StartupMetricDetail;
  }>;
  mark: (name: string, detail?: StartupMetricDetail) => void;
  flush: (reason?: string) => unknown;
  snapshot: (reason?: string) => unknown;
  markedNames?: string[];
};

export type AfilmoryManifestRuntime =
  | {
      mode: "inline";
      data: unknown;
      promise?: Promise<unknown>;
      delivery?: WebDeliveryRuntimeDescriptor;
    }
  | {
      mode: "external";
      url: string;
      data?: unknown;
      promise?: Promise<unknown>;
      delivery?: WebDeliveryRuntimeDescriptor;
    };

export type AfilmoryBuildInfo = {
  appName?: string;
  version?: string;
  builtDate?: string;
  gitCommitHash?: string;
  sourceUrl?: string;
  sourceDirty?: boolean;
  sourceExact?: boolean;
  licenseUrl?: string;
  devCwd?: string;
};

export type AfilmoryBrowserRuntime = {
  version: 1;
  build?: AfilmoryBuildInfo;
  config?: {
    site?: Partial<SiteConfig>;
  };
  manifest?: AfilmoryManifestRuntime;
  startup?: StartupReporter;
};

type AfilmoryGlobal = typeof globalThis & {
  __AFILMORY__?: AfilmoryBrowserRuntime;
};

export function getExistingBrowserRuntime():
  AfilmoryBrowserRuntime | undefined {
  return (globalThis as AfilmoryGlobal).__AFILMORY__;
}

export function ensureBrowserRuntime(): AfilmoryBrowserRuntime {
  const globalObject = globalThis as AfilmoryGlobal;
  globalObject.__AFILMORY__ ??= { version: 1 };
  return globalObject.__AFILMORY__;
}

export function setRuntimeManifest(manifest: AfilmoryManifest): void {
  const runtime = ensureBrowserRuntime();
  if (runtime.manifest) {
    runtime.manifest.data = manifest;
    runtime.manifest.promise = Promise.resolve(manifest);
    return;
  }
  runtime.manifest = {
    mode: "inline",
    data: manifest,
    promise: Promise.resolve(manifest),
  };
}
