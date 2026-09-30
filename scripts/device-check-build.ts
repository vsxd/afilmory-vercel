import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A successful Vite build can still silently omit cwd-resolved icon collections. */
export async function assertDeviceIconStyles(directory: string) {
  const assets = path.join(directory, "assets");
  const files = (await fs.readdir(assets)).filter((file) =>
    file.endsWith(".css"),
  );
  const css = (
    await Promise.all(
      files.map((file) => fs.readFile(path.join(assets, file), "utf8")),
    )
  ).join("\n");
  for (const icon of ["search", "map-pin", "close"]) {
    if (!css.includes(`.i-mingcute-${icon}-line`)) {
      throw new Error(`Device build is missing the ${icon} icon style`);
    }
  }
}

export function deviceBuildConfig(directory: string, realLibrary: boolean) {
  return {
    root: path.join(root, "apps/web"),
    configFile: path.join(root, "apps/web/vite.config.ts"),
    configLoader: "runner" as const,
    mode: "production",
    // Neither Vite nor dotenv can inspect the repository's .env files.
    envDir: directory,
    publicDir: realLibrary
      ? path.join(root, "apps/web/public")
      : (false as const),
    build: { outDir: path.join(directory, "dist"), emptyOutDir: true },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const directory = process.argv[2];
  if (!directory) throw new Error("A temporary output directory is required");
  const config = deviceBuildConfig(directory, process.argv[3] === "real");
  // Match the normal app build. The icon plugin resolves its collection from
  // process.cwd(), independently of Vite's root option.
  process.chdir(config.root);
  await build(config);
  await assertDeviceIconStyles(config.build.outDir);
}
