import { describe, expect, it } from "vitest";

import type { BuilderConfig } from "../types/config.js";
import {
  createSerializableBuilderConfigForWorker,
  toSerializablePluginConfigEntry,
} from "./serializable.js";
import type {
  BuilderPlugin,
  BuilderPluginConfigEntry,
  BuiltinBuilderPluginDescriptor,
} from "./types.js";

describe("toSerializablePluginConfigEntry", () => {
  it("returns a string plugin specifier unchanged", () => {
    const entry = "@afilmory/plugin-foo";
    expect(toSerializablePluginConfigEntry(entry)).toBe(entry);
  });

  it("returns a built-in geocoding descriptor by identity", () => {
    const entry: BuiltinBuilderPluginDescriptor = { plugin: "geocoding" };
    expect(toSerializablePluginConfigEntry(entry)).toBe(entry);
  });

  it("preserves descriptor options and name on a built-in descriptor", () => {
    const entry: BuiltinBuilderPluginDescriptor = {
      plugin: "geocoding",
      name: "geo",
      options: { provider: "nominatim" },
    };
    expect(toSerializablePluginConfigEntry(entry)).toBe(entry);
  });

  it("throws for a zero-arg ESM importer function", () => {
    const importer: BuilderPluginConfigEntry = () =>
      Promise.resolve({ default: { name: "x" } as BuilderPlugin });

    expect(() => toSerializablePluginConfigEntry(importer)).toThrow(
      /Cluster mode cannot serialize plugin importer functions/,
    );
  });

  it("returns the declared serializablePluginReference for an inline plugin", () => {
    const reference: BuiltinBuilderPluginDescriptor = { plugin: "geocoding" };
    const inline: BuilderPlugin = {
      name: "my-inline",
      hooks: {},
      serializablePluginReference: reference,
    };

    // It returns the *reference*, not the original inline object.
    expect(toSerializablePluginConfigEntry(inline)).toBe(reference);
  });

  it("throws and quotes the plugin name for a named inline plugin without a reference", () => {
    const inline: BuilderPlugin = { name: "my-inline", hooks: {} };

    expect(() => toSerializablePluginConfigEntry(inline)).toThrow(
      /Cluster mode cannot serialize inline plugin "my-inline"\./,
    );
  });

  it("throws with a generic message for an anonymous inline plugin without a reference", () => {
    const inline: BuilderPlugin = { hooks: {} };

    expect(() => toSerializablePluginConfigEntry(inline)).toThrow(
      /Cluster mode cannot serialize inline plugin\. Use a string/,
    );
  });

  it("documents that a non-zero-arity factory function falls through to the inline-plugin error using its function name", () => {
    // A factory like (opts) => plugin has arity > 0, so it is NOT detected as
    // an ESM importer. It is not a string/descriptor either, so it falls to the
    // generic inline-plugin branch where `entry.name` resolves to the function
    // name. This is not a valid config-entry type, but the runtime guards it.
    function namedFactory(_opts: unknown): BuilderPlugin {
      return { name: "from-factory" };
    }

    expect(() =>
      toSerializablePluginConfigEntry(namedFactory as never),
    ).toThrow(/inline plugin "namedFactory"/);
  });
});

describe("createSerializableBuilderConfigForWorker", () => {
  function baseConfig(plugins: BuilderPluginConfigEntry[]): BuilderConfig {
    return {
      system: { marker: "system" } as never,
      user: { marker: "user" } as never,
      output: {
        manifestPath: "/tmp/manifest.json",
        thumbnailsDir: "/tmp/thumbs",
        originalsDir: "/tmp/originals",
      },
      plugins,
    };
  }

  it("maps every plugin entry through toSerializablePluginConfigEntry", () => {
    const descriptor: BuiltinBuilderPluginDescriptor = { plugin: "geocoding" };
    const reference: BuiltinBuilderPluginDescriptor = { plugin: "geocoding" };
    const inline: BuilderPlugin = {
      name: "inline",
      serializablePluginReference: reference,
    };
    const config = baseConfig(["string-plugin", descriptor, inline]);

    const result = createSerializableBuilderConfigForWorker(config);

    expect(result.plugins).toEqual(["string-plugin", descriptor, reference]);
  });

  it("preserves the other config fields (shallow) and produces fresh containers", () => {
    const config = baseConfig([]);

    const result = createSerializableBuilderConfigForWorker(config);

    // New top-level object and new plugins array...
    expect(result).not.toBe(config);
    expect(result.plugins).not.toBe(config.plugins);
    // ...but the untouched fields are carried over by reference (shallow spread).
    expect(result.system).toBe(config.system);
    expect(result.user).toBe(config.user);
    expect(result.output).toBe(config.output);
  });

  it("does not mutate the source config", () => {
    const descriptor: BuiltinBuilderPluginDescriptor = { plugin: "geocoding" };
    const config = baseConfig(["a", descriptor]);

    createSerializableBuilderConfigForWorker(config);

    expect(config.plugins).toEqual(["a", descriptor]);
  });

  it("propagates the error when a plugin entry cannot be serialized", () => {
    const importer: BuilderPluginConfigEntry = () =>
      Promise.resolve({ default: {} as BuilderPlugin });
    const config = baseConfig(["ok", importer]);

    expect(() => createSerializableBuilderConfigForWorker(config)).toThrow(
      /Cluster mode cannot serialize plugin importer functions/,
    );
  });
});
