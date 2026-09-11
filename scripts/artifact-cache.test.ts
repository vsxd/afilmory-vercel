import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { THUMBNAIL_ENCODING_SIGNATURE } from "@afilmory/builder/thumbnail-encoding";
import { createEmptyManifest } from "@afilmory/schema";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactCacheConfig } from "./artifact-cache";
import {
  assertSafeCacheTarget,
  createAskpassRepoUrl,
  createConfig,
  DEFAULT_CACHE_BRANCH,
  restoreArtifacts,
  saveArtifacts,
} from "./artifact-cache";

const TOKEN = "secret-token";
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

interface RecordedSpawnEnv {
  // spawn 时刻 GIT_ASKPASS 指向的文件是否存在、其权限位和内容——askpass
  // 文件生命周期（进入前创建、结束后删除）只能在 spawn 现场观测。
  askpassContent: string | null;
  askpassExists: boolean;
  askpassMode: number | null;
  env: NodeJS.ProcessEnv;
}

// 记录每次 spawn 的完整命令行 + 环境，并允许每个用例按命令定制退出码/输出，
// 这样无需真实 git 仓库即可验证 save 的命令序列（orphan + force-push）
// 以及凭据传递方式（token 只进 env、不进 argv）。
const spawnState = vi.hoisted(() => ({
  recorded: [] as string[][],
  recordedEnvs: [] as RecordedSpawnEnv[],
  respond: (
    _args: string[],
  ): { code: number; stderr: string; stdout: string } => ({
    code: 0,
    stderr: "",
    stdout: "",
  }),
}));

/* eslint-disable unicorn/prefer-event-target -- ChildProcess 本身就是
   EventEmitter，这里刻意用它来模拟 spawn 返回值。 */
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  const { existsSync, readFileSync, statSync } = await import("node:fs");
  return {
    spawn: (
      command: string,
      args: string[],
      options: { env?: NodeJS.ProcessEnv },
    ) => {
      spawnState.recorded.push([command, ...args]);
      const env = options?.env ?? {};
      const askpassPath = env.GIT_ASKPASS;
      const askpassExists = Boolean(askpassPath && existsSync(askpassPath));
      spawnState.recordedEnvs.push({
        askpassContent:
          askpassPath && askpassExists
            ? readFileSync(askpassPath, "utf-8")
            : null,
        askpassExists,
        askpassMode:
          askpassPath && askpassExists
            ? statSync(askpassPath).mode & 0o777
            : null,
        env,
      });
      const child = Object.assign(new EventEmitter(), {
        stderr: new EventEmitter(),
        stdout: new EventEmitter(),
      });
      const { code, stderr, stdout } = spawnState.respond(args);
      process.nextTick(() => {
        if (stdout) child.stdout.emit("data", Buffer.from(stdout));
        if (stderr) child.stderr.emit("data", Buffer.from(stderr));
        child.emit("close", code);
      });
      return child;
    },
  };
});
/* eslint-enable unicorn/prefer-event-target */

describe("createAskpassRepoUrl", () => {
  it("returns a credential-less https URL with only the fixed username", () => {
    expect(createAskpassRepoUrl("https://github.com/owner/repo.git")).toBe(
      "https://x-access-token@github.com/owner/repo.git",
    );
  });

  it("keeps a user-supplied username but strips any embedded password", () => {
    expect(
      // secret-scan: allow -- synthetic credential-stripping fixture
      createAskpassRepoUrl("https://alice:hunter2@github.com/owner/repo.git"),
    ).toBe("https://alice@github.com/owner/repo.git");
  });

  it("refuses to send the token over plaintext HTTP", () => {
    expect(() => createAskpassRepoUrl("http://example.com/repo.git")).toThrow(
      /plaintext HTTP/,
    );
  });

  it("allows http only for localhost (local testing)", () => {
    expect(createAskpassRepoUrl("http://localhost:3000/repo.git")).toBe(
      "http://x-access-token@localhost:3000/repo.git",
    );
  });

  it("leaves scp-style git URLs untouched (ssh auth does not use the token)", () => {
    const scp = "git@github.com:owner/repo.git";
    expect(createAskpassRepoUrl(scp)).toBe(scp);
  });
});

