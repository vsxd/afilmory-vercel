import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlobUrlManager } from "../blob-url-manager";

describe("BlobUrlManager", () => {
  let counter = 0;

  beforeEach(() => {
    counter = 0;
    // jsdom's object-URL support is inconsistent across versions; install
    // spy-able stubs so vi.spyOn always has something to wrap regardless.
    Object.assign(URL, {
      createObjectURL: () => "",
      revokeObjectURL: () => {},
    });
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:mock/${++counter}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeBlob = () => new Blob(["x"], { type: "text/plain" });

  it("creates and tracks distinct blob URLs", () => {
    const manager = new BlobUrlManager();
    const url1 = manager.createUrl(makeBlob());
    const url2 = manager.createUrl(makeBlob());

    expect(url1).not.toBe(url2);
    expect(manager.getCount()).toBe(2);
  });

  it("revokes a tracked URL once and stops tracking it", () => {
    const manager = new BlobUrlManager();
    const url = manager.createUrl(makeBlob());

    manager.revokeUrl(url);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    expect(manager.getCount()).toBe(0);

    // Revoking the same URL again is a no-op because it is no longer tracked.
    vi.mocked(URL.revokeObjectURL).mockClear();
    manager.revokeUrl(url);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("ignores revokeUrl for URLs it does not own", () => {
    const manager = new BlobUrlManager();
    manager.revokeUrl("blob:not-tracked");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("revokeAll releases every tracked URL and resets the count", () => {
    const manager = new BlobUrlManager();
    manager.createUrl(makeBlob());
    manager.createUrl(makeBlob());
    manager.createUrl(makeBlob());
    expect(manager.getCount()).toBe(3);

    manager.revokeAll();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(manager.getCount()).toBe(0);
  });

  it("swallows revoke errors and keeps the URL tracked when revoke throws", () => {
    vi.mocked(URL.revokeObjectURL).mockImplementation(() => {
      throw new Error("revoke failed");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const manager = new BlobUrlManager();
    const url = manager.createUrl(makeBlob());

    expect(() => manager.revokeUrl(url)).not.toThrow();
    // delete() runs only after a successful revoke, so the URL stays tracked.
    expect(manager.getCount()).toBe(1);
    expect(warn).toHaveBeenCalled();
  });
});
