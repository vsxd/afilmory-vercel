import { describe, expect, it } from "vitest";

import {
  PUBLIC_STYLE_UTILITIES,
  validateCompiledUtilities,
  validateStyleSources,
} from "./style-contract";

const css = (content: string) => ({ path: "src/styles/example.css", content });
const component = (content: string) => ({ path: "src/Example.tsx", content });

describe("owned style contracts", () => {
  it("reports CSS syntax errors with the source path", () => {
    expect(validateStyleSources([css(".af-card { color: red;")])).toEqual([
      expect.objectContaining({
        path: "src/styles/example.css",
        line: 1,
        message: expect.stringContaining("Unclosed block"),
      }),
    ]);
  });

  it("finds direct self references including nested fallback references", () => {
    const diagnostics = validateStyleSources([
      css(
        ":root {\n--font-serif: Georgia, var(--font-serif);\n--panel: var(--theme, var(--panel));\n}",
      ),
    ]);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      line: 2,
      message: expect.stringContaining(
        "--font-serif directly references itself",
      ),
    });
    expect(diagnostics[1]?.message).toContain(
      "--panel directly references itself",
    );
  });

  it("allows distinct fallbacks and ignores apparent references in strings/comments", () => {
    expect(
      validateStyleSources([
        css(`:root {
      --font-serif: Georgia, var(--font-fallback, serif);
      --literal: "var(--literal)";
      --escaped: 'it\\'s var(--escaped)';
      --comment: red /* var(--comment) */;
    }`),
      ]),
    ).toEqual([]);
  });

  it.each([
    "transition: all 150ms ease",
    "transition: opacity 100ms, all 200ms cubic-bezier(0, 0, 1, 1)",
    "transition-property: opacity, ALL",
    "-webkit-transition: all 1s",
  ])("rejects broad transitions: %s", (declaration) => {
    expect(
      validateStyleSources([css(`.af-control { ${declaration}; }`)]),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(
          "Name transition properties explicitly",
        ),
      }),
    ]);
  });

  it("allows named transitions and does not match all inside functions or data", () => {
    expect(
      validateStyleSources([
        css(`.af-control {
      transition: color var(--all-duration), transform 200ms steps(2, jump-end);
      transition-property: opacity, transform;
      content: "transition: all";
    }`),
      ]),
    ).toEqual([]);
  });

  it("checks static class names, composed local constants and conditional branches", () => {
    const diagnostics = validateStyleSources(
      [css(".af-panel:hover { color: red; }")],
      [
        component(`
      const base = "af-panel flex";
      const classes = clsxm(base, active && "af-missing", ["af-other"], { "af-hidden": hidden });
      export const Card = () => <div className={classes} />;
    `),
      ],
    );
    expect(diagnostics.map((item) => item.message)).toEqual([
      expect.stringContaining(".af-missing"),
      expect.stringContaining(".af-other"),
      expect.stringContaining(".af-hidden"),
    ]);
  });

  it("does not mistake comments, data attributes, selectors or dynamic class fragments for recipe use", () => {
    const source = `
      // className="af-comment"
      const selector = ".af-selector";
      const content = "af-copy";
      export const Card = ({ kind, className }) => <div
        data-name="af-identifier"
        className={clsxm(\`af-panel af-\${kind} af-card-\${kind}\`, className)}
      />;
    `;
    expect(
      validateStyleSources([css(".af-panel {}")], [component(source)]),
    ).toEqual([]);
  });

  it("does not treat quoted selector data as a recipe definition", () => {
    expect(
      validateStyleSources(
        [css('[data-example=".af-missing"] {}')],
        [component('<div className="af-missing" />')],
      ),
    ).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("Undefined recipe .af-missing"),
      }),
    ]);
  });

  it.each(["styles", "{ styles }", "[styles]"])(
    "skips ambiguous shadowed %s bindings instead of reporting an unrelated constant",
    (parameter) => {
      expect(
        validateStyleSources(
          [],
          [
            component(`
      const styles = "af-unrelated";
      function Card(${parameter}) { return <div className={styles} />; }
    `),
          ],
        ),
      ).toEqual([]);
    },
  );

  it("deduplicates undefined recipes per source and handles constant cycles", () => {
    expect(
      validateStyleSources(
        [],
        [
          component(`
      const first = second;
      const second = first;
      <><div className={first} /><div className="af-missing af-missing" /></>;
    `),
        ],
      ),
    ).toHaveLength(1);
  });
});

describe("compiled public utilities", () => {
  const compiled = Object.entries(PUBLIC_STYLE_UTILITIES)
    .map(([name, property]) => `.${name} { ${property}: var(--example); }`)
    .join("\n");

  it("accepts generated utility declarations without locking their values", () => {
    expect(validateCompiledUtilities(compiled)).toEqual([]);
  });

  it("rejects missing utilities and matching selectors with the wrong property", () => {
    const incomplete = compiled
      .replace(".cursor-menu { cursor:", ".cursor-menu { color:")
      .replace(".text-ui-secondary", ".text-ui-secondary-missing");
    expect(validateCompiledUtilities(incomplete)).toEqual([
      ".text-ui-secondary did not generate a color declaration.",
      ".cursor-menu did not generate a cursor declaration.",
    ]);
  });
});
