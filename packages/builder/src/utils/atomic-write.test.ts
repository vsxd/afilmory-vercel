import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeFileAtomic } from "./atomic-write.js";

describe("writeFileAtomic", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afilmory-atomic-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { force: true, recursive: true });
  });

  it("writes the full contents and creates missing parent directories", async () => {
    const target = path.join(tmpDir, "nested/dir/manifest.json");
    await writeFileAtomic(target, '{"ok":true}');
    expect(await fs.readFile(target, "utf-8")).toBe('{"ok":true}');
  });

  it("overwrites an existing file", async () => {
    const target = path.join(tmpDir, "manifest.json");
    await writeFileAtomic(target, "old");
    await writeFileAtomic(target, "new");
    expect(await fs.readFile(target, "utf-8")).toBe("new");
  });

  it("leaves no temporary files behind", async () => {
    const target = path.join(tmpDir, "manifest.json");
    await writeFileAtomic(target, "data");
    const entries = await fs.readdir(tmpDir);
    expect(entries).toEqual(["manifest.json"]);
    expect(entries.some((name) => name.endsWith(".tmp"))).toBe(false);
  });
});
