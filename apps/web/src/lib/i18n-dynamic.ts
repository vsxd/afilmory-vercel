import type { i18n as I18nInstance, InterpolationOptions } from "i18next";

const DEFAULT_INTERPOLATION_OPTIONS: InterpolationOptions = {};

export function translateDynamicKey(
  i18n: I18nInstance,
  key: string,
  options: Record<string, unknown> = {},
  namespace = "app",
): string {
  const resource: unknown = i18n.getResource(i18n.language, namespace, key);
  const template = typeof resource === "string" ? resource : key;

  return i18n.services.interpolator.interpolate(
    template,
    options,
    i18n.language,
    DEFAULT_INTERPOLATION_OPTIONS,
  );
}
