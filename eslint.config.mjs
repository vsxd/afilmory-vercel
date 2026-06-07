// @ts-check
import { globalIgnores } from "eslint/config";
import { defineConfig } from "eslint-config-hyoban";

import checkI18nJson from "./plugins/eslint/eslint-check-i18n-json.js";
import recursiveSort from "./plugins/eslint/eslint-recursive-sort.js";

// In flat config, some large generated folders slipped through. To be extra safe,
// put ignores in a top-level config object first, then append the rest.
const rootIgnores = globalIgnores([
  "apps/ssr/src/index.html.ts",
  "apps/ssr/public/**",
  "apps/web/public/**",
  "packages/webgl-viewer/bump.config.js",
  "packages/webgl-viewer/vite.config.js",
  "packages/webgl-viewer/src/DebugInfo.js",
  "packages/webgl-viewer/src/ImageViewerEngineBase.js",
  "packages/webgl-viewer/src/WebGLImageViewer.js",
  "packages/webgl-viewer/src/WebGLImageViewerEngine.js",
  "packages/webgl-viewer/src/constants.js",
  "packages/webgl-viewer/src/enum.js",
  "packages/webgl-viewer/src/index.js",
  "packages/webgl-viewer/src/interface.js",
  "packages/webgl-viewer/src/shaders.js",
]);

const restrictedImports = {
  paths: [
    {
      name: "zustand",
      message: "UI state uses Jotai in this app.",
    },
    {
      name: "zustand/shallow",
      message: "Use a local equality helper with Jotai selectors.",
    },
    {
      name: "@afilmory/data",
      message: "Use @afilmory/schema or @afilmory/media.",
    },
    {
      name: "~/data-runtime/photo-loader",
      message:
        "Use AppRuntime PhotoRepository instead of a module singleton.",
    },
    {
      name: "~/lib/jotai",
      importNames: ["jotaiStore", "createAtomAccessor"],
      message: "Use the Provider-scoped Jotai store from AppRuntime.",
    },
    {
      name: "../output-paths.js",
      importNames: ["setBuilderOutputSettings", "getBuilderOutputSettings"],
      message:
        "Use runWithBuilderOutputSettings/getScopedBuilderOutputSettings.",
    },
  ],
  patterns: [
    {
      group: ["zustand/*", "@afilmory/data/*"],
      message: "UI state uses Jotai in this app.",
    },
  ],
};

