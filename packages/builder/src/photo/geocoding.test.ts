import { afterEach, describe, expect, it, vi } from "vitest";

import { NominatimGeocodingProvider } from "./geocoding.js";

const locationLogger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("./logger-adapter.js", () => ({
  getGlobalLoggers: () => ({ location: locationLogger }),
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
});
