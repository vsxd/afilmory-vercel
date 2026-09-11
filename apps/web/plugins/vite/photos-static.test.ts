import { once } from "node:events";
import nodeFs from "node:fs";
import fs from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import os from "node:os";
import path from "node:path";

import type { Connect, ViteDevServer } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  copyLocalPhotos,
  getLocalMediaKeyFromUrl,
  normalizeLocalPhotosBaseUrl,
  parseByteRange,
  photosStaticPlugin,
  resolveLocalPhotoPath,
  resolveRealLocalPhotoPath,
} from "./photos-static";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true })),
  );
});

describe("photosStaticPlugin middleware", () => {
  it("closes a paused source file when the client disconnects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "photos-stream-"));
    temporaryDirectories.push(root);
    await fs.writeFile(path.join(root, "large.jpg"), Buffer.alloc(1024 * 1024));

    let middleware: Connect.NextHandleFunction | undefined;
    const plugin = photosStaticPlugin({
      provider: "local",
      localPhotosPath: root,
      baseUrl: "/originals",
    });
    const { configureServer } = plugin;
    if (typeof configureServer !== "function") {
      throw new TypeError("Expected a configureServer hook");
    }
    configureServer.call(
      {} as never,
      {
        config: { publicDir: path.join(root, "public") },
        middlewares: {
          use: (_prefix: string, handler: Connect.NextHandleFunction) => {
            middleware = handler;
          },
        },
      } as ViteDevServer,
    );

    const createReadStream = vi.spyOn(nodeFs, "createReadStream");
    const request = new IncomingMessage(new Socket());
    request.url = "/large.jpg";
    request.method = "GET";
    const response = new ServerResponse(request);
    const next = vi.fn();
    middleware!(request, response, next);
    const stream = createReadStream.mock.results[0]?.value as nodeFs.ReadStream;
    expect(stream).toBeDefined();
    try {
      await once(stream, "data");
      expect(stream.readableEnded).toBe(false);
      expect(stream.isPaused()).toBe(true);
      response.emit("close");
      // A pipe alone leaves the source paused/open after destination close.
      expect(stream.destroyed).toBe(true);
      await once(stream, "close");
      expect(stream.closed).toBe(true);
      expect(next).not.toHaveBeenCalled();
    } finally {
      response.destroy();
      request.destroy();
      stream.destroy();
    }
  });
});

describe("photosStaticPlugin helpers", () => {
  it("normalizes safe local URL prefixes and rejects root/traversal prefixes", () => {
    expect(normalizeLocalPhotosBaseUrl("/originals/")).toBe("/originals");
    expect(() => normalizeLocalPhotosBaseUrl("/")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/../private")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/%2e%2e/private")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/media%5cprivate")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/media%3fprivate")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/my%20photos")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/my photos")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/相册")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/media//originals")).toThrow();
    expect(() => normalizeLocalPhotosBaseUrl("/photos")).toThrow(
      "reserved application namespace",
    );
    expect(() => normalizeLocalPhotosBaseUrl("/Photos")).toThrow(
      "reserved application namespace",
    );
    expect(() =>
      normalizeLocalPhotosBaseUrl("https://example.com/photos"),
    ).toThrow();
  });

  it("resolves unicode filenames without allowing traversal", () => {
    const root = path.resolve("/tmp/gallery-photos");
    expect(resolveLocalPhotoPath(root, "/旅行/日落%20%F0%9F%8C%85.jpg")).toBe(
      path.join(root, "旅行/日落 🌅.jpg"),
    );
    expect(resolveLocalPhotoPath(root, "/..summer.jpg")).toBe(
      path.join(root, "..summer.jpg"),
    );
    expect(resolveLocalPhotoPath(root, "/../secret.jpg")).toBeNull();
    expect(resolveLocalPhotoPath(root, "/%2e%2e/secret.jpg")).toBeNull();
  });

  it("does not follow local-photo symlinks outside the configured root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "photos-static-"));
    temporaryDirectories.push(root);
    const source = path.join(root, "source");
    const privateFile = path.join(root, "private.jpg");
    await fs.mkdir(source);
    await fs.writeFile(privateFile, "private");
    await fs.symlink(privateFile, path.join(source, "linked.jpg"));

    expect(resolveRealLocalPhotoPath(source, "/linked.jpg")).toBeNull();
  });

  it("parses standard, open-ended, and suffix byte ranges", () => {
    expect(parseByteRange(undefined, 100)).toBeNull();
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=100-", 100)).toBe("invalid");
    expect(parseByteRange("bytes=0-1,4-5", 100)).toBe("invalid");
  });

  it("recognizes thumbnails stored by the local thumbnail-storage plugin", () => {
    expect(
      getLocalMediaKeyFromUrl(
        "/originals/.afilmory/thumbnails/photo.hash.jpg?v=1",
        "/originals",
      ),
    ).toBe(".afilmory/thumbnails/photo.hash.jpg");
    expect(
      getLocalMediaKeyFromUrl("/thumbnails/photo.hash.jpg", "/originals"),
    ).toBeNull();
    expect(
      getLocalMediaKeyFromUrl("/originals/%2e%2e/private.jpg", "/originals"),
    ).toBeNull();
  });

  it("copies only manifest media without deleting generated photo pages", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "photos-static-"));
    temporaryDirectories.push(root);
    const source = path.join(root, "source");
    const destination = path.join(root, "dist/photos");
    await fs.mkdir(path.join(destination, "photo-id"), { recursive: true });
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "photo.jpg"), "image");
    await fs.writeFile(path.join(source, "..summer.jpg"), "dot-image");
    await fs.writeFile(path.join(source, "payload.svg"), "<script />");
    await fs.mkdir(path.join(source, ".afilmory/thumbnails"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(source, ".afilmory/thumbnails/photo.hash.jpg"),
      "thumbnail",
    );
    await fs.writeFile(path.join(source, ".env"), "secret");
    await fs.writeFile(
      path.join(destination, "photo-id/index.html"),
      "seo shell",
    );

    await copyLocalPhotos(
      source,
      destination,
      [
        "photo.jpg",
        "..summer.jpg",
        "payload.svg",
        ".afilmory/thumbnails/photo.hash.jpg",
      ],
      path.join(root, "dist"),
    );

    await expect(
      fs.readFile(path.join(destination, "photo.jpg"), "utf8"),
    ).resolves.toBe("image");
    await expect(
      fs.readFile(path.join(destination, "photo-id/index.html"), "utf8"),
    ).resolves.toBe("seo shell");
    await expect(
      fs.readFile(path.join(destination, "..summer.jpg"), "utf8"),
    ).resolves.toBe("dot-image");
    await expect(
      fs.readFile(
        path.join(destination, ".afilmory/thumbnails/photo.hash.jpg"),
        "utf8",
      ),
    ).resolves.toBe("thumbnail");
    await expect(fs.stat(path.join(destination, ".env"))).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    await expect(
      fs.stat(path.join(destination, "payload.svg")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a symlinked build destination before copying media", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "photos-static-"));
    temporaryDirectories.push(root);
    const source = path.join(root, "source");
    const output = path.join(root, "dist");
    const outside = path.join(root, "outside");
    await fs.mkdir(source);
    await fs.mkdir(output);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(source, "photo.jpg"), "image");
    await fs.symlink(outside, path.join(output, "originals"));

    await expect(
      copyLocalPhotos(
        source,
        path.join(output, "originals"),
        ["photo.jpg"],
        output,
      ),
    ).rejects.toThrow("unsafe path component");
    await expect(
      fs.stat(path.join(outside, "photo.jpg")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
