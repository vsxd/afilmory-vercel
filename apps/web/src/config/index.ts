import type { SiteConfig } from "@config";
import defaultSiteConfig from "@config";
import { merge } from "es-toolkit/compat";

import { getExistingBrowserRuntime } from "~/runtime/browser-runtime";

import type { InjectConfig } from "./types";

const defaultInjectConfig = {
  useApi: false,
  useNext: false,
  useCloud: false,
} satisfies InjectConfig;

const runtimeConfig = getExistingBrowserRuntime()?.config;

export const injectConfig: InjectConfig = merge(
  defaultInjectConfig,
  runtimeConfig?.features ?? {},
);

const runtimeSiteConfig = runtimeConfig?.site ?? {};

export const siteConfig: SiteConfig = merge(
  defaultSiteConfig,
  runtimeSiteConfig,
);
