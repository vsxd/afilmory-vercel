/* eslint-disable no-console */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Metric = "branches" | "functions" | "lines" | "statements";

interface CoverageMetric {
  covered: number;
  total: number;
}

type FileCoverage = Record<Metric, CoverageMetric>;
type CoverageSummary = Record<string, FileCoverage>;

interface Partition {
  matches: (normalizedPath: string) => boolean;
  minimum: Record<Metric, number>;
}

// Vitest 4 AST-remapping baselines are recorded in docs/testing.md.
const PARTITIONS: Record<string, Partition> = {
  web: {
    matches: (file) => file.includes("/apps/web/src/"),
    minimum: { branches: 59, functions: 70, lines: 68, statements: 68 },
  },
  "web-build": {
    matches: (file) =>
      file.includes("/apps/web/plugins/") ||
      file.includes("/apps/web/scripts/"),
    minimum: { branches: 53, functions: 60, lines: 60, statements: 59 },
  },
  builder: {
    matches: (file) => file.includes("/packages/builder/src/"),
    minimum: { branches: 68, functions: 82, lines: 75, statements: 75 },
  },
  webgl: {
    matches: (file) => file.includes("/packages/webgl-viewer/src/"),
    minimum: { branches: 70, functions: 79, lines: 78, statements: 78 },
  },
  shared: {
    matches: (file) =>
      file.includes("/packages/") &&
      !file.includes("/packages/builder/") &&
      !file.includes("/packages/webgl-viewer/"),
    minimum: { branches: 75, functions: 72, lines: 70, statements: 70 },
  },
};

export const checkCoveragePartitions = (
  summary: CoverageSummary,
): { issues: string[]; report: string[] } => {
  const issues: string[] = [];
  const report: string[] = [];
  const files = Object.entries(summary).filter(([file]) => file !== "total");

  for (const [name, partition] of Object.entries(PARTITIONS)) {
    const partitionFiles = files.filter(([file]) =>
      partition.matches(file.replaceAll("\\", "/")),
    );
    if (partitionFiles.length === 0) {
      issues.push(`${name}: no coverage files matched`);
      continue;
    }
    for (const metric of [
      "statements",
      "branches",
      "functions",
      "lines",
    ] as const) {
      const totals = partitionFiles.reduce(
        (result, [, coverage]) => ({
          covered: result.covered + coverage[metric].covered,
          total: result.total + coverage[metric].total,
        }),
        { covered: 0, total: 0 },
      );
      const percent =
        totals.total === 0 ? 100 : (totals.covered / totals.total) * 100;
      const minimum = partition.minimum[metric];
      report.push(
        `${name}.${metric}: ${percent.toFixed(2)}% (min ${minimum}%)`,
      );
      if (percent + Number.EPSILON < minimum) {
        issues.push(
          `${name}.${metric} is ${percent.toFixed(2)}%, below ${minimum}%`,
        );
      }
    }
  }
  return { issues, report };
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const summary = JSON.parse(
    await fs.readFile(
      path.join(rootDir, "coverage/coverage-summary.json"),
      "utf-8",
    ),
  ) as CoverageSummary;
  const { issues, report } = checkCoveragePartitions(summary);
  console.info(report.join("\n"));
  if (issues.length > 0) {
    console.error(issues.map((issue) => `- ${issue}`).join("\n"));
    process.exitCode = 1;
  }
}
