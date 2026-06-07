import type { AfilmoryManifest } from "@afilmory/schema";
import type { SiteConfig } from "@config";

import type { InjectConfig } from "~/config/types";

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
    }
  | {
      mode: "external";
      url: string;
      data?: unknown;
      promise?: Promise<unknown>;
    };

export type AfilmoryBuildInfo = {
  appName?: string;
  builtDate?: string;
  gitCommitHash?: string;
  devCwd?: string;
};

export type AfilmoryBrowserRuntime = {
  version: 1;
  build?: AfilmoryBuildInfo;
  config?: {
    features?: Partial<InjectConfig>;
    site?: Partial<SiteConfig>;
  };
  manifest?: AfilmoryManifestRuntime;
  startup?: StartupReporter;
};

type AfilmoryGlobal = typeof globalThis & {
  __AFILMORY__?: AfilmoryBrowserRuntime;
};

export function getExistingBrowserRuntime():
  | AfilmoryBrowserRuntime
  | undefined {
  return (globalThis as AfilmoryGlobal).__AFILMORY__;
}

export function ensureBrowserRuntime(): AfilmoryBrowserRuntime {
  const globalObject = globalThis as AfilmoryGlobal;
  globalObject.__AFILMORY__ ??= { version: 1 };
  return globalObject.__AFILMORY__;
}

export function setRuntimeManifest(manifest: AfilmoryManifest): void {
  const runtime = ensureBrowserRuntime();
  runtime.manifest = {
    mode: "inline",
    data: manifest,
    promise: Promise.resolve(manifest),
  };
}
