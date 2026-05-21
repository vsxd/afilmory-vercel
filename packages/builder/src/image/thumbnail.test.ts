import { describe, expect, it } from "vitest";

import { getThumbnailPublicUrl } from "./thumbnail.js";

describe("thumbnail URL helpers", () => {
  it("encodes generated thumbnail filenames for public URLs", () => {
    expect(getThumbnailPublicUrl("album #1?50%")).toBe(
      "/thumbnails/album%20%231%3F50%25.jpg",
    );
  });
});
