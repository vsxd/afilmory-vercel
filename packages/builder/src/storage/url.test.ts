import { describe, expect, it } from "vitest";

import { encodeStorageKeyForUrl, joinPublicUrl } from "./url.js";

describe("encodeStorageKeyForUrl", () => {
  it("encodes each path segment while keeping slashes as separators", () => {
    expect(encodeStorageKeyForUrl("albums/My Trip/IMG 1.jpg")).toBe(
      "albums/My%20Trip/IMG%201.jpg",
    );
  });

  it("normalizes backslashes to forward slashes before encoding", () => {
    expect(encodeStorageKeyForUrl("albums\\2026\\a b.jpg")).toBe(
      "albums/2026/a%20b.jpg",
    );
  });

  it("percent-encodes reserved characters within a segment", () => {
    expect(encodeStorageKeyForUrl("a+b/c#d?e.jpg")).toBe("a%2Bb/c%23d%3Fe.jpg");
  });

  it("leaves an already-safe key unchanged", () => {
    expect(encodeStorageKeyForUrl("photos/2026/img.jpg")).toBe(
      "photos/2026/img.jpg",
    );
  });

  it("handles a single segment with no slashes", () => {
    expect(encodeStorageKeyForUrl("a b.jpg")).toBe("a%20b.jpg");
  });
});

describe("joinPublicUrl", () => {
  it("joins base and key with a single slash", () => {
    expect(joinPublicUrl("https://cdn.example.com", "photos/a.jpg")).toBe(
      "https://cdn.example.com/photos/a.jpg",
    );
  });

  it("trims exactly one trailing slash from the base", () => {
    expect(joinPublicUrl("https://cdn.example.com/", "photos/a.jpg")).toBe(
      "https://cdn.example.com/photos/a.jpg",
    );
  });

  it("encodes the key while joining", () => {
    expect(joinPublicUrl("https://cdn.example.com/", "my album/a b.jpg")).toBe(
      "https://cdn.example.com/my%20album/a%20b.jpg",
    );
  });
});