describe("artifact cache destination safety", () => {
  const baseConfig: ArtifactCacheConfig = {
    allowHistoryRewrite: false,
    cacheDir: "/tmp/cache",
    locationMode: "exact",
    repoBranch: DEFAULT_CACHE_BRANCH,
    repoToken: TOKEN,
    repoUrl: "https://github.com/owner/cache.git",
    rootDir: "/tmp/source",
  };

  it("uses a dedicated branch and non-destructive history by default", () => {
    expect(
      createConfig({
        REPO_TOKEN: TOKEN,
        REPO_URL: "https://github.com/owner/cache.git",
      }),
    ).toMatchObject({
      allowHistoryRewrite: false,
      locationMode: "coarse",
      repoBranch: DEFAULT_CACHE_BRANCH,
    });
  });

  it.each(["main", "master", "production", "develop"])(
    "rejects protected cache branch %s",
    (repoBranch) => {
      expect(() =>
        assertSafeCacheTarget({ ...baseConfig, repoBranch }),
      ).toThrow(/protected branch/);
    },
  );

  it("rejects the source repository even when URL syntaxes differ", () => {
    expect(() =>
      assertSafeCacheTarget(
        {
          ...baseConfig,
          repoUrl: "https://github.com/Owner/Afilmory.git",
        },
        "git@github.com:owner/afilmory.git",
      ),
    ).toThrow(/source repository/);
  });
});

