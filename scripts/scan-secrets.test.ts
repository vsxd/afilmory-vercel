import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findSecretFindings, scanRepositoryForSecrets } from "./scan-secrets";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("secret scanner", () => {
  it("detects high-confidence provider tokens without returning their value", () => {
    const token = ["ghp_", "a".repeat(40)].join("");
    expect(findSecretFindings(`TOKEN=${token}`)).toEqual([
      { line: 1, rule: "github-token" },
    ]);
  });

  it("supports a narrow line-level allow marker for synthetic fixtures", () => {
    const token = ["AKIA", "A".repeat(16)].join("");
    expect(
      findSecretFindings(`${token} // secret-scan: allow -- synthetic test`),
    ).toEqual([]);
  });

  it("does not flag empty template assignments or ordinary prose", () => {
    expect(
      findSecretFindings(
        "REPO_TOKEN=\nUse a least-privilege repository token.",
      ),
    ).toEqual([]);
  });

  it("scans a working tree with deleted tracked files and newly added source", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "afilmory-secrets-"));
    temporaryDirectories.push(root);
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    await fs.writeFile(path.join(root, "deleted.ts"), "export {};");
    await fs.mkdir(path.join(root, "removed-directory"));
    await fs.writeFile(
      path.join(root, "removed-directory/old.ts"),
      "export {};",
    );
    execFileSync("git", ["add", "."], { cwd: root });
    await fs.rm(path.join(root, "deleted.ts"));
    await fs.rm(path.join(root, "removed-directory"), { recursive: true });
    await fs.writeFile(
      path.join(root, "removed-directory"),
      "now a regular file",
    );

    const token = ["ghp_", "a".repeat(40)].join("");
    await fs.writeFile(path.join(root, "new.ts"), `TOKEN=${token}`);
    await fs.writeFile(path.join(root, ".gitignore"), "ignored.env\n");
    await fs.writeFile(path.join(root, "ignored.env"), token);
    await fs.writeFile(
      path.join(root, "binary.bin"),
      Buffer.from(`\0${token}`),
    );
    await fs.symlink("new.ts", path.join(root, "linked.ts"));

    await expect(scanRepositoryForSecrets(root)).resolves.toEqual([
      { file: "new.ts", line: 1, rule: "github-token" },
    ]);
  });
});
