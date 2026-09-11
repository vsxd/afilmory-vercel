/* eslint-disable no-console */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_SCANNED_FILE_BYTES = 1024 * 1024;
const ALLOW_MARKER = "secret-scan: allow";

const SECRET_PATTERNS = [
  {
    id: "private-key",
    pattern: /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/,
  },
  {
    id: "github-token",
    pattern: /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{60,})/,
  },
  { id: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { id: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
  {
    id: "credentialed-url",
    pattern: /https?:\/\/[^\s/:@]+:[^\s/@]{8,}@/i,
  },
  {
    id: "assigned-secret",
    pattern:
      /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|secret[_-]?key)\s*[:=]\s*["'][\w+/=-]{24,}["']/i,
  },
] as const;

export interface SecretFinding {
  line: number;
  rule: string;
}

export const findSecretFindings = (content: string): SecretFinding[] => {
  const findings: SecretFinding[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (line.includes(ALLOW_MARKER)) continue;
    for (const { id, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) findings.push({ line: index + 1, rule: id });
    }
  }
  return findings;
};

const trackedFiles = async (rootDir: string): Promise<string[]> => {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: rootDir, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout.toString("utf-8").split("\0").filter(Boolean);
};

export const scanRepositoryForSecrets = async (
  rootDir: string,
): Promise<Array<SecretFinding & { file: string }>> => {
  const findings: Array<SecretFinding & { file: string }> = [];
  for (const relativePath of await trackedFiles(rootDir)) {
    const filePath = path.join(rootDir, relativePath);
    // `git ls-files --cached` includes tracked files deleted in the working
    // tree. Skip those while still surfacing permission and I/O failures.
    const stats = await fs
      .lstat(filePath)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
        throw error;
      });
    if (!stats?.isFile() || stats.size > MAX_SCANNED_FILE_BYTES) continue;
    const bytes = await fs.readFile(filePath);
    if (bytes.subarray(0, 8192).includes(0)) continue;
    for (const finding of findSecretFindings(bytes.toString("utf-8"))) {
      findings.push({ ...finding, file: relativePath });
    }
  }
  return findings;
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const findings = await scanRepositoryForSecrets(rootDir);
  if (findings.length > 0) {
    console.error(
      "Potential secrets found (values are intentionally redacted):",
    );
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
    }
    process.exitCode = 1;
  } else {
    console.info("No high-confidence secret patterns found.");
  }
}