describe("saveArtifacts", () => {
  let rootDir: string;
  let config: ArtifactCacheConfig;

  const gitCommands = (): string[][] =>
    spawnState.recorded
      .filter(([command]) => command === "git")
      .map(([, ...args]) => args);

  const setRespond = (overrides: {
    populateClone?: (cacheDir: string) => void;
    remoteHead?: string;
    status?: string;
    failPushWith?: string;
  }): void => {
    spawnState.respond = (args) => {
      if (args[0] === "clone" && overrides.populateClone) {
        const cloneDir = args.at(-1)!;
        mkdirSync(cloneDir, { recursive: true });
        overrides.populateClone(cloneDir);
      }
      if (args[0] === "status") {
        return { code: 0, stderr: "", stdout: overrides.status ?? "" };
      }
      if (args[0] === "rev-parse") {
        return {
          code: 0,
          stderr: "",
          stdout: overrides.remoteHead ?? "0123456789abcdef\n",
        };
      }
      if (args[0] === "push" && overrides.failPushWith !== undefined) {
        return { code: 128, stderr: overrides.failPushWith, stdout: "" };
      }
      return { code: 0, stderr: "", stdout: "" };
    };
  };

  beforeEach(async () => {
    spawnState.recorded = [];
    spawnState.recordedEnvs = [];
    setRespond({});
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-cache-test-"));
    config = {
      allowHistoryRewrite: false,
      cacheDir: path.join(rootDir, "apps/web/assets-git"),
      locationMode: "exact",
      repoBranch: DEFAULT_CACHE_BRANCH,
      repoToken: TOKEN,
      repoUrl: "https://github.com/owner/cache.git",
      rootDir,
    };
    // 成功路径准备完整的本地产物；缺失产物的告警由 restoreArtifacts 的
    // 专门用例覆盖，不能作为这些安全/命令序列测试里的隐式噪声。
    await fs.mkdir(path.join(rootDir, "generated"), { recursive: true });
    await fs.writeFile(
      path.join(rootDir, "generated/photos-manifest.json"),
      JSON.stringify(createEmptyManifest()),
    );
    await fs.writeFile(
      path.join(rootDir, "generated/geocoding-cache.json"),
      "{}",
    );
    await fs.mkdir(path.join(rootDir, "apps/web/public/thumbnails"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(rootDir, "apps/web/public/thumbnails/example.jpg"),
      JPEG_BYTES,
    );
  });

  afterEach(async () => {
    await fs.rm(rootDir, { force: true, recursive: true });
  });

  it("commits and pushes without rewriting history by default", async () => {
    setRespond({ status: " M geocoding-cache.json\n" });

    await saveArtifacts(config);

    const commands = gitCommands();
    const cloneCommand = commands.find((args) => args[0] === "clone")!;
    expect(cloneCommand.slice(0, 2)).toEqual(["clone", "--depth=1"]);
    expect(cloneCommand).toContain("--single-branch");
    expect(cloneCommand).toContain(DEFAULT_CACHE_BRANCH);
    // token 不再嵌入 clone URL——argv 里只允许出现无凭据 URL。
    expect(cloneCommand).toContain(
      "https://x-access-token@github.com/owner/cache.git",
    );

    // 保留 bot 提交身份。
    expect(commands).toContainEqual([
      "config",
      "user.name",
      "Afilmory Cache Bot",
    ]);
    expect(commands).toContainEqual([
      "config",
      "user.email",
      "afilmory-cache@users.noreply.github.com",
    ]);

    const names = commands.map((args) => args.join(" "));
    const commitIndex = names.findIndex((c) => c.startsWith("commit"));
    const pushIndex = names.findIndex((c) => c.startsWith("push"));
    expect(names.some((c) => c.startsWith("checkout --orphan"))).toBe(false);
    expect(names).toContain("add --all");
    expect(commitIndex).toBeGreaterThan(-1);
    expect(pushIndex).toBeGreaterThan(commitIndex);

    expect(commands[pushIndex]).toEqual([
      "push",
      "origin",
      `HEAD:refs/heads/${DEFAULT_CACHE_BRANCH}`,
    ]);
  });

  it("compacts history only with opt-in and a precise force-with-lease", async () => {
    config.allowHistoryRewrite = true;
    setRespond({
      remoteHead: "fedcba9876543210\n",
      status: " M geocoding-cache.json\n",
    });

    await saveArtifacts(config);

    const commands = gitCommands();
    const names = commands.map((args) => args.join(" "));
    expect(names).toContain(
      `rev-parse --verify refs/remotes/origin/${DEFAULT_CACHE_BRANCH}`,
    );
    expect(names.some((c) => c.startsWith("checkout --orphan"))).toBe(true);
    expect(commands.at(-1)).toEqual([
      "push",
      `--force-with-lease=refs/heads/${DEFAULT_CACHE_BRANCH}:fedcba9876543210`,
      "origin",
      `HEAD:refs/heads/${DEFAULT_CACHE_BRANCH}`,
    ]);
  });

  it("bootstraps a missing cache branch by cloning the default branch", async () => {
    setRespond({ status: " M photos-manifest.json\n" });
    const base = spawnState.respond;
    spawnState.respond = (args) => {
      if (args[0] === "clone" && args.includes("--branch")) {
        return {
          code: 128,
          stderr: `fatal: Remote branch ${DEFAULT_CACHE_BRANCH} not found in upstream origin`,
          stdout: "",
        };
      }
      return base(args);
    };

    await saveArtifacts(config);

    const commands = gitCommands();
    const clones = commands.filter((args) => args[0] === "clone");
    expect(clones).toHaveLength(2);
    expect(clones[1]).not.toContain("--branch");
    // push HEAD:refs/heads/<branch> 在远端创建缓存分支，完成引导。
    expect(commands.at(-1)).toEqual([
      "push",
      "origin",
      `HEAD:refs/heads/${DEFAULT_CACHE_BRANCH}`,
    ]);
  });

  it("accepts thumbnails named after legacy non-ASCII ids and ignores .DS_Store", async () => {
    setRespond({ status: " M thumbnails\n" });
    const thumbnailsDir = path.join(rootDir, "apps/web/public/thumbnails");
    await fs.writeFile(
      path.join(thumbnailsDir, ".encoding"),
      `${THUMBNAIL_ENCODING_SIGNATURE}\n`,
    );
    // 旧版 builder 原样复用的照片 id 可含 CJK、空格、括号，缩略图文件名
    // 嵌入这些 id——它们是合法产物，不能中止保存。
    await fs.writeFile(
      path.join(thumbnailsDir, "北京 IMG 0001 (2).0f3a.jpg"),
      JPEG_BYTES,
    );
    await fs.writeFile(path.join(thumbnailsDir, ".DS_Store"), "finder junk");

    await saveArtifacts(config);

    expect(gitCommands().some((args) => args[0] === "push")).toBe(true);
  });

  it("aborts the save when the encoding marker mismatches the current signature", async () => {
    setRespond({ status: " M thumbnails\n" });
    await fs.writeFile(
      path.join(rootDir, "apps/web/public/thumbnails/.encoding"),
      "jpeg-w600-q80-mozjpeg\n",
    );

    await expect(saveArtifacts(config)).rejects.toThrow(
      /invalid thumbnail encoding marker/,
    );
  });

  it.each(["coarse", "strip"] as const)(
    "removes legacy exact-coordinate caches when saving in %s mode",
    async (locationMode) => {
      config.locationMode = locationMode;
      setRespond({
        populateClone: (cacheDir) => {
          writeFileSync(
            path.join(cacheDir, "geocoding-cache.json"),
            '{"31.2304,121.4737":{"city":"private"}}',
          );
        },
        status: " D geocoding-cache.json\n",
      });

      await saveArtifacts(config);

      await expect(
        fs.access(path.join(rootDir, "generated/geocoding-cache.json")),
      ).rejects.toThrow();
      await expect(
        fs.access(path.join(config.cacheDir, "geocoding-cache.json")),
      ).rejects.toThrow();
      expect(gitCommands()).toContainEqual(["add", "--all"]);
    },
  );

  it("never puts the token into argv; it travels only via the askpass env", async () => {
    setRespond({ status: " M geocoding-cache.json\n" });

    await saveArtifacts(config);

    // argv（/proc、ps、CI 进程转储可见）里绝不允许出现 token。
    for (const commandLine of spawnState.recorded) {
      for (const part of commandLine) {
        expect(part).not.toContain(TOKEN);
        expect(part).not.toContain(encodeURIComponent(TOKEN));
      }
    }

    // 每次 git spawn 都必须带上 askpass 凭据 env（clone 和 push 需要认证，
    // 其余命令多带无害），token 只出现在子进程 env 里。
    expect(spawnState.recordedEnvs.length).toBeGreaterThan(0);
    for (const { env } of spawnState.recordedEnvs) {
      expect(env.GIT_ASKPASS).toBeTruthy();
      expect(env.AFILMORY_GIT_ASKPASS_PASSWORD).toBe(TOKEN);
      expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    }
  });

  it("creates the askpass helper as an owner-only file and removes it afterwards", async () => {
    setRespond({ status: " M geocoding-cache.json\n" });

    await saveArtifacts(config);

    // spawn 时刻 askpass 文件必须存在、权限为 0700（仅属主可读写执行），
    // 且内容不含 token——token 只走环境变量，不落盘。
    for (const {
      askpassContent,
      askpassExists,
      askpassMode,
    } of spawnState.recordedEnvs) {
      expect(askpassExists).toBe(true);
      expect(askpassMode).toBe(0o700);
      expect(askpassContent).not.toContain(TOKEN);
      expect(askpassContent).toContain("AFILMORY_GIT_ASKPASS_PASSWORD");
    }

    // 结束后 askpass 文件被清理。
    const askpassPath = spawnState.recordedEnvs[0].env.GIT_ASKPASS!;
    await expect(fs.access(askpassPath)).rejects.toThrow();
  });

  it("removes the askpass helper even when a git command fails", async () => {
    setRespond({
      status: " M geocoding-cache.json\n",
      failPushWith: "fatal: could not push",
    });

    await expect(saveArtifacts(config)).rejects.toThrow();

    const askpassPath = spawnState.recordedEnvs[0].env.GIT_ASKPASS!;
    await expect(fs.access(askpassPath)).rejects.toThrow();
  });

  it("uses the configured dedicated branch", async () => {
    setRespond({ status: " M geocoding-cache.json\n" });
    config.repoBranch = "cache";

    await saveArtifacts(config);

    const commands = gitCommands();
    const cloneCommand = commands.find((args) => args[0] === "clone")!;
    expect(cloneCommand).toContain("--branch");
    expect(cloneCommand).toContain("cache");
    expect(commands.some((args) => args[0] === "symbolic-ref")).toBe(false);
    expect(commands.at(-1)).toEqual([
      "push",
      "origin",
      "HEAD:refs/heads/cache",
    ]);
  });

  it("skips commit and push when the tree matches the fetched HEAD", async () => {
    setRespond({ status: "" });

    await saveArtifacts(config);

    const names = gitCommands().map((args) => args.join(" "));
    expect(names.some((c) => c.startsWith("checkout --orphan"))).toBe(false);
    expect(names.some((c) => c.startsWith("commit"))).toBe(false);
    expect(names.some((c) => c.startsWith("push"))).toBe(false);
    // 无变化时仍会走到 status 检查。
    expect(names).toContain("status --porcelain");
  });

  it("sanitizes the token out of failed subprocess output", async () => {
    setRespond({
      status: " M geocoding-cache.json\n",
      failPushWith: `fatal: could not push https://x:${TOKEN}@github.com/owner/cache.git`, // secret-scan: allow -- sanitizer fixture
    });

    let message = "";
    try {
      await saveArtifacts(config);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("[REPO_TOKEN]");
    expect(message).not.toContain(TOKEN);
  });
});

describe("restoreArtifacts", () => {
  let rootDir: string;
  let config: ArtifactCacheConfig;
  let warnSpy: MockInstance<typeof console.warn>;

  // fixture 必须在假 `git clone` 的现场（spawn mock 内、同步 fs）写入：
  // cloneCacheRepository 在 spawn 之前会先 rm 掉 cacheDir，beforeEach 里
  // 预置的文件会被抹掉。
  const setCloneFixtures = (populate: (cacheDir: string) => void): void => {
    spawnState.respond = (args) => {
      if (args[0] === "clone") {
        const cloneDir = args.at(-1)!;
        mkdirSync(cloneDir, { recursive: true });
        populate(cloneDir);
      }
      return { code: 0, stderr: "", stdout: "" };
    };
  };

  const warnings = (): string[] =>
    warnSpy.mock.calls.map((call) => String(call[0]));

  beforeEach(async () => {
    spawnState.recorded = [];
    spawnState.recordedEnvs = [];
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-cache-test-"));
    config = {
      allowHistoryRewrite: false,
      cacheDir: path.join(rootDir, "apps/web/assets-git"),
      locationMode: "exact",
      repoBranch: DEFAULT_CACHE_BRANCH,
      repoToken: TOKEN,
      repoUrl: "https://github.com/owner/cache.git",
      rootDir,
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(rootDir, { force: true, recursive: true });
  });

  it("restores a valid manifest, geocoding cache and thumbnails into the build tree", async () => {
    const manifest = JSON.stringify(createEmptyManifest());
    setCloneFixtures((cacheDir) => {
      writeFileSync(path.join(cacheDir, "photos-manifest.json"), manifest);
      writeFileSync(path.join(cacheDir, "geocoding-cache.json"), "{}");
      mkdirSync(path.join(cacheDir, "thumbnails"));
      writeFileSync(path.join(cacheDir, "thumbnails/a.jpg"), JPEG_BYTES);
    });

    await restoreArtifacts(config);

    await expect(
      fs.readFile(
        path.join(rootDir, "generated/photos-manifest.json"),
        "utf-8",
      ),
    ).resolves.toBe(manifest);
    await expect(
      fs.readFile(
        path.join(rootDir, "generated/geocoding-cache.json"),
        "utf-8",
      ),
    ).resolves.toBe("{}");
    await expect(
      fs.readFile(path.join(rootDir, "apps/web/public/thumbnails/a.jpg")),
    ).resolves.toEqual(JPEG_BYTES);
    expect(warnings()).toEqual([]);
  });

  it("restores a manifest with legacy-quirk entries instead of skipping the whole cache", async () => {
    // 一条旧数据瑕疵不能整体丢弃 manifest 缓存（否则每次部署全量重建）：
    // 消费方走宽松解析，坏条目逐条抢救/重建即可。
    const manifest = JSON.stringify({
      ...createEmptyManifest(),
      photos: [
        {
          id: "café".normalize("NFD"),
          originalUrl: "/originals/cafe.jpg",
          thumbnailUrl: "/thumbnails/cafe.jpg",
          s3Key: "photos/cafe.jpg",
        },
        { corrupt: true },
      ],
    });
    setCloneFixtures((cacheDir) => {
      writeFileSync(path.join(cacheDir, "photos-manifest.json"), manifest);
    });

    await restoreArtifacts(config);

    await expect(
      fs.readFile(
        path.join(rootDir, "generated/photos-manifest.json"),
        "utf-8",
      ),
    ).resolves.toBe(manifest);
    expect(warnings()).toContainEqual(
      expect.stringContaining("1 unusable entry"),
    );
  });

  it("keeps the existing manifest when the staging copy fails", async () => {
    const targetPath = path.join(rootDir, "generated/photos-manifest.json");
    const existingManifest = JSON.stringify({
      ...createEmptyManifest(),
      generatedAt: "2025-01-01T00:00:00.000Z",
    });
    const cachedManifest = JSON.stringify({
      ...createEmptyManifest(),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, existingManifest);
    setCloneFixtures((cacheDir) => {
      writeFileSync(
        path.join(cacheDir, "photos-manifest.json"),
        cachedManifest,
      );
    });
    vi.spyOn(fs, "cp").mockRejectedValueOnce(
      Object.assign(new Error("simulated staging ENOSPC"), { code: "ENOSPC" }),
    );

    await restoreArtifacts(config);

    await expect(fs.readFile(targetPath, "utf-8")).resolves.toBe(
      existingManifest,
    );
    expect(warnings()).toContainEqual(
      expect.stringContaining("simulated staging ENOSPC"),
    );
    const generatedEntries = await fs.readdir(path.dirname(targetPath));
    expect(
      generatedEntries.some((name) => name.includes("afilmory-staging")),
    ).toBe(false);
  });

  it("rolls back an existing thumbnail directory when the atomic swap fails", async () => {
    const targetPath = path.join(rootDir, "apps/web/public/thumbnails");
    await fs.mkdir(targetPath, { recursive: true });
    await fs.writeFile(path.join(targetPath, "existing.jpg"), JPEG_BYTES);
    setCloneFixtures((cacheDir) => {
      mkdirSync(path.join(cacheDir, "thumbnails"));
      writeFileSync(
        path.join(cacheDir, "thumbnails/replacement.jpg"),
        JPEG_BYTES,
      );
    });

    const realRename = fs.rename.bind(fs);
    let rejectedStagingCommit = false;
    vi.spyOn(fs, "rename").mockImplementation(
      async (sourcePath, destinationPath) => {
        if (
          !rejectedStagingCommit &&
          String(sourcePath).includes(".thumbnails.afilmory-staging-") &&
          path.resolve(String(destinationPath)) === path.resolve(targetPath)
        ) {
          rejectedStagingCommit = true;
          throw Object.assign(new Error("simulated directory rename failure"), {
            code: "EIO",
          });
        }
        await realRename(sourcePath, destinationPath);
      },
    );

    await restoreArtifacts(config);

    expect(rejectedStagingCommit).toBe(true);
    await expect(
      fs.readFile(path.join(targetPath, "existing.jpg")),
    ).resolves.toEqual(JPEG_BYTES);
    await expect(
      fs.access(path.join(targetPath, "replacement.jpg")),
    ).rejects.toThrow();
    expect(warnings()).toContainEqual(
      expect.stringContaining("simulated directory rename failure"),
    );
    const publicEntries = await fs.readdir(path.dirname(targetPath));
    expect(
      publicEntries.some(
        (name) =>
          name.includes("afilmory-staging") ||
          name.includes("afilmory-artifact-cache"),
      ),
    ).toBe(false);
  });

  it.each(["coarse", "strip"] as const)(
    "ignores remote and deletes local legacy exact caches in %s mode",
    async (locationMode) => {
      config.locationMode = locationMode;
      await fs.mkdir(path.join(rootDir, "generated"), { recursive: true });
      await fs.writeFile(
        path.join(rootDir, "generated/geocoding-cache.json"),
        '{"31.2304,121.4737":{"city":"private"}}',
      );
      const manifest = JSON.stringify(createEmptyManifest());
      setCloneFixtures((cacheDir) => {
        writeFileSync(path.join(cacheDir, "photos-manifest.json"), manifest);
        writeFileSync(
          path.join(cacheDir, "geocoding-cache.json"),
          '{"31.2304,121.4737":{"city":"private"}}',
        );
        mkdirSync(path.join(cacheDir, "thumbnails"));
        writeFileSync(path.join(cacheDir, "thumbnails/a.jpg"), JPEG_BYTES);
      });

      await restoreArtifacts(config);

      await expect(
        fs.access(path.join(rootDir, "generated/geocoding-cache.json")),
      ).rejects.toThrow();
      await expect(
        fs.access(path.join(rootDir, "generated/photos-manifest.json")),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(rootDir, "apps/web/public/thumbnails/a.jpg")),
      ).resolves.toBeUndefined();
    },
  );

  it("keeps a corrupt cached manifest out of generated/ but still restores later pairs", async () => {
    setCloneFixtures((cacheDir) => {
      // 合法 JSON 但不是合法 manifest——必须被 assertManifest 闸门拦下。
      writeFileSync(
        path.join(cacheDir, "photos-manifest.json"),
        '{"not":"a manifest"}',
      );
      mkdirSync(path.join(cacheDir, "thumbnails"));
      writeFileSync(path.join(cacheDir, "thumbnails/a.jpg"), JPEG_BYTES);
    });

    await restoreArtifacts(config);

    // 坏 manifest 绝不能落进 generated/……
    await expect(
      fs.access(path.join(rootDir, "generated/photos-manifest.json")),
    ).rejects.toThrow();
    // ……但第一个 pair 失败不阻断后续 pair（缩略图照常恢复）。
    await expect(
      fs.access(path.join(rootDir, "apps/web/public/thumbnails/a.jpg")),
    ).resolves.toBeUndefined();
    expect(warnings()).toContainEqual(
      expect.stringContaining("Could not restore photos manifest"),
    );
  });

  it("never copies symlinks from the untrusted cache repo", async () => {
    const secretPath = path.join(rootDir, "secret.txt");
    setCloneFixtures((cacheDir) => {
      writeFileSync(secretPath, "not-for-public");
      mkdirSync(path.join(cacheDir, "thumbnails"));
      writeFileSync(path.join(cacheDir, "thumbnails/real.jpg"), JPEG_BYTES);
      // 缓存仓库可被恶意 push：symlink 指向服务目录之外的文件，跟随复制的话
      // 会被静态站点从 public/ 直接对外提供。
      symlinkSync(secretPath, path.join(cacheDir, "thumbnails/evil.jpg"));
    });

    await restoreArtifacts(config);

    // Reject the whole directory atomically; do not restore a partial cache
    // after encountering an unsupported entry.
    await expect(
      fs.access(path.join(rootDir, "apps/web/public/thumbnails/real.jpg")),
    ).rejects.toThrow();
    await expect(
      fs.lstat(path.join(rootDir, "apps/web/public/thumbnails/evil.jpg")),
    ).rejects.toThrow();
    expect(warnings()).toContainEqual(
      expect.stringContaining("unsupported thumbnail cache entry"),
    );
  });

  it("rejects thumbnail files whose extension and magic bytes disagree", async () => {
    setCloneFixtures((cacheDir) => {
      mkdirSync(path.join(cacheDir, "thumbnails"));
      writeFileSync(path.join(cacheDir, "thumbnails/fake.jpg"), "not-a-jpeg");
    });

    await restoreArtifacts(config);

    await expect(
      fs.access(path.join(rootDir, "apps/web/public/thumbnails/fake.jpg")),
    ).rejects.toThrow();
    expect(warnings()).toContainEqual(
      expect.stringContaining("invalid magic bytes"),
    );
  });

  it("rejects nested or unexpected thumbnail cache entries", async () => {
    setCloneFixtures((cacheDir) => {
      mkdirSync(path.join(cacheDir, "thumbnails/nested"), { recursive: true });
      writeFileSync(
        path.join(cacheDir, "thumbnails/nested/photo.jpg"),
        JPEG_BYTES,
      );
    });

    await restoreArtifacts(config);

    await expect(
      fs.access(path.join(rootDir, "apps/web/public/thumbnails")),
    ).rejects.toThrow();
    expect(warnings()).toContainEqual(
      expect.stringContaining("unsupported thumbnail cache entry"),
    );
  });

  it("rejects a geocoding cache that is not a JSON object", async () => {
    setCloneFixtures((cacheDir) => {
      writeFileSync(path.join(cacheDir, "geocoding-cache.json"), "[]");
    });

    await restoreArtifacts(config);

    await expect(
      fs.access(path.join(rootDir, "generated/geocoding-cache.json")),
    ).rejects.toThrow();
    expect(warnings()).toContainEqual(
      expect.stringContaining("must contain a JSON object"),
    );
  });

  it("warns and continues when cached artifacts are missing", async () => {
    const manifest = JSON.stringify(createEmptyManifest());
    setCloneFixtures((cacheDir) => {
      writeFileSync(path.join(cacheDir, "photos-manifest.json"), manifest);
    });

    await restoreArtifacts(config);

    await expect(
      fs.access(path.join(rootDir, "generated/photos-manifest.json")),
    ).resolves.toBeUndefined();
    expect(warnings()).toContainEqual(
      expect.stringContaining("Missing cached geocoding cache"),
    );
    expect(warnings()).toContainEqual(
      expect.stringContaining("Missing cached thumbnails"),
    );
  });
});
