import { describe, expect, it } from "vitest";

import {
  buildGalleryFilterSearch,
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
      tagFilterMode: "intersection",
    });
  });

  it("writes active gallery filters without dropping unrelated params", () => {
    expect(
      buildGalleryFilterSearch("?photoId=A7C09524", {
        selectedTags: [],
        selectedCameras: ["SONY ILCE-7C"],
        selectedLenses: [],
        tagFilterMode: "union",
      }),
    ).toBe("?photoId=A7C09524&cameras=SONY+ILCE-7C");
  });

  it("removes cleared filters from existing search params", () => {
    expect(
      buildGalleryFilterSearch(
        "?tags=street&cameras=SONY+ILCE-7C&tag_mode=intersection",
        {
          selectedTags: [],
          selectedCameras: [],
          selectedLenses: [],
          tagFilterMode: "union",
        },
      ),
    ).toBe("");
  });
});
