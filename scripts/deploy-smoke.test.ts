import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assertManifest } from "@afilmory/schema";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import {
  createDeploySmokeEnvironment,
  createDeploySmokeWorkspace,
  verifyDeployOutput,
} from "./deploy-smoke";

const temporaryDirectories: string[] = [];
const createTemporaryDirectory = async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "deploy-smoke-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
};
const write = async (root: string, file: string, contents: string | Buffer) => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), contents);
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true })),
  );
});

describe("deployment smoke environment", () => {
  it("runs a fresh local build without inheriting credentials or private configuration", () => {
    const environment = createDeploySmokeEnvironment("/tmp/smoke-workspace", {
      AFILMORY_MANIFEST_PATH: "/private/manifest.json",
      AFILMORY_REQUIRE_EXACT_SOURCE: "true",
      AWS_PROFILE: "private",
      BUILDER_REPO_URL: "https://private.test/cache.git",
      CI: "true",
      DOTENV_CONFIG_PATH: "/private/.env",
      GITHUB_SHA: "not-the-tested-revision",
      GIT_TOKEN: "must-not-pass-through",
      NODE_OPTIONS: "--require=/private/hook.js",
      PATH: "/bin",
      REPO_TOKEN: "must-not-pass-through",
      S3_SECRET_ACCESS_KEY: "private",
      SKIP_MANIFEST_BUILD: "true",
      VERCEL: "1",
    });
    expect(environment).toMatchObject({
      AFILMORY_MANIFEST_PATH:
        "/tmp/smoke-workspace/generated/photos-manifest.json",
      AFILMORY_PUBLIC_ASSET_DIR: "/tmp/smoke-workspace/apps/web/public",
      BUILDER_FAIL_ON_PHOTO_ERROR: "true",
      CI: "false",
      DOTENV_CONFIG_PATH: "/tmp/smoke-workspace/smoke.environment.env",
      LOCAL_PHOTOS_PATH: "/tmp/smoke-workspace/photos",
      PATH: "/bin",
      PHOTO_STORAGE_PROVIDER: "local",
      REQUIRE_FRESH_BUILD: "true",
      REPO_TOKEN: "",
      SKIP_MANIFEST_BUILD: "false",
    });
    for (const key of [
      "AWS_PROFILE",
      "S3_SECRET_ACCESS_KEY",
      "GIT_TOKEN",
      "BUILDER_REPO_URL",
      "NODE_OPTIONS",
      "GITHUB_SHA",
      "VERCEL",
      "AFILMORY_REQUIRE_EXACT_SOURCE",
    ]) {
      expect(environment[key], key).toBeUndefined();
    }
  });
});

describe("deployment source snapshot", () => {
  it("copies current and untracked source while excluding existing media, outputs and private env files", async () => {
    const source = await createTemporaryDirectory();
    execFileSync("git", ["init", "--quiet", source]);
    const tracked = {
      "package.json": "{}",
      "builder.config.ts": "old config",
      "scripts/removed.ts": "removed source",
      "packages/builder/package.json": "{}",
      "packages/schema/package.json": "{}",
      "apps/web/public/favicon.ico": "static asset",
      ".env": "PRIVATE=secret",
      "apps/web/.env.production.local": "PRIVATE=secret",
      "generated/photos-manifest.json": "private manifest",
      "apps/web/public/thumbnails/private.jpg": "private thumbnail",
      "apps/web/public/originals/private.jpg": "private original",
      "apps/web/dist/index.html": "old build",
      "photos/private.jpg": "private source",
    };
    for (const [file, contents] of Object.entries(tracked))
      await write(source, file, contents);
    execFileSync("git", ["add", "--all"], { cwd: source });
    await write(source, "builder.config.ts", "current unstaged config");
    await fs.rm(path.join(source, "scripts/removed.ts"));
    await write(
      source,
      "scripts/new-precheck-helper.ts",
      "new untracked source",
    );
    await write(source, "apps/web/.env.local", "PRIVATE=another secret");
    await fs.mkdir(path.join(source, "node_modules/@afilmory"), {
      recursive: true,
    });
    await fs.symlink(
      path.join(source, "packages/builder"),
      path.join(source, "node_modules/@afilmory/builder"),
      "dir",
    );
    await fs.mkdir(
      path.join(source, "packages/builder/node_modules/@afilmory"),
      { recursive: true },
    );
    await fs.symlink(
      path.join(source, "packages/schema"),
      path.join(source, "packages/builder/node_modules/@afilmory/schema"),
      "dir",
    );
    const externalDependency = await createTemporaryDirectory();
    await fs.symlink(
      externalDependency,
      path.join(source, "node_modules/sharp"),
      "dir",
    );

    const workspace = await createDeploySmokeWorkspace(source);
    temporaryDirectories.push(workspace);
    expect(
      await fs.readFile(path.join(workspace, "builder.config.ts"), "utf8"),
    ).toBe("current unstaged config");
    expect(
      await fs.readFile(
        path.join(workspace, "scripts/new-precheck-helper.ts"),
        "utf8",
      ),
    ).toBe("new untracked source");
    expect(
      await fs.readFile(
        path.join(workspace, "apps/web/public/favicon.ico"),
        "utf8",
      ),
    ).toBe("static asset");
    for (const file of [
      ".git",
      ".env",
      "apps/web/.env.production.local",
      "apps/web/.env.local",
      "generated/photos-manifest.json",
      "apps/web/public/thumbnails",
      "apps/web/public/originals",
      "apps/web/dist",
      "photos/private.jpg",
      "scripts/removed.ts",
    ]) {
      await expect(
        fs.access(path.join(workspace, file)),
        file,
      ).rejects.toThrow();
    }
    expect(
      await fs.realpath(path.join(workspace, "node_modules/@afilmory/builder")),
    ).toBe(path.join(workspace, "packages/builder"));
    expect(
      await fs.realpath(
        path.join(workspace, "packages/builder/node_modules/@afilmory/schema"),
      ),
    ).toBe(path.join(workspace, "packages/schema"));
    expect(await fs.realpath(path.join(workspace, "node_modules/sharp"))).toBe(
      await fs.realpath(externalDependency),
    );
    expect(
      (await sharp(path.join(workspace, "photos/deploy/amber.jpg")).metadata())
        .format,
    ).toBe("jpeg");
    expect(
      (
        await sharp(
          path.join(workspace, "photos/deploy/blue sky.png"),
        ).metadata()
      ).format,
    ).toBe("png");
    expect(
      await fs.readFile(
        path.join(source, "generated/photos-manifest.json"),
        "utf8",
      ),
    ).toBe("private manifest");
    expect(
      await fs.readFile(
        path.join(source, "apps/web/public/thumbnails/private.jpg"),
        "utf8",
      ),
    ).toBe("private thumbnail");
  });

  it("rejects source symlinks instead of importing or writing outside the snapshot", async () => {
    const source = await createTemporaryDirectory();
    execFileSync("git", ["init", "--quiet", source]);
    await fs.mkdir(path.join(source, "scripts"));
    await fs.symlink("/private/.env", path.join(source, "scripts/escape.ts"));
    await expect(createDeploySmokeWorkspace(source)).rejects.toThrow(
      /not a regular file/,
    );
  });
});

