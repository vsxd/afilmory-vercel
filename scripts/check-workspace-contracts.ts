/* eslint-disable no-console */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import fg from "fast-glob";
import ts from "typescript";

import { validateSourceArchitecture } from "./check-source-architecture.js";

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
  license?: string;
  name: string;
  peerDependencies?: Record<string, string>;
  private?: boolean;
  scripts?: Record<string, string>;
}

interface AnlManifest {
  classifications: Array<{ license: string; paths: string[] }>;
  format: string;
  version: number;
}

const EXPECTED_LICENSES: Record<string, string> = {
  "apps/web": "SEE LICENSE IN ../../LICENSE",
  "packages/build-assets": "MIT",
  "packages/builder": "SEE LICENSE IN ../../LICENSE",
  "packages/media": "MIT",
  "packages/schema": "MIT",
  "packages/ui": "MIT",
  "packages/webgl-viewer": "MIT",
};

const INTERNAL_ALIASES = new Set([
  "@config",
  "@env",
  "@locales",
  "@pkg",
  "virtual:pwa-register",
]);

const packageNameFromSpecifier = (specifier: string): string => {
  if (specifier.startsWith("@")) {
    return specifier.split("/", 2).join("/");
  }
  return specifier.split("/", 1)[0];
};

const collectImportSpecifiers = (
  source: string,
  fileName: string,
): string[] => {
  const imports = new Set<string>();
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      imports.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...imports];
};

const isExternalSpecifier = (specifier: string): boolean =>
  !specifier.startsWith(".") &&
  !specifier.startsWith("/") &&
  !specifier.startsWith("node:") &&
  !specifier.startsWith("~/") &&
  !specifier.startsWith("@locales/") &&
  !specifier.startsWith("virtual:") &&
  !INTERNAL_ALIASES.has(packageNameFromSpecifier(specifier));

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await fs.readFile(filePath, "utf-8")) as T;

export const validateWorkspaceContracts = async (
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
): Promise<string[]> => {
  const issues: string[] = [];
  const rootManifest = await readJson<PackageManifest>(
    path.join(rootDir, "package.json"),
  );
  const anlManifest = await readJson<AnlManifest>(
    path.join(rootDir, "ANL-MANIFEST"),
  );
  const packageJsonPaths = await fg(
    ["apps/*/package.json", "packages/*/package.json"],
    { cwd: rootDir, onlyFiles: true },
  );
  const workspaceNames = new Set<string>();
  const pinnedNodeVersion = (
    await fs.readFile(path.join(rootDir, ".node-version"), "utf-8")
  ).trim();

  if (anlManifest.format !== "ANL-MANIFEST" || anlManifest.version !== 1) {
    issues.push("ANL-MANIFEST: unsupported or missing format/version");
  }

  if (!rootManifest.scripts?.["type-check"]?.includes("pnpm -r")) {
    issues.push(
      "root: type-check must discover workspace scripts with pnpm -r instead of maintaining a manual package list",
    );
  }
  if (!rootManifest.engines?.node?.includes(pinnedNodeVersion)) {
    issues.push(
      `root: .node-version ${pinnedNodeVersion} must appear in engines.node`,
    );
  }

  const requiredRootTools = [
    "eslint",
    "prettier",
    "simple-git-hooks",
    "tsx",
    "typescript",
    "vitest",
  ];
  for (const dependency of requiredRootTools) {
    if (!rootManifest.devDependencies?.[dependency]) {
      issues.push(
        `root: script tool ${dependency} must be a direct devDependency`,
      );
    }
  }

  for (const manifestPath of packageJsonPaths.sort()) {
    const directory = path.dirname(manifestPath);
    const manifest = await readJson<PackageManifest>(
      path.join(rootDir, manifestPath),
    );
    workspaceNames.add(manifest.name);

    if (manifest.private !== true) {
      issues.push(
        `${directory}: workspace packages must be private by default`,
      );
    }
    if (!manifest.scripts?.["type-check"]) {
      issues.push(`${directory}: missing type-check script`);
    }
    const expectedLicense = EXPECTED_LICENSES[directory];
    if (!expectedLicense) {
      issues.push(`${directory}: add an explicit license classification`);
    } else if (manifest.license !== expectedLicense) {
      issues.push(
        `${directory}: expected license ${expectedLicense}, found ${manifest.license ?? "(missing)"}`,
      );
    }
    const licenseTarget = `${directory}/package.json`;
    const anlClassification = anlManifest.classifications.find(({ paths }) =>
      paths.some((pattern) =>
        pattern.endsWith("/**")
          ? licenseTarget.startsWith(pattern.slice(0, -2))
          : pattern === licenseTarget,
      ),
    );
    const expectedAnlLicense = expectedLicense === "MIT" ? "MIT" : "AGPL";
    if (!anlClassification?.license.includes(expectedAnlLicense)) {
      issues.push(
        `${directory}: package license disagrees with ANL-MANIFEST classification`,
      );
    }

    const directDeclarations = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const sourceFiles = await fg(["src/**/*.{js,mjs,ts,tsx}"], {
      absolute: true,
      cwd: path.join(rootDir, directory),
      ignore: [
        "**/*.test.*",
        "**/*.spec.*",
        "**/__mocks__/**",
        "**/__tests__/**",
        "**/test/**",
      ],
      onlyFiles: true,
    });
    for (const sourceFile of sourceFiles) {
      const source = await fs.readFile(sourceFile, "utf-8");
      for (const specifier of collectImportSpecifiers(source, sourceFile)) {
        if (!isExternalSpecifier(specifier)) continue;
        const importedPackage = packageNameFromSpecifier(specifier);
        if (!directDeclarations.has(importedPackage)) {
          issues.push(
            `${path.relative(rootDir, sourceFile)}: import ${importedPackage} is not a direct dependency, devDependency, or peerDependency of ${manifest.name}`,
          );
        }
      }
    }
  }

  for (const manifestPath of packageJsonPaths) {
    const manifest = await readJson<PackageManifest>(
      path.join(rootDir, manifestPath),
    );
    const declarations = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    };
    for (const dependency of Object.keys(declarations)) {
      if (
        dependency.startsWith("@afilmory/") &&
        !workspaceNames.has(dependency)
      ) {
        issues.push(
          `${path.dirname(manifestPath)}: declares unknown workspace package ${dependency}`,
        );
      }
    }
  }

  issues.push(...(await validateSourceArchitecture(rootDir)));
  return [...new Set(issues)].sort();
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const issues = await validateWorkspaceContracts();
  if (issues.length > 0) {
    console.error(
      [
        "Workspace contract violations:",
        ...issues.map((issue) => `- ${issue}`),
      ].join("\n"),
    );
    process.exitCode = 1;
  } else {
    console.info("Workspace contracts are consistent.");
  }
}
