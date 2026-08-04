export interface PrecacheManifestEntry {
  url: string;
  revision: string | null;
  size: number;
}

const criticalBuildFiles = new Set<string>();

const normalizeFileName = (value: string): string => value.replace(/^\/+/, "");

export function setCriticalPrecacheFiles(files: Iterable<string>): void {
  criticalBuildFiles.clear();
  for (const file of files) criticalBuildFiles.add(normalizeFileName(file));
}

export function getCriticalPrecacheFiles(): ReadonlySet<string> {
  return criticalBuildFiles;
}

const isRequiredShellAsset = (url: string): boolean =>
  url === "index.html" ||
  url === "manifest.webmanifest" ||
  /^assets\/index\.[^/]+\.css$/.test(url) ||
  /^(?:favicon\.ico|masked-icon\.svg|apple-touch-icon\.png|android-chrome-\d+x\d+\.png)$/.test(
    url,
  ) ||
  /^assets\/gallery-index\.[\da-f]+\.json$/.test(url);

export function filterCriticalPrecacheManifest(
  entries: PrecacheManifestEntry[],
  // Vite 8's Rolldown output is slightly larger before transfer compression.
  // Keep a small amount of headroom for the static shell without weakening the
  // separate gzip budgets enforced by the dependency-chunks plugin.
  rawByteBudget = 1_800 * 1024,
): { manifest: PrecacheManifestEntry[]; warnings: string[] } {
  if (criticalBuildFiles.size === 0) {
    throw new Error(
      "Critical precache graph was not registered before Workbox manifest generation.",
    );
  }

  const manifest = entries.filter((entry) => {
    const url = normalizeFileName(entry.url);
    return criticalBuildFiles.has(url) || isRequiredShellAsset(url);
  });
  const totalBytes = manifest.reduce((total, entry) => total + entry.size, 0);
  if (totalBytes > rawByteBudget) {
    throw new Error(
      `PWA critical precache is ${(totalBytes / 1024).toFixed(1)} KiB; budget is ${(rawByteBudget / 1024).toFixed(0)} KiB.`,
    );
  }

  return { manifest, warnings: [] };
}
