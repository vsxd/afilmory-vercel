import { currentSupportedLanguages } from "~/@types/constants";

const normalizeTag = (language: string): string =>
  language.trim().replaceAll("_", "-").toLowerCase();

export const resolveSupportedLanguage = (
  language: string | null | undefined,
): string | null => {
  if (!language) return null;

  const normalized = normalizeTag(language);
  if (!normalized) return null;

  if (normalized === "zh" || normalized.startsWith("zh-")) {
    const parts = new Set(normalized.split("-"));
    if (parts.has("hk") || parts.has("mo")) return "zh-HK";
    if (parts.has("tw") || parts.has("hant")) return "zh-TW";
    return "zh-CN";
  }

  if (
    normalized === "jp" ||
    normalized === "ja" ||
    normalized.startsWith("ja-")
  ) {
    return "ja";
  }

  if (normalized === "ko" || normalized.startsWith("ko-")) {
    return "ko";
  }

  if (normalized === "en" || normalized.startsWith("en-")) {
    return "en";
  }

  const exactMatch = currentSupportedLanguages.find(
    (supportedLanguage) => supportedLanguage.toLowerCase() === normalized,
  );

  return exactMatch ?? null;
};

export const normalizeDetectedLanguage = (language: string): string =>
  resolveSupportedLanguage(language) ?? language;

export const getFallbackLanguages = (
  configuredLanguage: string | null | undefined,
): string[] => {
  const fallbackLanguage = resolveSupportedLanguage(configuredLanguage) ?? "en";

  return fallbackLanguage === "en" ? ["en"] : [fallbackLanguage, "en"];
};