const hyobanConfig = await defineConfig(
  {
    formatting: false,
    lessOpinionated: true,
    preferESM: false,
    react: true,
    tailwindCSS: true,
  },

  {
    languageOptions: {
      parserOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },

    // TailwindCSS v4 usually has no config file. Silence the plugin's
    // config resolution warning by explicitly disabling auto-resolution.
    settings: {
      tailwindcss: {
        // ESLint plugin will not attempt to resolve tailwind config
        // which avoids repeated "Cannot resolve default tailwindcss config path" warnings.
        config: false,
      },
    },
    rules: {
      "unicorn/no-abusive-eslint-disable": 0,
      "@typescript-eslint/triple-slash-reference": 0,
      "unicorn/prefer-math-trunc": "off",
      "unicorn/no-static-only-class": "off",
      "@eslint-react/no-clone-element": 0,
      // TailwindCSS v4 not support
      "tailwindcss/no-custom-classname": 0,
      "@eslint-react/hooks-extra/no-direct-set-state-in-use-effect": 0,
      // NOTE: Disable this temporarily
      "react-compiler/react-compiler": 0,
      "@typescript-eslint/no-unsafe-function-type": 0,
      // disable react compiler rules for now
      "react-hooks/no-unused-directives": "off",
      "react-hooks/static-components": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/component-hook-factories": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/immutability": "off",
      "react-hooks/globals": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/config": "off",
      "react-hooks/gating": "off",

      "unicorn/no-array-callback-reference": "off",

      "no-console": ["warn", { allow: ["warn", "error"] }],

      "no-restricted-globals": [
        "error",
        {
          name: "location",
          message:
            "Since you don't use the same router instance in electron and browser, you can't use the global location to get the route info. \n\n" +
            "You can use `useLocaltion` or `getReadonlyRoute` to get the route info.",
        },
      ],
      "no-restricted-imports": [
        "error",
        restrictedImports,
      ],
      "no-restricted-properties": [
        "error",
        ...[
          "__CONFIG__",
          "__SITE_CONFIG__",
          "__MANIFEST__",
          "__MANIFEST_URL__",
          "__MANIFEST_PROMISE__",
          "__AFILMORY_STARTUP__",
          "__AFILMORY_CRITICAL_ROUTE_PRELOAD_CLEANUP__",
          "router",
        ].map((property) => ({
          object: "window",
          property,
          message: "Use window.__AFILMORY__ or an explicit runtime service.",
        })),
        {
          object: "globalThis",
          property: "__afilmoryGeocodingRateLimiters",
          message: "Use a scoped builder/geocoding runtime registry.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='window'][property.name=/^__(?!AFILMORY__$)/]",
          message:
            "Browser globals must live under window.__AFILMORY__; do not add new window.__* names.",
        },
        {
          selector:
            "MemberExpression[object.name='globalThis'][property.name=/^__/]",
          message:
            "Do not add globalThis.__* state; use window.__AFILMORY__ or an explicit runtime/service.",
        },
        {
          selector:
            "Identifier[name=/^(setBuilderOutputSettings|getBuilderOutputSettings|getGlobalLoggers|setGlobalLoggers)$/]",
          message:
            "Use scoped builder services instead of legacy global helpers.",
        },
      ],
    },
  },

  // @ts-expect-error
  {
    files: ["locales/**/*.json"],
    plugins: {
      "recursive-sort": recursiveSort,
      "check-i18n-json": checkI18nJson,
    },
    rules: {
      "recursive-sort/recursive-sort": "error",
      "check-i18n-json/valid-i18n-keys": "error",
      "check-i18n-json/no-extra-keys": "error",
    },
  },
  {
    files: ["**/*.tsx"],
    rules: {
      "@stylistic/jsx-self-closing-comp": "error",
    },
  },

  {
    files: ["packages/builder/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedImports.paths,
          patterns: [
            ...restrictedImports.patterns,
            {
              group: ["@afilmory/builder"],
              message:
                "Builder internals should use relative imports instead of importing their own package entrypoints.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...restrictedImports.paths,
            {
              name: "@afilmory/schema",
              message: "UI primitives must not depend on manifest schema.",
            },
          ],
          patterns: [
            ...restrictedImports.patterns,
            {
              group: ["@afilmory/schema/*"],
              message: "UI primitives must not depend on manifest schema.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["apps/web/src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedImports.paths,
          patterns: [
            ...restrictedImports.patterns,
            {
              group: [
                "~/components/*",
                "~/modules/*",
                "~/pages/*",
                "../**/components/*",
                "../**/modules/*",
                "../**/pages/*",
              ],
              message:
                "web lib modules must not depend on feature/component layers.",
            },
          ],
        },
      ],
    },
  },

  // Backend framework isn't React — disable React-specific hooks rule there.
  {
    files: ["be/packages/framework/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },

  // Test files: relax some rules for mock functions
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@eslint-react/dom/no-missing-button-type": "off",
      "@eslint-react/hooks-extra/no-unnecessary-use-prefix": "off",
      "@eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks": "off",
    },
  },

  // Redundant but harmless: keep a local ignore in case this block is used standalone somewhere
  globalIgnores([
    "apps/ssr/src/index.html.ts",
    "apps/ssr/public/**",
    "apps/web/public/**",
  ]),
);

export default [
  // Ensure ignores are applied globally before any other configs
  rootIgnores,
  ...hyobanConfig,
];
