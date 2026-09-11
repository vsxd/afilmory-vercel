import { describe, expect, it } from "vitest";

import { createCycloneDxSbom } from "./generate-sbom";

describe("CycloneDX SBOM", () => {
  it("deduplicates components and records dependency edges", () => {
    const sbom = createCycloneDxSbom([
      {
        name: "@afilmory/monorepo",
        version: "1.0.0",
        dependencies: {
          react: {
            version: "19.2.0",
            dependencies: { scheduler: { version: "0.27.0" } },
          },
        },
      },
      {
        name: "@afilmory/web",
        version: "1.0.0",
        private: true,
        dependencies: { react: { version: "19.2.0" } },
      },
    ]);

    expect(sbom.bomFormat).toBe("CycloneDX");
    expect(
      sbom.components.filter((item) => item.name === "react"),
    ).toHaveLength(1);
    expect(sbom.dependencies).toContainEqual({
      ref: "pkg:npm/react@19.2.0",
      dependsOn: ["pkg:npm/scheduler@0.27.0"],
    });
    expect(sbom.dependencies).toContainEqual({
      ref: "pkg:npm/%40afilmory/web@1.0.0",
      dependsOn: ["pkg:npm/react@19.2.0"],
    });
  });

  it("preserves workspace ownership, linked package types, and optional dependencies", () => {
    const sbom = createCycloneDxSbom([
      { name: "root", version: "1.0.0" },
      {
        name: "web",
        version: "2.0.0",
        private: true,
        dependencies: {
          ui: { version: "link:../ui" },
        },
        optionalDependencies: { native: { version: "3.0.0" } },
      },
      {
        name: "ui",
        version: "1.5.0",
        private: true,
        dependencies: { react: { version: "19.2.0" } },
      },
      {
        name: "builder",
        version: "1.0.0",
        dependencies: { web: { version: "workspace:*" } },
      },
    ]);

    expect(sbom.dependencies).toEqual([
      {
        ref: "pkg:npm/root@1.0.0",
        dependsOn: [
          "pkg:npm/builder@1.0.0",
          "pkg:npm/ui@1.5.0",
          "pkg:npm/web@2.0.0",
        ],
      },
      { ref: "pkg:npm/builder@1.0.0", dependsOn: ["pkg:npm/web@2.0.0"] },
      { ref: "pkg:npm/native@3.0.0", dependsOn: [] },
      { ref: "pkg:npm/react@19.2.0", dependsOn: [] },
      { ref: "pkg:npm/ui@1.5.0", dependsOn: ["pkg:npm/react@19.2.0"] },
      {
        ref: "pkg:npm/web@2.0.0",
        dependsOn: ["pkg:npm/native@3.0.0", "pkg:npm/ui@1.5.0"],
      },
    ]);
    expect(sbom.components.find(({ name }) => name === "web")?.type).toBe(
      "application",
    );
    expect(sbom.components.find(({ name }) => name === "ui")?.type).toBe(
      "application",
    );
    expect(sbom.components.some(({ name }) => name === "root")).toBe(false);
  });

  it("uses one unversioned identity for workspaces and their links", () => {
    const sbom = createCycloneDxSbom([
      {
        name: "root",
        dependencies: { "@afilmory/schema": { version: "workspace:*" } },
      },
      {
        name: "web",
        version: "1.0.0",
        dependencies: { "@afilmory/schema": { version: "link:../schema" } },
      },
      {
        name: "@afilmory/schema",
        private: true,
        dependencies: { zod: { version: "4.0.0" } },
      },
    ]);

    expect(sbom.metadata.component).toEqual({
      "bom-ref": "pkg:npm/root",
      name: "root",
      purl: "pkg:npm/root",
      type: "application",
    });
    expect(
      sbom.components.filter(({ name }) => name === "@afilmory/schema"),
    ).toEqual([
      {
        "bom-ref": "pkg:npm/%40afilmory/schema",
        name: "@afilmory/schema",
        purl: "pkg:npm/%40afilmory/schema",
        type: "application",
      },
    ]);
    expect(sbom.dependencies).toEqual([
      {
        ref: "pkg:npm/root",
        dependsOn: ["pkg:npm/%40afilmory/schema", "pkg:npm/web@1.0.0"],
      },
      {
        ref: "pkg:npm/%40afilmory/schema",
        dependsOn: ["pkg:npm/zod@4.0.0"],
      },
      {
        ref: "pkg:npm/web@1.0.0",
        dependsOn: ["pkg:npm/%40afilmory/schema"],
      },
      { ref: "pkg:npm/zod@4.0.0", dependsOn: [] },
    ]);
  });
});
