import { describe, expect, it } from "vitest";

import type { GeocodingPluginOptionsResolved } from "./geocoding-options.js";
import {
  CANONICAL_GEOCODING_LOCALE,
  createResolvedGeocodingSettings,
  DEFAULT_CACHE_PRECISION,
  DEFAULT_GEOCODING_LOCALES,
  normalizeGeocodingLocales,
  resolveGeocodingOptions,
} from "./geocoding-options.js";

describe("geocoding-options constants", () => {
  it("exposes the expected defaults", () => {
    expect(DEFAULT_CACHE_PRECISION).toBe(4);
    expect(CANONICAL_GEOCODING_LOCALE).toBe("en");
    expect(DEFAULT_GEOCODING_LOCALES).toEqual(["en", "zh-CN"]);
  });
});

describe("normalizeGeocodingLocales", () => {
  it("falls back to the default locales when nothing is provided", () => {
    expect(normalizeGeocodingLocales()).toEqual(["en", "zh-CN"]);
  });

  it("parses a comma-separated locale string and forces the canonical locale first", () => {
    expect(normalizeGeocodingLocales("fr,de")).toEqual(["en", "fr", "de"]);
  });

  it("accepts an array of locales", () => {
    expect(normalizeGeocodingLocales(["fr", "de"])).toEqual(["en", "fr", "de"]);
  });

  it("trims whitespace and drops empty segments", () => {
    expect(normalizeGeocodingLocales(" fr ,  , de ")).toEqual([
      "en",
      "fr",
      "de",
    ]);
  });

  it("de-duplicates repeated locales while preserving order", () => {
    expect(normalizeGeocodingLocales("fr,fr,de,fr")).toEqual([
      "en",
      "fr",
      "de",
    ]);
  });

  it("moves an explicitly-provided canonical locale to the front", () => {
    expect(normalizeGeocodingLocales("fr,en,de")).toEqual(["en", "fr", "de"]);
  });

  it("collapses to just the canonical locale when only it is requested", () => {
    expect(normalizeGeocodingLocales("en")).toEqual(["en"]);
  });

  it("uses the legacy language argument when locales is empty/whitespace", () => {
    expect(normalizeGeocodingLocales("   ", "ja,ko")).toEqual([
      "en",
      "ja",
      "ko",
    ]);
    expect(normalizeGeocodingLocales(undefined, ["ja", "ko"])).toEqual([
      "en",
      "ja",
      "ko",
    ]);
  });

  it("prefers locales over the legacy language when both are provided", () => {
    expect(normalizeGeocodingLocales("fr", "ja")).toEqual(["en", "fr"]);
  });

  it("falls back to defaults when both locales and legacy language are empty", () => {
    expect(normalizeGeocodingLocales("", "")).toEqual(["en", "zh-CN"]);
  });

  it("returns a fresh array rather than the shared default constant", () => {
    const result = normalizeGeocodingLocales();
    expect(result).not.toBe(DEFAULT_GEOCODING_LOCALES);
  });
});

describe("resolveGeocodingOptions", () => {
  it("applies all defaults for an empty options object", () => {
    expect(resolveGeocodingOptions({})).toEqual({
      enable: false,
      provider: "nominatim",
      mapboxToken: undefined,
      nominatimBaseUrl: undefined,
      nominatimUserAgent: undefined,
      cachePath: undefined,
      cachePrecision: 4,
      locales: ["en", "zh-CN"],
    });
  });

  it("passes through enable and provider when supplied", () => {
    const resolved = resolveGeocodingOptions({
      enable: true,
      provider: "mapbox",
    });
    expect(resolved.enable).toBe(true);
    expect(resolved.provider).toBe("mapbox");
  });

  it("respects an explicit enable:false", () => {
    expect(resolveGeocodingOptions({ enable: false }).enable).toBe(false);
  });

  it("passes provider-specific connection fields through unchanged", () => {
    const resolved = resolveGeocodingOptions({
      mapboxToken: "tok",
      nominatimBaseUrl: "https://nominatim.example",
      nominatimUserAgent: "afilmory/1.0",
      cachePath: "/tmp/geo.json",
    });
    expect(resolved.mapboxToken).toBe("tok");
    expect(resolved.nominatimBaseUrl).toBe("https://nominatim.example");
    expect(resolved.nominatimUserAgent).toBe("afilmory/1.0");
    expect(resolved.cachePath).toBe("/tmp/geo.json");
  });

  it("keeps an in-range cache precision as-is", () => {
    expect(resolveGeocodingOptions({ cachePrecision: 7 }).cachePrecision).toBe(
      7,
    );
  });

  it("preserves a zero cache precision (nullish coalescing does not override 0)", () => {
    expect(resolveGeocodingOptions({ cachePrecision: 0 }).cachePrecision).toBe(
      0,
    );
  });

  it("clamps cache precision into the 0..10 range", () => {
    expect(resolveGeocodingOptions({ cachePrecision: 15 }).cachePrecision).toBe(
      10,
    );
    expect(resolveGeocodingOptions({ cachePrecision: -3 }).cachePrecision).toBe(
      0,
    );
  });

  it("rounds a fractional cache precision", () => {
    expect(
      resolveGeocodingOptions({ cachePrecision: 4.7 }).cachePrecision,
    ).toBe(5);
    expect(
      resolveGeocodingOptions({ cachePrecision: 4.4 }).cachePrecision,
    ).toBe(4);
  });

  it("falls back to the default precision for NaN", () => {
    expect(
      resolveGeocodingOptions({ cachePrecision: Number.NaN }).cachePrecision,
    ).toBe(4);
  });

  it("derives locales from the legacy language field when locales is absent", () => {
    expect(resolveGeocodingOptions({ language: "ja" }).locales).toEqual([
      "en",
      "ja",
    ]);
  });

  it("prefers the locales field over the legacy language field", () => {
    expect(
      resolveGeocodingOptions({ locales: "fr", language: "ja" }).locales,
    ).toEqual(["en", "fr"]);
  });
});

describe("createResolvedGeocodingSettings", () => {
  const fullResolved: GeocodingPluginOptionsResolved = {
    enable: true,
    provider: "mapbox",
    mapboxToken: "tok",
    nominatimBaseUrl: "https://nominatim.example",
    nominatimUserAgent: "afilmory/1.0",
    cachePath: "/tmp/geo.json",
    cachePrecision: 6,
    locales: ["en", "fr"],
  };

  it("maps resolved options into runtime settings without the enable flag", () => {
    const settings = createResolvedGeocodingSettings(fullResolved);
    expect(settings).toEqual({
      provider: "mapbox",
      mapboxToken: "tok",
      nominatimBaseUrl: "https://nominatim.example",
      nominatimUserAgent: "afilmory/1.0",
      cachePath: "/tmp/geo.json",
      cachePrecision: 6,
      locales: ["en", "fr"],
    });
    expect("enable" in settings).toBe(false);
  });

  it("defaults the cache precision when it is missing from resolved options", () => {
    const settings = createResolvedGeocodingSettings({
      enable: false,
      provider: "nominatim",
      locales: ["en"],
    });
    expect(settings.cachePrecision).toBe(DEFAULT_CACHE_PRECISION);
  });

  it("carries the locales array reference through", () => {
    const settings = createResolvedGeocodingSettings(fullResolved);
    expect(settings.locales).toBe(fullResolved.locales);
  });
});
