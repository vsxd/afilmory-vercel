import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { assertDeviceIconStyles } from "./device-check-build";

it("rejects a completed build that omitted the shell icon collection", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "afilmory-device-css-"),
  );
  try {
    const assets = path.join(directory, "assets");
    await fs.mkdir(assets);
    const file = path.join(assets, "index.css");
    await fs.writeFile(file, ".size-5{width:1.25rem;height:1.25rem}");
    await expect(assertDeviceIconStyles(directory)).rejects.toThrow(
      "search icon style",
    );
    await fs.writeFile(
      file,
      ".i-mingcute-search-line{mask-image:url(data:image/svg+xml,search)}",
    );
    await expect(assertDeviceIconStyles(directory)).rejects.toThrow(
      "map-pin icon style",
    );
    await fs.writeFile(
      path.join(assets, "icons.css"),
      ".i-mingcute-map-pin-line,.i-mingcute-close-line{mask-image:url(data:image/svg+xml,icon)}",
    );
    await expect(assertDeviceIconStyles(directory)).resolves.toBeUndefined();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
