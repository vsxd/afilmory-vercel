import fs from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import ts from "typescript";

interface SourceImport {
  specifier: string;
  runtime: boolean;
}

interface Workspace {
  directory: string;
  name: string;
  options: ts.CompilerOptions;
  exports: ReadonlySet<string>;
}

const isTestFile = (file: string) =>
  /\.(?:test|spec)\.[cm]?[jt]sx?$|\/(?:__tests__|__mocks__|test)\//.test(file);

/** Dynamic imports participate in boundary checks, but not static ESM cycles. */
function sourceImports(file: string, source: string): SourceImport[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports: SourceImport[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      let runtime = true;
      if (ts.isImportDeclaration(node) && node.importClause) {
        const clause = node.importClause;
        const bindings = clause.namedBindings;
        runtime =
          !clause.isTypeOnly &&
          Boolean(
            clause.name ||
            !bindings ||
            ts.isNamespaceImport(bindings) ||
            bindings.elements.length === 0 ||
            bindings.elements.some((entry) => !entry.isTypeOnly),
          );
      } else if (ts.isExportDeclaration(node)) {
        runtime =
          !node.isTypeOnly &&
          (!node.exportClause ||
            !ts.isNamedExports(node.exportClause) ||
            node.exportClause.elements.some((entry) => !entry.isTypeOnly));
      }
      imports.push({ specifier: node.moduleSpecifier.text, runtime });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ specifier: node.arguments[0].text, runtime: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return imports;
}

/** Report strongly connected components once, with deterministic file ordering. */
function cycles(graph: Map<string, string[]>): string[][] {
  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const result: string[][] = [];
  const visit = (file: string) => {
    const index = nextIndex++;
    indexes.set(file, index);
    lowLinks.set(file, index);
    stack.push(file);
    active.add(file);
    for (const dependency of graph.get(file) ?? []) {
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(
          file,
          Math.min(lowLinks.get(file)!, lowLinks.get(dependency)!),
        );
      } else if (active.has(dependency)) {
        lowLinks.set(
          file,
          Math.min(lowLinks.get(file)!, indexes.get(dependency)!),
        );
      }
    }
    if (lowLinks.get(file) !== index) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      active.delete(member);
      component.push(member);
    } while (member !== file);
    if (component.length > 1 || graph.get(file)?.includes(file))
      result.push(component.sort());
  };
  for (const file of graph.keys()) if (!indexes.has(file)) visit(file);
  return result;
}

export async function validateSourceArchitecture(
  rootDir: string,
): Promise<string[]> {
  const issues: string[] = [];
  const workspaces: Workspace[] = [];
  for (const manifestPath of await fg(
    ["apps/*/package.json", "packages/*/package.json"],
    { cwd: rootDir },
  )) {
    const directory = path.join(rootDir, path.dirname(manifestPath));
    const manifest = JSON.parse(
      await fs.readFile(path.join(rootDir, manifestPath), "utf8"),
    ) as { name: string; exports?: Record<string, unknown> };
    const configPath = path.join(directory, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error)
      throw new Error(
        ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
      );
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      directory,
    );
    workspaces.push({
      directory,
      name: manifest.name,
      options: parsed.options,
      exports: new Set(Object.keys(manifest.exports ?? {})),
    });
  }
  const graph = new Map<string, string[]>();
  const relative = (file: string) =>
    path.relative(rootDir, file).replaceAll(path.sep, "/");
  const owner = (file: string) =>
    workspaces.find(({ directory }) =>
      file.startsWith(`${directory}${path.sep}`),
    );
  for (const workspace of workspaces) {
    const files = await fg(["src/**/*.{ts,tsx,js,mjs}"], {
      cwd: workspace.directory,
      absolute: true,
    });
    const cache = ts.createModuleResolutionCache(
      workspace.directory,
      (name) => name,
      workspace.options,
    );
    for (const file of files.sort()) {
      if (isTestFile(file) || file.endsWith(".d.ts")) continue;
      const from = relative(file);
      const edges: string[] = [];
      graph.set(from, edges);
      for (const { specifier, runtime } of sourceImports(
        file,
        await fs.readFile(file, "utf8"),
      )) {
        const importedWorkspace = workspaces.find(
          ({ name }) => specifier === name || specifier.startsWith(`${name}/`),
        );
        if (importedWorkspace) {
          const subpath = `.${specifier.slice(importedWorkspace.name.length)}`;
          if (!importedWorkspace.exports.has(subpath)) {
            issues.push(`${from}: ${specifier} is not a public package export`);
          }
        }
        // Asset loaders do not evaluate the imported source as a module.
        if (specifier.includes("?")) continue;
        const resolved = ts.resolveModuleName(
          specifier,
          file,
          workspace.options,
          ts.sys,
          cache,
        ).resolvedModule;
        if (!resolved) continue; // Unresolved imports belong to tsc, not this graph.
        const target = resolved.resolvedFileName;
        const to = relative(target);
        const targetWorkspace = owner(target);
        if (isTestFile(target))
          issues.push(`${from}: production module imports test code ${to}`);
        if (
          targetWorkspace &&
          targetWorkspace !== workspace &&
          !specifier.startsWith(`${targetWorkspace.name}/`) &&
          specifier !== targetWorkspace.name
        ) {
          issues.push(
            `${from}: import ${to} through the public ${targetWorkspace.name} package API`,
          );
        }
        if (
          from.startsWith("packages/ui/src/") &&
          to.startsWith("packages/schema/src/")
        ) {
          issues.push(`${from}: UI must not depend on manifest schema`);
        }
        if (
          from.startsWith("apps/web/src/lib/") &&
          /^apps\/web\/src\/(?:components|modules|pages)\//.test(to)
        ) {
          issues.push(
            `${from}: core service imports presentation module ${to}`,
          );
        }
        if (
          from.startsWith("apps/web/src/lib/image-convert/") &&
          to === "apps/web/src/i18n.ts"
        ) {
          issues.push(
            `${from}: conversion core must publish facts instead of importing i18n`,
          );
        }
        if (
          runtime &&
          targetWorkspace &&
          !isTestFile(target) &&
          !target.endsWith(".d.ts") &&
          /\.[cm]?[jt]sx?$/.test(target)
        )
          edges.push(to);
      }
    }
  }
  for (const component of cycles(graph))
    issues.push(`Static runtime cycle: ${component.join(", ")}`);
  return [...new Set(issues)].sort();
}
