// @vitest-environment node
import { matchPath } from "react-router";
import { describe, expect, it } from "vitest";

import { isMapPath, parsePhotoId, safeDestination } from "../routes";

describe("route pathname matching", () => {
  it.each(["/explore", "/EXPLORE", "/Explore/"])(
    "recognizes %s consistently with Router's static route matching",
    (pathname) => {
      expect(matchPath("/explore", pathname)).not.toBeNull();
      expect(isMapPath(pathname)).toBe(true);
    },
  );

  it.each([
    ["/Photos/CaseSensitiveID", "CaseSensitiveID"],
    ["/PHOTOS/Case%2FSensitive%20ID/", "Case/Sensitive ID"],
  ])("preserves the decoded ID in %s", (pathname, photoId) => {
    expect(matchPath("/photos/:photoId", pathname)).not.toBeNull();
    expect(parsePhotoId(pathname)).toBe(photoId);
  });

  it("keeps exact path and valid encoding requirements", () => {
    expect(isMapPath("/EXPLORE/nested")).toBe(false);
    expect(isMapPath("/EXPLORE-other")).toBe(false);
    expect(parsePhotoId("/Photos/CaseSensitiveID/nested")).toBeNull();
    expect(parsePhotoId("/Photos/%ZZ")).toBeNull();
    expect(parsePhotoId("/Photos/")).toBeNull();
  });
});

describe("safe navigation destinations", () => {
  it("normalizes an internal map path while preserving allowed selection values", () => {
    expect(
      safeDestination(
        "/EXPLORE/?photoId=CaseSensitiveID&mode=photos&returnTo=//evil.test&sort=asc",
      ),
    ).toEqual({
      pathname: "/explore",
      search: "?photoId=CaseSensitiveID&mode=photos",
    });
    expect(safeDestination("/EXPLORE?mode=PHOTOS")).toEqual({
      pathname: "/explore",
      search: "",
    });
  });

  it.each([
    "https://evil.test/EXPLORE",
    "//evil.test/EXPLORE",
    "/\\evil.test/EXPLORE",
    "/Photos/CaseSensitiveID",
    "/EXPLORE/nested",
  ])(
    "still rejects destinations outside the trusted gallery/map scope: %s",
    (target) => {
      expect(safeDestination(target)).toBeNull();
    },
  );
});
