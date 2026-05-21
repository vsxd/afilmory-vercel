import { describe, expect, it } from "vitest";

import { buildPhotoDetailPathname } from "../photo-detail-route";

describe("photo-detail-route", () => {
  it("encodes photo ids as one safe route segment", () => {
    expect(buildPhotoDetailPathname("album #1?50%")).toBe(
      "/photos/album%20%231%3F50%25",
    );
  });
});
