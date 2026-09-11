/* eslint-disable no-console */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface PnpmDependency {
  dependencies?: Record<string, PnpmDependency>;
  optionalDependencies?: Record<string, PnpmDependency>;
  path?: string;
  version: string;
}

interface PnpmPackage {
  dependencies?: Record<string, PnpmDependency>;
  name: string;
  optionalDependencies?: Record<string, PnpmDependency>;
  path?: string;
  private?: boolean;
  version?: string;
}

interface SbomComponent {
  "bom-ref": string;
  name: string;
  purl: string;
  type: "application" | "library";
  version?: string;
}

const toPurl = (name: string, version?: string): string => {
  const encodedName = name.startsWith("@")
    ? `${encodeURIComponent(name.split("/")[0])}/${encodeURIComponent(name.split("/")[1] ?? "")}`
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}${version ? `@${encodeURIComponent(version)}` : ""}`;
};

const dependencyRecords = (
  dependency: Pick<PnpmDependency, "dependencies" | "optionalDependencies">,
) => ({
  ...dependency.dependencies,
  ...dependency.optionalDependencies,
});

export const createCycloneDxSbom = (packages: PnpmPackage[]) => {
  const rootPackage = packages[0];
  if (!rootPackage) throw new Error("pnpm returned an empty package graph");
  const rootReference = toPurl(rootPackage.name, rootPackage.version);
  const workspaceVersions = new Map(
    packages.map((pkg) => [pkg.name, pkg.version]),
  );
  const components = new Map<string, SbomComponent>();
  const dependencyGraph = new Map<string, Set<string>>();

  // Private workspace packages may omit their version. Their links must use
  // the same unversioned identity instead of inventing a separate 0.0.0 node.
  const resolveVersion = (name: string, version: string): string | undefined =>
    version.startsWith("link:") || version.startsWith("workspace:")
      ? workspaceVersions.get(name)
      : version;

  const visitDependency = (
    name: string,
    dependency: PnpmDependency,
  ): string => {
    const version = resolveVersion(name, dependency.version);
    const reference = toPurl(name, version);
    if (reference !== rootReference && !components.has(reference)) {
      components.set(reference, {
        "bom-ref": reference,
        name,
        purl: reference,
        type: "library",
        ...(version ? { version } : {}),
      });
    }
    const children = dependencyGraph.get(reference) ?? new Set<string>();
    dependencyGraph.set(reference, children);
    for (const [childName, child] of Object.entries(
      dependencyRecords(dependency),
    )) {
      children.add(visitDependency(childName, child));
    }
    return reference;
  };

  const rootDependencies = new Set<string>();
  dependencyGraph.set(rootReference, rootDependencies);
  // Register workspaces first so traversing a link cannot turn an application
  // into a library or replace the package's own dependency relationships.
  for (const pkg of packages) {
    if (pkg !== rootPackage) {
      const reference = toPurl(pkg.name, pkg.version);
      components.set(reference, {
        "bom-ref": reference,
        name: pkg.name,
        purl: reference,
        type: pkg.private ? "application" : "library",
        ...(pkg.version ? { version: pkg.version } : {}),
      });
      rootDependencies.add(reference);
    }
  }
  for (const pkg of packages) {
    const reference = toPurl(pkg.name, pkg.version);
    const children = dependencyGraph.get(reference) ?? new Set<string>();
    dependencyGraph.set(reference, children);
    for (const [name, dependency] of Object.entries(dependencyRecords(pkg))) {
      children.add(visitDependency(name, dependency));
    }
  }

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      component: {
        "bom-ref": rootReference,
        name: rootPackage.name,
        purl: rootReference,
        type: "application",
        ...(rootPackage.version ? { version: rootPackage.version } : {}),
      },
      tools: {
        components: [
          {
            name: "afilmory-sbom-generator",
            type: "application",
            ...(rootPackage.version ? { version: rootPackage.version } : {}),
          },
        ],
      },
    },
    components: [...components.values()].sort((a, b) =>
      a["bom-ref"].localeCompare(b["bom-ref"]),
    ),
    dependencies: [
      { ref: rootReference, dependsOn: [...rootDependencies].sort() },
      ...[...dependencyGraph.entries()]
        .filter(([ref]) => ref !== rootReference)
        .map(([ref, dependencies]) => ({
          ref,
          dependsOn: [...dependencies].sort(),
        }))
        .sort((a, b) => a.ref.localeCompare(b.ref)),
    ],
  };
};

export const generateSbom = async (
  rootDir: string,
  outputPath: string,
): Promise<void> => {
  const { stdout } = await execFileAsync(
    "pnpm",
    ["list", "-r", "--prod", "--json", "--depth", "Infinity"],
    { cwd: rootDir, maxBuffer: 64 * 1024 * 1024 },
  );
  const packages = JSON.parse(stdout) as PnpmPackage[];
  const sbom = createCycloneDxSbom(packages);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(sbom, null, 2)}\n`);
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const outputPath = path.resolve(
    rootDir,
    process.argv[2] ?? "artifacts/sbom.cdx.json",
  );
  await generateSbom(rootDir, outputPath);
  console.info(
    `CycloneDX SBOM written to ${path.relative(rootDir, outputPath)}.`,
  );
}
