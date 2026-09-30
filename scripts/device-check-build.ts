import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  await build(deviceBuildConfig(directory, process.argv[3] === "real"));
}
