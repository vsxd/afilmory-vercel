import { describe, expect, it } from "vitest";

import {
  buildGalleryFilterSearch,
  buildSingleTagFilterSearch,
  getGalleryFiltersFromSearch,
} from "~/lib/gallery-filter-url";

describe("gallery filter URL helpers", () => {
  it("reads gallery filters from URL search params", () => {
    expect(
      getGalleryFiltersFromSearch(
        "?tags=street,night&cameras=SONY+ILCE-7C&lenses=FE+35mm&tag_mode=intersection",
      ),
    ).toEqual({
      selectedTags: ["street", "night"],
      selectedCameras: ["SONY ILCE-7C"],
      selectedLenses: ["FE 35mm"],
      selectedGeoCountries: [],
      selectedGeoRegions: [],
      selectedGeoCities: [],
      selectedGeoDistricts: [],
      tagFilterMode: "intersection",
    });
  });

  it("writes active gallery filters without dropping unrelated params", () => {
    expect(
      buildGalleryFilterSearch("?photoId=A7C09524", {
        selectedTags: [],
        selectedCameras: ["SONY ILCE-7C"],
        selectedLenses: [],
        selectedGeoCountries: [],
        selectedGeoRegions: [],
        selectedGeoCities: [],
        selectedGeoDistricts: [],
        tagFilterMode: "union",
      }),
    ).toBe("?photoId=A7C09524&cameras=SONY+ILCE-7C");
  });

  it("reads repeated filter params without splitting encoded commas", () => {
    expect(
      getGalleryFiltersFromSearch(
        "?tags=street&tags=night%2Ccity&cameras=SONY+ILCE-7C",
      ),
    ).toEqual({
      selectedTags: ["street", "night,city"],
      selectedCameras: ["SONY ILCE-7C"],
      selectedLenses: [],
      selectedGeoCountries: [],
      selectedGeoRegions: [],
      selectedGeoCities: [],
      selectedGeoDistricts: [],
      tagFilterMode: "union",
    });
  });

  it("reads and writes geographic filters", () => {
    const search = buildGalleryFilterSearch("", {
      selectedTags: [],
      selectedCameras: [],
      selectedLenses: [],
      selectedGeoCountries: ["country=cn"],
      selectedGeoRegions: ["region:country=cn|region=anhui"],
      selectedGeoCities: ["city:country=cn|city=hangzhou"],
      selectedGeoDistricts: ["district:country=cn|city=hangzhou|district=xihu"],
      tagFilterMode: "union",
    });

    expect(search).toBe(
      "?geo_country=country%3Dcn&geo_region=region%3Acountry%3Dcn%7Cregion%3Danhui&geo_city=city%3Acountry%3Dcn%7Ccity%3Dhangzhou&geo_district=district%3Acountry%3Dcn%7Ccity%3Dhangzhou%7Cdistrict%3Dxihu",
    );
    expect(getGalleryFiltersFromSearch(search)).toMatchObject({
      selectedGeoCountries: ["country=cn"],
      selectedGeoRegions: ["region:country=cn|region=anhui"],
      selectedGeoCities: ["city:country=cn|city=hangzhou"],
      selectedGeoDistricts: ["district:country=cn|city=hangzhou|district=xihu"],
    });
  });

  it("restores legacy explore regionId filters on gallery routes", () => {
    expect(
      getGalleryFiltersFromSearch(
        "?regionId=region%3Acountry%3Dcn%7Cregion%3Danhui",
      ),
    ).toMatchObject({
      selectedGeoRegions: ["region:country=cn|region=anhui"],
    });

    expect(
      buildGalleryFilterSearch(
        "?regionId=region%3Acountry%3Dcn%7Cregion%3Danhui",
        {
          selectedTags: [],
          selectedCameras: [],
          selectedLenses: [],
          selectedGeoCountries: [],
          selectedGeoRegions: ["region:country=cn|region=anhui"],
          selectedGeoCities: [],
          selectedGeoDistricts: [],
          tagFilterMode: "union",
        },
      ),
    ).toBe("?geo_region=region%3Acountry%3Dcn%7Cregion%3Danhui");
  });

  it("keeps explicit region and district geographic filters shareable", () => {
    expect(
      buildGalleryFilterSearch("?geo_region=legacy&geo_district=legacy", {
        selectedTags: [],
        selectedCameras: [],
        selectedLenses: [],
        selectedGeoCountries: [],
        selectedGeoRegions: ["legacy"],
        selectedGeoCities: [],
        selectedGeoDistricts: ["legacy"],
        tagFilterMode: "union",
      }),
    ).toBe("?geo_region=legacy&geo_district=legacy");
  });

  it("builds a single tag search with reserved URL characters encoded", () => {
    const search = buildSingleTagFilterSearch("night & city#1");

    expect(search).toBe("?tags=night+%26+city%231");
    expect(getGalleryFiltersFromSearch(search).selectedTags).toEqual([
      "night & city#1",
    ]);
  });

  it("builds a single comma tag search without parsing it as two tags", () => {
    const search = buildSingleTagFilterSearch("night,city");

    expect(search).toBe("?tags=night%2Ccity&tags=");
    expect(getGalleryFiltersFromSearch(search).selectedTags).toEqual([
      "night,city",
    ]);
  });

  it("removes cleared filters from existing search params", () => {
    expect(
      buildGalleryFilterSearch(
        "?tags=street&cameras=SONY+ILCE-7C&tag_mode=intersection",
        {
          selectedTags: [],
          selectedCameras: [],
          selectedLenses: [],
          selectedGeoCountries: [],
          selectedGeoRegions: [],
          selectedGeoCities: [],
          selectedGeoDistricts: [],
          tagFilterMode: "union",
        },
      ),
    ).toBe("");
  });
});
