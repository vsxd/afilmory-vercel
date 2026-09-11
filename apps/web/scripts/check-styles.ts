import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";

import type { StyleSource } from "./style-contract";
import {
  PUBLIC_STYLE_UTILITIES,
  validateCompiledUtilities,
  validateStyleSources,
} from "./style-contract";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(webRoot, "../..");

async function readSources(directory: string): Promise<StyleSource[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(
    entries.map(async (entry): Promise<StyleSource[]> => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return ["__tests__", "__mocks__", "test", "node_modules"].includes(
          entry.name,
        )
          ? []
          : readSources(path);
      }
      if (
        !entry.isFile() ||
        !/\.(?:css|tsx?)$/.test(entry.name) ||
        /\.(?:test|spec|d)\.tsx?$/.test(entry.name)
      )
        return [];
      return [{ path, content: await readFile(path, "utf8") }];
    }),
  );
  return sources.flat();
}

export async function checkStyles(): Promise<void> {
  const sources = (
    await Promise.all([
      readSources(resolve(webRoot, "src")),
      readSources(resolve(workspaceRoot, "packages/ui/src")),
      readSources(resolve(workspaceRoot, "packages/webgl-viewer/src")),
    ])
  ).flat();
  const cssSources = sources.filter((source) => source.path.endsWith(".css"));
  const diagnostics = validateStyleSources(
    cssSources,
    sources.filter((source) => !source.path.endsWith(".css")),
  );
  if (diagnostics.length > 0) {
    throw new Error(
      diagnostics
        .map(
          ({ path, line, message }) =>
            `${relative(workspaceRoot, path)}:${line}: ${message}`,
        )
        .join("\n"),
    );
  }

  const entry = resolve(webRoot, "src/styles/index.css");
  // The real entry resolves all plugins, tokens and framework imports. Only
  // candidate discovery is augmented so each public utility is exercised even
  // when its last consumer is removed. No generated files are written.
  const input = await readFile(entry, "utf8");
  const probe = `\n@source inline("${Object.keys(PUBLIC_STYLE_UTILITIES).join(" ")}");\n`;
  const result = await postcss([
    tailwindcss({ base: webRoot, optimize: false }),
  ]).process(input + probe, { from: entry });
  const missing = validateCompiledUtilities(result.css);
  if (missing.length > 0) throw new Error(missing.join("\n"));
  process.stdout.write(
    `Style contracts passed (${cssSources.length} owned CSS files; real Tailwind entry compiled).\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  checkStyles().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
