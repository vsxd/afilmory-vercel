import { describe, expect, it } from "vitest";

import type { BuilderConfigInput } from "../types/config.js";
import { defineBuilderConfig } from "./helper.js";

const sampleConfig: BuilderConfigInput = {
  output: { manifestPath: "generated/photos-manifest.json" },
};

describe("defineBuilderConfig", () => {
  it("returns a plain config object as-is", () => {
    expect(defineBuilderConfig(sampleConfig)).toBe(sampleConfig);
  });

  it("invokes a factory function and returns its result", () => {
    expect(defineBuilderConfig(() => sampleConfig)).toBe(sampleConfig);
  });

  it("calls the factory exactly once", () => {
    let calls = 0;
    const factory = () => {
      calls += 1;
      return sampleConfig;
    };
    defineBuilderConfig(factory);
    expect(calls).toBe(1);
  });
});
