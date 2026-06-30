/**
 * Writes a minimal, valid empty manifest to `generated/photos-manifest.json`
 * so that lint / type-check / build can run in CI without S3 credentials or a
 * real builder pass. Replaces the previous inline heredoc in the workflow.
 *
 * For the e2e job a richer, real-data fixture is used instead — see
 * `apps/web/e2e/fixtures/photos-manifest.json`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createManifest } from "@afilmory/schema";

const outDir = path.resolve(process.cwd(), "generated");
const outFile = path.join(outDir, "photos-manifest.json");

mkdirSync(outDir, { recursive: true });
writeFileSync(
  outFile,
  `${JSON.stringify(
    createManifest({ generatedAt: "1970-01-01T00:00:00.000Z" }),
  )}\n`,
);

// eslint-disable-next-line no-console
console.log(`Wrote CI manifest fixture to ${outFile}`);
