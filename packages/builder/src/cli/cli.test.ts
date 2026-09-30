import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const builderRoot = fileURLToPath(new URL("../..", import.meta.url));
const repositoryRoot = path.resolve(builderRoot, "../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function runCli(args: string[], withConfig = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "afilmory-cli-"));
  temporaryDirectories.push(root);
  const isolatedBuilder = path.join(root, "packages/builder");
  await fs.mkdir(isolatedBuilder, { recursive: true });
  await fs.cp(
    path.join(builderRoot, "src"),
    path.join(isolatedBuilder, "src"),
    { recursive: true },
  );
  await fs.copyFile(
    path.join(builderRoot, "package.json"),
    path.join(isolatedBuilder, "package.json"),
  );
  // Reuse code dependencies only; never copy the repository's config, env or media.
  await fs.symlink(
    path.join(repositoryRoot, "node_modules"),
    path.join(root, "node_modules"),
    "dir",
  );
  await fs.symlink(
    path.join(builderRoot, "node_modules"),
    path.join(isolatedBuilder, "node_modules"),
    "dir",
  );
  const emptyPath = path.join(root, "empty-path");
  const emptyEnv = path.join(root, "empty.env");
  const ttyShim = path.join(root, "tty.mjs");
  await fs.mkdir(emptyPath);
  await fs.writeFile(emptyEnv, "");
  // Exercise the actual TUI branch while capturing terminal escape sequences.
  await fs.writeFile(
    ttyShim,
    'Object.defineProperty(process.stdout, "isTTY", { value: true });\nObject.defineProperty(process.stdout, "columns", { value: 80 });\n',
  );
  if (withConfig)
    await fs.writeFile(
      path.join(root, "builder.config.ts"),
      'export default { storage: { provider: "local", basePath: "photos" }, system: { observability: { showProgress: true } } };\n',
    );
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      "--import",
      ttyShim,
      path.join(isolatedBuilder, "src/cli.ts"),
      ...args,
    ],
    {
      cwd: root,
      env: {
        PATH: emptyPath,
        DOTENV_CONFIG_PATH: emptyEnv,
        TSX_DISABLE_CACHE: "1",
        NO_COLOR: "1",
      },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  return {
    status: child.status,
    output: child.stdout + child.stderr,
    files: await fs.readdir(root),
  };
}

describe("Builder CLI startup failures", () => {
  it("reports missing Perl before acquiring the TUI or creating build artifacts", async () => {
    const result = await runCli([]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("exiftool requires Perl");
    expect(result.output).not.toContain("\u001b[?25l");
    expect(result.output).not.toContain("Run mode:");
    expect(result.files).not.toContain("generated");
    expect(result.files).not.toContain("apps");
  }, 15000);

  it("shows help without configuration or Perl", async () => {
    const result = await runCli(["--help"], false);
    expect(result.status).toBe(0);
    expect(result.output).toContain("Usage:");
    expect(result.output).not.toContain("exiftool requires Perl");
    expect(result.output).not.toContain("\u001b[?25l");
  }, 15000);

  it("shows configuration without requiring Perl or attaching a TUI", async () => {
    const result = await runCli(["--config"]);
    expect(result.status).toBe(0);
    expect(result.output).toContain("Storage provider: local");
    expect(result.output).not.toContain("exiftool requires Perl");
    expect(result.output).not.toContain("\u001b[?25l");
  }, 15000);

  it("reports invalid configuration before runtime or terminal setup", async () => {
    const result = await runCli([], false);
    expect(result.status).toBe(1);
    expect(result.output).toContain("Missing storage config");
    expect(result.output).not.toContain("exiftool requires Perl");
    expect(result.output).not.toContain("\u001b[?25l");
  }, 15000);
});
