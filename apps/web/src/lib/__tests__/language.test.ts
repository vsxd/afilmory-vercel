import { describe, expect, it } from "vitest";

import {
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
