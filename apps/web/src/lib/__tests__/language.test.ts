import { describe, expect, it, vi } from "vitest";

import {
  detectPreferredLanguage,
  getBrowserLanguageCandidates,
  getFallbackLanguages,
  normalizeDetectedLanguage,
  resolveSupportedLanguage,
} from "../language";

describe("language helpers", () => {
  it("maps generic and simplified Chinese browser languages to zh-CN", () => {
    expect(resolveSupportedLanguage("zh")).toBe("zh-CN");
    expect(resolveSupportedLanguage("zh-Hans")).toBe("zh-CN");
    expect(resolveSupportedLanguage("zh_SG")).toBe("zh-CN");
  });

  it("maps traditional Chinese browser languages to available resources", () => {
    expect(resolveSupportedLanguage("zh-Hant")).toBe("zh-TW");
    expect(resolveSupportedLanguage("zh-TW")).toBe("zh-TW");
    expect(resolveSupportedLanguage("zh-Hant-HK")).toBe("zh-HK");
    expect(resolveSupportedLanguage("zh-MO")).toBe("zh-HK");
  });

  it("normalizes common non-Chinese locale variants", () => {
    expect(resolveSupportedLanguage("en-US")).toBe("en");
    expect(resolveSupportedLanguage("ja-JP")).toBe("ja");
    expect(resolveSupportedLanguage("jp")).toBe("ja");
    expect(resolveSupportedLanguage("ko-KR")).toBe("ko");
  });

  it("keeps unsupported detected languages unchanged for i18next fallback handling", () => {
    expect(normalizeDetectedLanguage("fr-FR")).toBe("fr-FR");
  });

  it("uses the configured language only as fallback", () => {
    expect(getFallbackLanguages("zh")).toEqual(["zh-CN", "en"]);
    expect(getFallbackLanguages("en-US")).toEqual(["en"]);
    expect(getFallbackLanguages(undefined)).toEqual(["en"]);
  });
});

describe("detectPreferredLanguage", () => {
  it("picks the first candidate that resolves to a supported language", () => {
    expect(detectPreferredLanguage(["fr-FR", "ja-JP", "en"], "en")).toBe("ja");
    expect(detectPreferredLanguage(["zh-Hant-HK"], "en")).toBe("zh-HK");
  });

  it("normalizes the legacy jp alias to ja", () => {
    expect(detectPreferredLanguage(["jp"], "en")).toBe("ja");
  });

  it("ignores empty or nullish candidates", () => {
    expect(detectPreferredLanguage(["", null, undefined, "ko-KR"], "en")).toBe(
      "ko",
    );
  });

  it("falls back to the configured language when nothing matches", () => {
    expect(detectPreferredLanguage(["fr-FR"], "zh")).toBe("zh-CN");
    expect(detectPreferredLanguage([], "ja")).toBe("ja");
  });

  it("falls back to en when even the configured fallback is unsupported", () => {
    expect(detectPreferredLanguage(["fr-FR"], "de")).toBe("en");
    expect(detectPreferredLanguage([], undefined)).toBe("en");
  });
});

describe("getBrowserLanguageCandidates", () => {
  it("orders navigator languages before the htmlTag language", () => {
    const languagesSpy = vi
      .spyOn(navigator, "languages", "get")
      .mockReturnValue(["ja-JP", "en-US"]);
    const languageSpy = vi
      .spyOn(navigator, "language", "get")
      .mockReturnValue("ja-JP");
    const previousHtmlLang = document.documentElement.lang;
    document.documentElement.lang = "zh-CN";

    try {
      expect(getBrowserLanguageCandidates()).toEqual([
        "ja-JP",
        "en-US",
        "ja-JP",
        "zh-CN",
      ]);
    } finally {
      languagesSpy.mockRestore();
      languageSpy.mockRestore();
      document.documentElement.lang = previousHtmlLang;
    }
  });

  it("skips the htmlTag source when the attribute is empty", () => {
    const previousHtmlLang = document.documentElement.lang;
    document.documentElement.lang = "";

    try {
      const candidates = getBrowserLanguageCandidates();
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates).not.toContain("");
    } finally {
      document.documentElement.lang = previousHtmlLang;
    }
  });
});
