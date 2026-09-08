import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateSourceArchitecture } from "./check-source-architecture";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "afilmory-architecture-"),
  );
  roots.push(root);
  const entries = {
    "apps/web/package.json": JSON.stringify({
      name: "@afilmory/web",
      exports: { ".": "./src/index.ts" },
    }),
    "apps/web/tsconfig.json": JSON.stringify({
      compilerOptions: {
        moduleResolution: "bundler",
        paths: { "~/*": ["./src/*"] },
      },
    }),
    "packages/ui/package.json": JSON.stringify({
      name: "@afilmory/ui",
      exports: { ".": "./src/index.ts" },
    }),
    "packages/ui/tsconfig.json": "{}",
    ...files,
  };
  for (const [file, source] of Object.entries(entries)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), source);
  }
  return root;
}

describe("source architecture", () => {
  it("detects cycles through aliases, re-exports and JS extension substitution", async () => {
    const root = await fixture({
      "apps/web/src/index.ts": 'export { value } from "~/other";',
      "apps/web/src/other.ts": 'import "./index.js"; export const value = 1;',
    });
    expect(await validateSourceArchitecture(root)).toEqual([
      "Static runtime cycle: apps/web/src/index.ts, apps/web/src/other.ts",
    ]);
  });

  it("excludes type-only, dynamic, asset-loader and test cycles from the static runtime graph", async () => {
    const root = await fixture({
      "apps/web/src/index.ts":
        'import type { A } from "./a"; import { type B } from "./b"; export type { C } from "./c"; export { type D } from "./d"; import("./lazy"); import raw from "./raw?raw";',
      ...Object.fromEntries(
        ["a", "b", "c", "d", "lazy", "raw", "index.test"].map((name) => [
          `apps/web/src/${name}.ts`,
          'import "./index";',
        ]),
      ),
    });
    expect(await validateSourceArchitecture(root)).toEqual([]);
  });

  it("rejects production-to-test imports including dynamic and type imports", async () => {
    const root = await fixture({
      "apps/web/src/index.ts":
        'import type { Fixture } from "./test/fixture"; import("./index.test");',
      "apps/web/src/test/fixture.ts": "export interface Fixture {}",
      "apps/web/src/index.test.ts": "export {};",
    });
    expect(await validateSourceArchitecture(root)).toEqual([
      "apps/web/src/index.ts: production module imports test code apps/web/src/index.test.ts",
      "apps/web/src/index.ts: production module imports test code apps/web/src/test/fixture.ts",
    ]);
  });

  it("rejects alias-based presentation imports and package API bypasses", async () => {
    const root = await fixture({
      "apps/web/src/lib/core.ts":
        'import "~/components/view"; import "../../../../packages/ui/src/private"; import "@afilmory/ui/src/private";',
      "apps/web/src/components/view.ts": "export {};",
      "packages/ui/src/private.ts": "export {};",
    });
    expect(await validateSourceArchitecture(root)).toEqual([
      "apps/web/src/lib/core.ts: @afilmory/ui/src/private is not a public package export",
      "apps/web/src/lib/core.ts: core service imports presentation module apps/web/src/components/view.ts",
      "apps/web/src/lib/core.ts: import packages/ui/src/private.ts through the public @afilmory/ui package API",
    ]);
  });

  it("keeps conversion facts independent from global translations", async () => {
    const root = await fixture({
      "apps/web/src/lib/image-convert/strategy.ts": 'import "~/i18n";',
      "apps/web/src/i18n.ts": "export {};",
    });
    expect(await validateSourceArchitecture(root)).toEqual([
      "apps/web/src/lib/image-convert/strategy.ts: conversion core must publish facts instead of importing i18n",
    ]);
  });
});
