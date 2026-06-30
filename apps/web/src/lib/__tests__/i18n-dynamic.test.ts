import type { i18n as I18nInstance } from "i18next";
import { describe, expect, it, vi } from "vitest";

import { translateDynamicKey } from "../i18n-dynamic";

interface FakeI18n {
  language: string;
  getResource: ReturnType<typeof vi.fn>;
  services: {
    interpolator: {
      interpolate: ReturnType<typeof vi.fn>;
    };
  };
}

function makeI18n(resource: unknown, language = "en"): FakeI18n {
  return {
    language,
    getResource: vi.fn(() => resource),
    services: {
      interpolator: {
        interpolate: vi.fn(
          (template: string, options: Record<string, unknown>) =>
            // Trivial stand-in interpolation: replace {{name}} tokens.
            template.replaceAll(/\{\{(\w+)\}\}/g, (_m, k: string) =>
              String(options[k] ?? `{{${k}}}`),
            ),
        ),
      },
    },
  };
}

const asI18n = (fake: FakeI18n): I18nInstance => fake as never;

describe("translateDynamicKey", () => {
  it("interpolates the resolved string resource with the provided options", () => {
    const i18n = makeI18n("Hello {{name}}");

    const result = translateDynamicKey(asI18n(i18n), "greeting", {
      name: "World",
    });

    expect(result).toBe("Hello World");
    expect(i18n.getResource).toHaveBeenCalledWith("en", "app", "greeting");
    expect(i18n.services.interpolator.interpolate).toHaveBeenCalledWith(
      "Hello {{name}}",
      { name: "World" },
      "en",
      {},
    );
  });

  it("uses the default 'app' namespace and empty options when omitted", () => {
    const i18n = makeI18n("static text");

    const result = translateDynamicKey(asI18n(i18n), "some.key");

    expect(result).toBe("static text");
    expect(i18n.getResource).toHaveBeenCalledWith("en", "app", "some.key");
    expect(i18n.services.interpolator.interpolate).toHaveBeenCalledWith(
      "static text",
      {},
      "en",
      {},
    );
  });

  it("passes a custom namespace through to getResource", () => {
    const i18n = makeI18n("from custom ns");

    translateDynamicKey(asI18n(i18n), "label", {}, "errors");

    expect(i18n.getResource).toHaveBeenCalledWith("en", "errors", "label");
  });

  it("falls back to the key as template when the resource is not a string", () => {
    // undefined resource (missing key)
    const missing = makeI18n();
    expect(translateDynamicKey(asI18n(missing), "missing.key")).toBe(
      "missing.key",
    );
    expect(missing.services.interpolator.interpolate).toHaveBeenCalledWith(
      "missing.key",
      {},
      "en",
      {},
    );

    // non-string resource (e.g. an object/array of nested keys)
    const objectResource = makeI18n({ nested: "value" });
    expect(translateDynamicKey(asI18n(objectResource), "branch")).toBe(
      "branch",
    );

    // numeric resource is also treated as "not a string"
    const numberResource = makeI18n(42);
    expect(translateDynamicKey(asI18n(numberResource), "count")).toBe("count");
  });

  it("still interpolates tokens when falling back to the key template", () => {
    const i18n = makeI18n();

    const result = translateDynamicKey(asI18n(i18n), "items.{{n}}", { n: 3 });

    expect(result).toBe("items.3");
  });

  it("uses the i18n instance's current language for interpolation", () => {
    const i18n = makeI18n("Bonjour {{name}}", "fr");

    translateDynamicKey(asI18n(i18n), "greeting", { name: "Marie" });

    expect(i18n.getResource).toHaveBeenCalledWith("fr", "app", "greeting");
    expect(i18n.services.interpolator.interpolate).toHaveBeenCalledWith(
      "Bonjour {{name}}",
      { name: "Marie" },
      "fr",
      {},
    );
  });
});
