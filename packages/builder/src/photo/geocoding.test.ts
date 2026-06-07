import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGeocodingProvider,
  NominatimGeocodingProvider,
} from "./geocoding.js";

const locationLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("./logger-adapter.js", () => ({
  getPhotoProcessingLoggers: () => ({ location: locationLogger }),
}));

describe("NominatimGeocodingProvider", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps Nominatim address fields to structured admin location data", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          display_name: "Shibuya City, Tokyo, Japan",
          address: {
            country: "Japan",
            country_code: "jp",
            state: "Tokyo",
            city: "Shibuya",
            city_district: "Shibuya City",
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new NominatimGeocodingProvider(
      "https://nominatim.test",
      "zh-CN,en",
      "afilmory-test/1.0 (test@example.com)",
    );

    const location = await provider.reverseGeocode(35.659_108, 139.700_523);

    expect(location).toEqual({
      latitude: 35.659_108,
      longitude: 139.700_523,
      country: "Japan",
      city: "Shibuya",
      locationName: "Shibuya City, Tokyo, Japan",
      admin: {
        country: "Japan",
        countryCode: "JP",
        region: "Tokyo",
        city: "Shibuya",
        district: "Shibuya City",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("accept-language=zh-CN%2Cen");
    expect(init?.headers).toEqual({
      "Accept-Language": "zh-CN,en",
      "User-Agent": "afilmory-test/1.0 (test@example.com)",
    });
  });

  it("normalizes Nominatim semicolon-separated localized aliases", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          display_name:
            "107, Fenchurch Street, 倫敦市;伦敦市, 英格兰;英格蘭, 英国;英國",
          address: {
            country: "英国;英國",
            country_code: "gb",
            state: "英格兰;英格蘭",
            city: "倫敦市;伦敦市",
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const simplifiedProvider = new NominatimGeocodingProvider(
      "https://nominatim.test",
      "zh-CN,en",
      "afilmory-test/1.0 (test@example.com)",
    );

    const simplifiedLocation = await simplifiedProvider.reverseGeocode(
      51.51,
      -0.08,
    );

    expect(simplifiedLocation?.admin).toMatchObject({
      country: "英国",
      countryCode: "GB",
      region: "英格兰",
      city: "伦敦市",
    });

    const traditionalProvider = new NominatimGeocodingProvider(
      "https://nominatim.test",
      "zh-HK,en",
      "afilmory-test/1.0 (test@example.com)",
    );

    const traditionalLocation = await traditionalProvider.reverseGeocode(
      51.51,
      -0.08,
    );

    expect(traditionalLocation?.admin).toMatchObject({
      country: "英國",
      countryCode: "GB",
      region: "英格蘭",
      city: "倫敦市",
    });
  });
});

describe("createGeocodingProvider", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses Mapbox in auto mode when a token is configured", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                context: {
                  country: {
                    country_code: "es",
                    name: "Spain",
                  },
                  place: {
                    name: "Barcelona",
                  },
                  region: {
                    name: "Catalonia",
                  },
                },
                full_address: "Barcelona, Catalonia, Spain",
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGeocodingProvider(
      "auto",
      "mapbox-token",
      undefined,
      "en",
    );
    const location = await provider?.reverseGeocode(41.4031, 2.174);

    expect(location).toMatchObject({
      admin: {
        city: "Barcelona",
        country: "Spain",
        countryCode: "ES",
        region: "Catalonia",
      },
      locationName: "Barcelona, Catalonia, Spain",
    });
    const [url] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(url));
    expect(requestUrl.hostname).toBe("api.mapbox.com");
    expect(requestUrl.searchParams.get("access_token")).toBe("mapbox-token");
    expect(requestUrl.searchParams.get("language")).toBe("en");
  });
});