const builderOutput =
  "[precheck] Running builder CLI to refresh manifest from source...\n> tsx src/cli.ts\n";
const prepareOutput = async () => {
  const workspace = await createTemporaryDirectory();
  const manifest = assertManifest(
    JSON.parse(
      await fs.readFile(
        new URL(
          "../apps/web/e2e/fixtures/photos-manifest.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  manifest.source = { provider: "local" };
  manifest.indexes = { cameras: [], lenses: [] };
  manifest.photos = manifest.photos.slice(0, 2).map((photo, index) => ({
    ...photo,
    s3Key: index === 0 ? "deploy/amber.jpg" : "deploy/blue sky.png",
    originalUrl:
      index === 0
        ? "/originals/deploy/amber.jpg"
        : "/originals/deploy/blue%20sky.png",
    video: undefined,
  }));
  await write(
    workspace,
    "generated/photos-manifest.json",
    JSON.stringify(manifest),
  );
  for (const file of [
    "index.html",
    "feed.xml",
    "sitemap.xml",
    "sw.js",
    "assets/gallery-index.0123456789.json",
  ]) {
    await write(workspace, `apps/web/dist/${file}`, "fixture");
  }
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  for (const photo of manifest.photos) {
    await write(workspace, `photos/${photo.s3Key}`, image);
    await write(workspace, `apps/web/dist/originals/${photo.s3Key}`, image);
    await write(workspace, `apps/web/dist${photo.thumbnailUrl}`, image);
    await write(
      workspace,
      `apps/web/dist/photos/${photo.id}/index.html`,
      `<meta property="og:image" content="${photo.id}">`,
    );
  }
  return { workspace, manifest };
};

describe("clean deployment output verification", () => {
  it("verifies generated local manifest, decoded media URLs and every photo shell", async () => {
    const { workspace } = await prepareOutput();
    await expect(
      verifyDeployOutput(workspace, builderOutput),
    ).resolves.toBeUndefined();
  });

  it("rejects a build that never invoked the actual CLI", async () => {
    await expect(
      verifyDeployOutput("/unused", "[precheck] Skipping builder"),
    ).rejects.toThrow(/real Builder CLI/);
  });

  it("rejects a missing thumbnail even when the manifest and page were emitted", async () => {
    const { workspace, manifest } = await prepareOutput();
    await fs.rm(
      path.join(workspace, "apps/web/dist", manifest.photos[0].thumbnailUrl),
    );
    await expect(
      verifyDeployOutput(workspace, builderOutput),
    ).rejects.toThrow();
  });

  it("rejects an original that differs from the synthetic input", async () => {
    const { workspace, manifest } = await prepareOutput();
    await write(
      workspace,
      `photos/${manifest.photos[0].s3Key}`,
      "different original",
    );
    await expect(verifyDeployOutput(workspace, builderOutput)).rejects.toThrow(
      /differs from its source/,
    );
  });
});
